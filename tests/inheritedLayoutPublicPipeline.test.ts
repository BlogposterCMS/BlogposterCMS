/** @jest-environment jsdom */
// Exercise the public loader with the real structural document renderer. Only
// widget mounting is stubbed; widget-specific rendering has its own coverage.
import { renderRuntimeCanvasWidget } from '../ui/runtime/main/runtimeWidgetMounting';
import { loadWidgets } from '../mother/modules/widgetManager/publicLoader';
import { loadHtml } from '../mother/modules/pagesManager/publicLoader';
import { loadDesign } from '../mother/modules/designerManager/publicLoader';
import { readFileSync } from 'node:fs';
import path from 'node:path';

jest.mock('/ui/runtime/main/script-utils.js', () => ({ executeJs: jest.fn() }), { virtual: true });
jest.mock('../ui/runtime/main/canvasGrid', () => ({
  init: jest.fn(() => ({ options: {}, widgets: [], makeWidget: jest.fn(), update: jest.fn() }))
}));

jest.mock('../ui/runtime/main/runtimeWidgetMounting', () => ({
  renderRuntimeCanvasWidget: jest.fn().mockResolvedValue(undefined)
}));

test('flowing articles retain the saved split ratio instead of a content-sized flex basis', () => {
  const style = document.createElement('style');
  style.textContent = readFileSync(path.resolve(__dirname, '../public/assets/css/runtime.css'), 'utf8');
  document.head.append(style);
  document.body.innerHTML = '<div class="runtime-layout-container" data-page-content-flow="true" style="flex:3 1 0px;height:240px"></div>';
  const articleHost = document.body.firstElementChild as HTMLElement;
  // jsdom does not apply stylesheet !important over inline declarations like a
  // browser. Also check the matching cascade so the regression fails there.
  const forcedFlexRules = Array.from(style.sheet!.cssRules).filter(rule => {
    const candidate = rule as CSSStyleRule;
    return candidate.selectorText && articleHost.matches(candidate.selectorText)
      && ['flex', 'flex-grow', 'flex-shrink', 'flex-basis'].some(property =>
        candidate.style.getPropertyPriority(property) === 'important');
  });
  expect(forcedFlexRules).toHaveLength(0);
  const computed = getComputedStyle(articleHost);
  expect(computed.flexGrow).toBe('3');
  expect(computed.flexShrink).toBe('1');
  expect(computed.flexBasis).toBe('0px');
  style.remove();
});

test('public composition keeps header, article and footer hosts and registry inline code', async () => {
  document.body.innerHTML = '<div id="app"><div id="bp-initial-html"><h1>Article</h1></div></div>';
  const tree = { type: 'split', nodeId: 'root', orientation: 'vertical', children: [
    { type: 'leaf', nodeId: 'header', workarea: true, settings: { mode: 'stack' } },
    { type: 'leaf', nodeId: 'body', isDynamicHost: true, settings: { mode: 'stack' } },
    { type: 'leaf', nodeId: 'footer', settings: { mode: 'stack' } }
  ] };
  const emit = jest.fn().mockResolvedValue({ resource: 'widgets', action: 'list', data: [
    { widgetId: 'text', content: JSON.stringify({ html: '<p>Reusable heading</p>' }) }
  ] });
  const ctx: any = { meltdownEmit: emit, publicToken: 'public-test',
    initialHtml: document.getElementById('bp-initial-html'), expectsPageContent: true,
    activeLayout: { layoutRef: 'layout:docs@v1', document: { layoutTree: tree }, items: [
      { instanceId: 'heading', widgetId: 'text', metadata: { workareaId: 'header' } },
      { instanceId: 'copyright', widgetId: 'text', html: '<p>Footer</p>', metadata: { workareaId: 'footer' } }
    ] }
  };
  await loadWidgets({}, ctx);
  await loadHtml({ contentSlot: true, fallbackOnly: true, inline: { html: '<h1>Article</h1>' } }, ctx);
  expect(ctx.pageContentHost?.dataset.nodeId).toBe('body');
  expect(ctx.pageContentHost?.dataset.pageContentFlow).toBe('true');
  expect(document.querySelector('[data-node-id="root"]')?.getAttribute('data-page-content-flow')).toBe('true');
  expect(document.querySelector('[data-node-id="body"] h1')?.textContent).toBe('Article');
  expect(document.querySelector('[data-node-id="header"] h1')).toBeNull();
  expect(document.querySelector('[data-node-id="footer"] [data-instance-id="copyright"]')).not.toBeNull();
  expect(document.querySelectorAll('h1')).toHaveLength(1);
  expect(renderRuntimeCanvasWidget).toHaveBeenCalledWith(expect.objectContaining({
    item: expect.objectContaining({ code: expect.objectContaining({ html: '<p>Reusable heading</p>' }) })
  }));
  expect(emit).toHaveBeenCalledWith('cmsPublicRuntimeRequest', expect.objectContaining({ jwt: 'public-test', resource: 'widgets' }));
});

