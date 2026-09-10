/** @jest-environment jsdom */
import { deserializeLayout, serializeLayout, renderLayoutTree, setContainerSettings, readContainerSettings } from '../ui/shared/layout/layoutDom';
import { normalizeContainerInteraction } from '../ui/shared/layout/containerInteractionModel';
import { mountContainerInteractions } from '../ui/shared/layout/containerInteractions';
import { createContainerInteractionInspector } from '../ui/designer/app/widgets/containerInteractionInspector';
import { bpPopover } from '../ui/shared/overlays/popover';

afterEach(() => { bpPopover.close(); document.body.replaceChildren(); jest.useRealTimers(); });

test('container rules survive Designer save and public rendering without changing styles', () => {
  const draft = document.createElement('div');
  deserializeLayout({ type: 'leaf', nodeId: 'result', settings: { borderColor: '#123456' } }, draft);
  const interaction = { version: 1 as const, presentation: 'popover' as const, triggerId: 'search', triggerEvent: 'input' as const, source: 'publishedArticles' as const };
  setContainerSettings(draft, { interaction });
  const saved = JSON.parse(JSON.stringify(serializeLayout(draft)));
  const live = document.createElement('div');
  const result = renderLayoutTree(saved, live).get('result')!;
  expect(readContainerSettings(result).interaction).toEqual(interaction);
  expect(result.style.borderColor).toBe(draft.style.borderColor);
  setContainerSettings(draft, { interaction: null } as any);
  expect(serializeLayout(draft).settings?.interaction).toBeUndefined();
});

test('popover moves the existing container, closes with Escape and opens again', () => {
  const root = document.createElement('main'); document.body.append(root);
  const trigger = document.createElement('button'); trigger.dataset.instanceId = 'trigger'; trigger.textContent = 'Details';
  const container = document.createElement('section');
  container.dataset.layoutInteraction = JSON.stringify({ version: 1, presentation: 'popover', triggerId: 'trigger' });
  const input = document.createElement('input'); container.append(input); root.append(trigger, container);
  const dispose = mountContainerInteractions(root);
  expect(container.hidden).toBe(true);
  trigger.click(); expect(container.closest('.bp-popover')).not.toBeNull();
  input.value = 'Kept';
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(container.parentNode).toBe(root); expect(container.hidden).toBe(true);
  trigger.click(); expect(container.querySelector('input')).toBe(input); expect(input.value).toBe('Kept');
  dispose(); expect(container.parentNode).toBe(root); expect(container.hidden).toBe(false);
});

test('example data is conditional, isolated from network and respects Chinese composition', async () => {
  jest.useFakeTimers();
  const request = jest.fn(); window.fetch = request;
  const root = document.createElement('main'); document.body.append(root);
  const trigger = document.createElement('input'); trigger.dataset.instanceId = 'query';
  const container = document.createElement('section');
  container.dataset.layoutInteraction = JSON.stringify({ version: 1, presentation: 'normal', triggerId: 'query', triggerEvent: 'input', source: 'sampleArticles', when: { ref: 'state.query', operator: 'notEmpty' } });
  root.append(trigger, container); const dispose = mountContainerInteractions(root);
  expect(container.hidden).toBe(true);
  trigger.value = '中'; trigger.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  expect(container.hidden).toBe(true);
  trigger.value = '中文'; trigger.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await jest.advanceTimersByTimeAsync(220);
  expect(container.hidden).toBe(false);
  expect(container.querySelector('[data-container-data]')?.shadowRoot?.textContent).toContain('Getting started');
  expect(request).not.toHaveBeenCalled(); dispose();
});

test('Designer controls update canonical settings and retain them on reselection', () => {
  const inspector = document.createElement('aside'); document.body.append(inspector);
  let selection: any = { id: 'results' };
  const apply = jest.fn(value => { selection.interaction = value; });
  const panel = createContainerInteractionInspector(inspector, { read: () => selection, targets: () => [{ id: 'query', label: 'Search input' }], apply });
  const change = (key: string, value: string) => {
    const field = inspector.querySelector<HTMLSelectElement>(`[data-interaction-field="${key}"]`)!;
    field.value = value; field.dispatchEvent(new Event('change'));
  };
  panel.sync(); change('enabled', 'yes'); change('presentation', 'popover'); change('triggerId', 'query'); change('triggerEvent', 'input'); change('source', 'publishedArticles'); change('when', 'results');
  expect(selection.interaction).toMatchObject({ presentation: 'popover', triggerId: 'query', triggerEvent: 'input', source: 'publishedArticles', when: { operator: 'notEmpty' } });
  panel.sync(); expect(inspector.querySelector<HTMLSelectElement>('[data-interaction-field="source"]')?.value).toBe('publishedArticles');
});

