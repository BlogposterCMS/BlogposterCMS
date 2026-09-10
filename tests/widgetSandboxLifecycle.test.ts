/** @jest-environment jsdom */
import { mountSandboxWidget } from '../ui/widgets/rendering/widgetSandbox';
import { loadWidgetServices } from '../ui/widgets/rendering/widgetServices';

jest.mock('../ui/widgets/rendering/widgetServices', () => ({ loadWidgetServices: jest.fn() }));

class TestPort {
  onmessage: ((event: { data: unknown }) => unknown) | null = null;
  postMessage = jest.fn();
  close = jest.fn();
}
let channel: { port1: TestPort; port2: TestPort };
let hidden = false;
let container: HTMLDivElement;
let disposeServices: jest.Mock;
const originalFetch = globalThis.fetch;
const originalChannel = globalThis.MessageChannel;
const originalTimeout = AbortSignal.timeout;

beforeEach(() => {
  jest.useFakeTimers();
  hidden = false;
  jest.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  globalThis.MessageChannel = class {
    port1 = new TestPort(); port2 = new TestPort();
    constructor() { channel = this; }
  } as any;
  globalThis.fetch = jest.fn(async () => ({ ok: true,
    headers: { get: (key: string) => key.endsWith('Contract') ? '2' : 'a'.repeat(64) },
    text: async () => 'function render() {}'
  })) as any;
  AbortSignal.timeout = () => new AbortController().signal;
  disposeServices = jest.fn();
  (loadWidgetServices as jest.Mock).mockResolvedValue({ dispose: disposeServices });
  container = document.createElement('div'); document.body.append(container);
});
afterEach(async () => {
  container.remove();
  await Promise.resolve(); // The real disconnect observer owns teardown.
  globalThis.fetch = originalFetch; globalThis.MessageChannel = originalChannel;
  AbortSignal.timeout = originalTimeout;
  jest.restoreAllMocks(); jest.useRealTimers();
});

async function mount() {
  const ready = mountSandboxWidget(container, 'fixture', '/widgets/fixture/widget.js', {});
  // Fetch, source reading and reviewed-service loading remain asynchronous.
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await channel.port1.onmessage!({ data: { type: 'connected' } });
  await channel.port1.onmessage!({ data: { type: 'view', tree: { tag: 'p', text: 'Ready', key: 'ready' } } });
  await ready;
}

test('the mounted sandbox retains its iframe and view while hidden, then accepts replies', async () => {
  await mount();
  const frame = container.querySelector('iframe')!;
  const view = container.firstElementChild;
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  jest.advanceTimersByTime(120000);
  hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  await channel.port1.onmessage!({ data: { type: 'pong' } });
  jest.advanceTimersByTime(8000);
  expect(container.querySelector('[data-error-code]')).toBeNull();
  expect(container.querySelector('iframe')).toBe(frame);
  expect(container.firstElementChild).toBe(view);
  expect(disposeServices).not.toHaveBeenCalled();
  container.remove(); await Promise.resolve();
  expect(disposeServices).toHaveBeenCalledTimes(1);
  expect(channel.port1.close).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('a genuinely unresponsive foreground worker is removed through the existing error boundary', async () => {
  await mount();
  jest.advanceTimersByTime(10000);
  expect(container.querySelector('[role="alert"]')?.getAttribute('data-error-code')).toBe('WIDGET_SANDBOX_TIMEOUT');
  expect(container.querySelector('iframe')).toBeNull();
  expect(disposeServices).toHaveBeenCalledTimes(1);
  expect(channel.port1.close).toHaveBeenCalledTimes(1);
});