test('main → page design → article keeps each document’s content slot and surrounding containers', async () => {
  document.body.innerHTML = '<div id="app"><div id="bp-initial-html"><h1>Article</h1></div></div>';
  const outer = { type: 'split', nodeId: 'main', orientation: 'horizontal', settings: { mode: 'stack' }, children: [
    { type: 'leaf', nodeId: 'header' },
    { type: 'leaf', nodeId: 'main-content', isDynamicHost: true, settings: { mode: 'stack' } },
    { type: 'leaf', nodeId: 'footer', designRef: 'footer-design' }
  ] };
  const emit = jest.fn(async (_event, payload) => ({ resource: payload.resource, action: payload.action,
    data: payload.resource === 'widgets' ? [] : { design: { layout: payload.params.id === 'article-design'
      ? { type: 'split', nodeId: 'article-design', orientation: 'vertical', settings: { mode: 'row' }, children: [
        { type: 'leaf', nodeId: 'sidebar' },
        { type: 'leaf', nodeId: 'article-content', isDynamicHost: true, settings: { mode: 'stack' } }
      ] } : { type: 'leaf', nodeId: 'footer-private-slot', isDynamicHost: true } }, widgets: [] }
  }));
  const ctx: any = { meltdownEmit: emit, publicToken: 'public-only', initialLayoutResolved: true,
    initialHtml: document.getElementById('bp-initial-html'), initialLayout: { document: { layoutTree: outer }, items: [], layoutRef: 'layout:main@v1' } };
  await loadDesign({ layoutRef: 'layout:main@v1', contentLayoutRef: 'layout:article-design@v1', requiresContentSlot: true, hasPageContent: true }, ctx);
  await loadWidgets({}, ctx);
  await loadHtml({ contentSlot: true, fallbackOnly: true, inline: { html: '<h1>Article</h1>' } }, ctx);
  expect(ctx.pageContentHost.dataset.nodeId).toBe('article-content');
  expect(document.querySelector('[data-node-id="main-content"] [data-node-id="article-content"] h1')).not.toBeNull();
  expect(document.querySelector('[data-node-id="footer-private-slot"] h1')).toBeNull();
  expect(document.querySelectorAll('h1')).toHaveLength(1);
  expect(document.querySelector('[data-node-id="sidebar"]')).not.toBeNull();
  expect(emit.mock.calls.every(([, payload]) => payload.jwt === 'public-only')).toBe(true);
});

test('adopts the first-response article before a slow header widget finishes', async () => {
  document.body.innerHTML = '<div id="bp-initial-html"><h1>Already readable</h1></div>';
  const article = document.getElementById('bp-initial-html');
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const mounting = new Promise<void>(resolve => { started = resolve; });
  jest.mocked(renderRuntimeCanvasWidget).mockImplementationOnce(async () => { started(); await pending; });
  const ctx: any = { initialHtml: article, expectsPageContent: true, publicToken: 'public-only',
    meltdownEmit: jest.fn().mockResolvedValue({ resource: 'widgets', action: 'list', data: [{ widgetId: 'text' }] }),
    activeLayout: { document: { layoutTree: { type: 'split', nodeId: 'root', children: [
      { type: 'leaf', nodeId: 'header', workarea: true },
      { type: 'leaf', nodeId: 'article', isDynamicHost: true }
    ] } }, items: [{ instanceId: 'heading', widgetId: 'text', metadata: { workareaId: 'header' } }] }
  };
  const rendered = loadWidgets({}, ctx);
  await mounting;
  try {
    expect(article?.parentElement?.dataset.nodeId).toBe('article');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(article?.isConnected).toBe(true);
  } finally { release(); await rendered; }
});
