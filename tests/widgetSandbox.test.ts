/** @jest-environment jsdom */
const mockLoadWidgetServices = jest.fn();
jest.mock('../ui/widgets/rendering/widgetServices', () => ({
  loadWidgetServices: (...args: unknown[]) => mockLoadWidgetServices(...args)
}));
import { buildWidgetView, mountSandboxWidget, sandboxDocument } from '../ui/widgets/rendering/widgetSandbox';

class MockPort {
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  postMessage = jest.fn();
  close = jest.fn();
  start = jest.fn();
  receive(data: unknown) { return this.onmessage?.({ data } as MessageEvent); }
}

class MockMessageChannel {
  static instances: MockMessageChannel[] = [];
  port1 = new MockPort();
  port2 = new MockPort();
  constructor() { MockMessageChannel.instances.push(this); }
}

const services = {
  refresh: jest.fn(async () => {}), request: jest.fn(async () => ({})),
  draft: { get: jest.fn(), set: jest.fn() },
  preferences: { get: jest.fn(), set: jest.fn() }, dispose: jest.fn()
};

async function settleSetup() {
  for (let index = 0; index < 5; index++) await Promise.resolve();
}

function successfulResponse() {
  return {
    ok: true,
    headers: { get: (name: string) => name === 'X-Blogposter-Widget-Contract' ? '2'
      : name === 'X-Blogposter-Widget-Code-Hash' ? 'a'.repeat(64) : null },
    text: async () => 'function render() {}'
  };
}

beforeEach(() => {
  document.body.replaceChildren();
  (window as any).NONCE = 'testNonce';
  (globalThis as any).MessageChannel = MockMessageChannel;
  (AbortSignal as any).timeout = jest.fn(() => new AbortController().signal);
  MockMessageChannel.instances = [];
  jest.clearAllMocks();
  mockLoadWidgetServices.mockResolvedValue(services);
  globalThis.fetch = jest.fn(async () => successfulResponse()) as any;
});

afterEach(() => {
  jest.useRealTimers();
  delete (window as any).NONCE;
});

test('UI bridge builds inert controls with existing classes', () => {
  const view = buildWidgetView({tag:'div',children:[{tag:'button',text:'Load',action:'load'},{tag:'input',name:'query',type:'text'}]});
  expect(view.querySelector('button')?.type).toBe('button');
  expect(view.querySelector('button')?.dataset.widgetAction).toBe('load');
  expect(view.querySelector('button')?.className).toBe('button secondary sm');
  expect(view.querySelector('input')?.className).toBe('');
});

test.each(['script','iframe','img','a','form','style','object','link','svg','video'])('UI bridge rejects active or network-bearing %s nodes', tag => {
  expect(() => buildWidgetView({tag})).toThrow('WIDGET_VIEW_INVALID');
});

test('UI bridge ignores executable attributes and bounds content', () => {
  const element = buildWidgetView({tag:'div',text:'<img src=/leak>',style:'background:url(/leak)',onclick:'alert(1)'} as any);
  expect(element.childElementCount).toBe(0);
  expect(element.attributes.length).toBe(0);
  expect(() => buildWidgetView({tag:'p',text:'x'.repeat(16385)})).toThrow('WIDGET_VIEW_TEXT_LIMIT');
  expect(() => buildWidgetView({tag:'div',children:Array.from({length:501},()=>({tag:'span'}))})).toThrow('WIDGET_VIEW_INVALID');
});

test('UI bridge restores select values after building the options', () => {
  const select = buildWidgetView({tag:'select',value:'second',children:[{tag:'option',value:'first',text:'First'},{tag:'option',value:'second',text:'Second'}]}) as HTMLSelectElement;
  expect(select.value).toBe('second');
});

test('isolated bridge denies network and uses a worker without DOM access', () => {
  const html = sandboxDocument('testNonce');
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain("frame-src 'none'");
  expect(html).toContain('new Worker(url)');
  expect(html).not.toContain('allow-same-origin');
});

test('keeps the isolation frame stable while its connected widget host is reparented', async () => {
  const firstParent = document.body.appendChild(document.createElement('section'));
  const secondParent = document.body.appendChild(document.createElement('section'));
  const host = firstParent.appendChild(document.createElement('div'));
  const ready = mountSandboxWidget(host, 'probe', '/widgets/probe/widget.js', {});
  await settleSetup();

  const frame = document.body.querySelector('iframe')!;
  expect(frame.parentElement).toBe(document.body);
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  expect(frame.srcdoc).toContain("script-src 'nonce-testNonce' blob:");
  expect(host.querySelector('iframe')).toBeNull();
  await MockMessageChannel.instances[0].port1.receive({ type: 'view', tree: { tag: 'p', text: 'Widget ready' } });
  await ready;

  secondParent.appendChild(host);
  await Promise.resolve();
  expect(frame.isConnected).toBe(true);
  expect(host.textContent).toBe('Widget ready');
  expect(services.dispose).not.toHaveBeenCalled();

  host.remove();
  await Promise.resolve();
  expect(services.dispose).toHaveBeenCalledTimes(1);
  expect(frame.isConnected).toBe(false);
  expect(MockMessageChannel.instances[0].port1.close).toHaveBeenCalledTimes(1);
  expect(MockMessageChannel.instances[0].port2.close).toHaveBeenCalledTimes(1);
});

test('supports detached startup and disposes when the mounted view is replaced', async () => {
  const host = document.createElement('div');
  const ready = mountSandboxWidget(host, 'probe', '/widgets/probe/widget.js', {});
  await settleSetup();
  const frame = document.body.querySelector('iframe')!;
  expect(frame.isConnected).toBe(true);
  expect(services.dispose).not.toHaveBeenCalled();

  document.body.append(host);
  await MockMessageChannel.instances[0].port1.receive({ type: 'view', tree: { tag: 'p', text: 'Ready' } });
  await ready;
  host.replaceChildren(document.createElement('span'));
  await Promise.resolve();

  expect(services.dispose).toHaveBeenCalledTimes(1);
  expect(frame.isConnected).toBe(false);
});

test('reports the timeout error while fully disposing a live nonresponsive worker', async () => {
  jest.useFakeTimers();
  const host = document.body.appendChild(document.createElement('div'));
  const ready = mountSandboxWidget(host, 'probe', '/widgets/probe/widget.js', {});
  const rejection = expect(ready).rejects.toThrow('WIDGET_SANDBOX_TIMEOUT');
  await settleSetup();

  await jest.advanceTimersByTimeAsync(12000);
  await rejection;
  expect(host.querySelector('[data-error-code="WIDGET_SANDBOX_TIMEOUT"]')).not.toBeNull();
  expect(services.dispose).toHaveBeenCalledTimes(1);
  expect(document.body.querySelector('iframe')).toBeNull();
  expect(MockMessageChannel.instances[0].port1.close).toHaveBeenCalledTimes(1);
});

test('does not count suspended-tab time as missed heartbeat responses', async () => {
  jest.useFakeTimers();
  let visibility: DocumentVisibilityState = 'visible';
  jest.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  const host = document.body.appendChild(document.createElement('div'));
  const ready = mountSandboxWidget(host, 'probe', '/widgets/probe/widget.js', {});
  const rejection = expect(ready).rejects.toThrow('WIDGET_SANDBOX_TIMEOUT');
  await settleSetup();

  await jest.advanceTimersByTimeAsync(10000);
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  await jest.advanceTimersByTimeAsync(60000);
  expect(services.dispose).not.toHaveBeenCalled();

  visibility = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  await jest.advanceTimersByTimeAsync(10000);
  expect(services.dispose).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(2000);
  await rejection;
});