test('container configuration cannot grant arbitrary modules, network URLs or expressions', () => {
  const base = { version: 1, presentation: 'normal' };
  expect(() => normalizeContainerInteraction({ ...base, source: '/api/admin' })).toThrow('CONTAINER_INTERACTION_SOURCE_INVALID');
  expect(() => normalizeContainerInteraction({ ...base, url: 'https://example.com' })).toThrow('CONTAINER_INTERACTION_INVALID');
  expect(() => normalizeContainerInteraction({ ...base, when: { ref: 'state.constructor.x', operator: 'truthy' } })).toThrow('WIDGET_BINDING_PATH_INVALID');
});


test('query bindings follow existing UI-kit ShadowRoots', async () => {
  jest.useFakeTimers();
  const root = document.createElement('main'); document.body.append(root);
  const trigger = document.createElement('div'); trigger.dataset.instanceId = 'query';
  const shadow = trigger.attachShadow({ mode: 'open' }); const input = document.createElement('input'); shadow.append(input);
  const container = document.createElement('section');
  container.dataset.layoutInteraction = JSON.stringify({ version: 1, presentation: 'popover', triggerId: 'query', queryId: 'query', triggerEvent: 'input', source: 'sampleArticles', when: { ref: 'data.articles.result.items', operator: 'notEmpty' } });
  root.append(trigger, container); const dispose = mountContainerInteractions(root);
  input.value = 'first'; input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  await jest.advanceTimersByTimeAsync(220);
  expect(container.closest('.bp-popover')).not.toBeNull();
  input.value = 'next'; input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  expect(container.hidden).toBe(true);
  await jest.advanceTimersByTimeAsync(220);
  expect(container.hidden).toBe(false); expect(container.closest('.bp-popover')).not.toBeNull();
  dispose();
});


test('a detached public document remains interactive after asynchronous attachment', async () => {
  const root = document.createElement('main');
  const trigger = document.createElement('button'); trigger.dataset.instanceId = 'open';
  const container = document.createElement('section');
  container.dataset.layoutInteraction = JSON.stringify({ version: 1, presentation: 'popover', triggerId: 'open' });
  root.append(trigger, container); const dispose = mountContainerInteractions(root);
  document.body.append(document.createElement('p')); await Promise.resolve();
  document.body.append(root); await Promise.resolve();
  trigger.click(); expect(container.closest('.bp-popover')).not.toBeNull();
  dispose();
});

test('responsive row minimum width survives save/load and rejects CSS expressions', () => {
  const draft = document.createElement('div');
  deserializeLayout({ type: 'leaf', nodeId: 'header-slot', settings: { mode: 'stack' } }, draft);
  setContainerSettings(draft, { minWidth: '280px', height: 'auto' });
  const saved = JSON.parse(JSON.stringify(serializeLayout(draft)));
  const host = document.createElement('div');
  const live = renderLayoutTree(saved, host).get('header-slot')!;
  expect(live.style.minWidth).toBe('280px');
  expect(readContainerSettings(live).height).toBe('auto');
  setContainerSettings(draft, { minWidth: 'expression(alert(1))' });
  expect(readContainerSettings(draft).minWidth).toBeUndefined();
});

test('runtime flow containers stay hidden when their interaction is closed', () => {
  const css = document.createElement('style');
  css.textContent = require('fs').readFileSync(require('path').join(process.cwd(), 'public/assets/css/runtime.css'), 'utf8');
  document.head.append(css);
  const container = document.createElement('section');
  container.className = 'runtime-layout-container canvas-grid';
  container.dataset.layoutMode = 'stack'; container.dataset.layoutInteraction = '{}';
  container.hidden = true; document.body.append(container);
  expect(getComputedStyle(container).display).toBe('none');
  css.remove();
});
