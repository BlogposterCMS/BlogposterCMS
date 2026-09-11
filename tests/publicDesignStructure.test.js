/** @jest-environment jsdom */
const { resolvePublicDesigns, renderPublicDesignStructure } = require('../mother/modules/pagesManager/publicDesignStructure');
const { loadPublicPresentation } = require('../mother/modules/pagesManager/publicPresentation');

const leaf = (nodeId, extra = {}) => ({ type: 'leaf', nodeId, settings: { mode: 'stack' }, ...extra });
const layout = (id, tree, items = []) => ({ layoutRef: `layout:${id}@v1`, document: { layoutTree: tree }, items });

test('first HTML contains the real nested content host and never gives the article to a footer attachment', async () => {
  const main = layout('main', { type: 'split', nodeId: 'main', orientation: 'horizontal', settings: { mode: 'stack' }, children: [
    leaf('header'), leaf('main-slot', { isDynamicHost: true }), leaf('footer', { designRef: 'footer-design' })
  ] });
  const page = layout('page', { type: 'split', nodeId: 'page', orientation: 'vertical', sizes: [1, 3], children: [
    leaf('sidebar'), leaf('article-slot', { isDynamicHost: true })
  ] });
  const footer = layout('footer-design', leaf('footer-slot', { isDynamicHost: true }));
  const request = jest.fn(async (_resource, _action, { layoutRef }) => layoutRef.includes('footer-design') ? footer : page);
  const before = JSON.stringify({ main, page, footer });
  const snapshots = await resolvePublicDesigns(request, main, 'layout:page@v1');
  const result = renderPublicDesignStructure(main, snapshots, { contentLayoutRef: 'layout:page@v1', article: '<article id="article">Body</article>' });
  document.body.innerHTML = result.body;
  expect(result.articleInserted).toBe(true);
  expect(document.getElementById('article').parentElement.dataset.nodeId).toBe('article-slot');
  expect(document.querySelector('[data-node-id="footer-slot"] article')).toBeNull();
  expect(document.querySelector('[data-node-id="sidebar"]').style.flexGrow).toBe('1');
  expect(document.querySelector('[data-node-id="article-slot"]').style.flexGrow).toBe('3');
  expect(request.mock.calls).toHaveLength(2);
  expect(request.mock.calls.every(([resource, action]) => resource === 'designer' && action === 'getLayout')).toBe(true);
  expect(JSON.stringify({ main, page, footer })).toBe(before);
  expect(renderPublicDesignStructure(main, snapshots, { contentLayoutRef: 'layout:page@v1', article: '<article id="article">Body</article>' })).toEqual(result);
});

test('duplicate and cyclic public references are bounded and unavailable designs fail closed', async () => {
  const main = layout('main', { type: 'split', nodeId: 'root', children: [leaf('one', { designRef: 'linked' }), leaf('two', { designRef: 'linked' }), leaf('draft', { designRef: 'draft' })] });
  const linked = layout('linked', leaf('back', { designRef: 'main' }));
  const request = jest.fn(async (_r, _a, { layoutRef }) => {
    if (layoutRef.includes('draft')) throw new Error('Public resource not found');
    return linked;
  });
  const snapshots = await resolvePublicDesigns(request, main);
  expect(request).toHaveBeenCalledTimes(2);
  expect(snapshots.draft).toBeNull();
  document.body.innerHTML = renderPublicDesignStructure(main, snapshots).body;
  expect(document.querySelectorAll('[data-node-id="back"]')).toHaveLength(2);
  expect(document.querySelectorAll('[data-node-id="root"]')).toHaveLength(1);
});

test('excessive references preserve the page with a stable diagnostic', async () => {
  const main = layout('main', { type: 'split', nodeId: 'root', children: Array.from({ length: 66 }, (_, i) => leaf(`slot-${i}`, { designRef: `design-${i}` })) });
  const request = jest.fn().mockResolvedValue(null);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await resolvePublicDesigns(request, main);
    expect(request).toHaveBeenCalledTimes(64);
    expect(warn).toHaveBeenCalledWith('[PublicPresentation] PUBLIC_STRUCTURE_REFERENCE_LIMIT');
  } finally { warn.mockRestore(); }
});

test('workarea selection is not a content slot, and attachments and canonical envelopes are unchanged', async () => {
  const page = { attachments: [
    { type: 'design', descriptor: { layoutRef: 'layout:main@v1', requiresContentSlot: true } },
    { type: 'html', descriptor: { contentSlot: true, inline: { html: '<p>Article<img src="/media/attachment.png"></p>', css: '' } } },
    { type: 'media', descriptor: { id: 'retained-attachment', url: '/media/attachment.png' } }
  ] };
  const main = layout('main', leaf('selected', { workarea: true }));
  const original = JSON.stringify({ page, main });
  const request = jest.fn(async resource => resource === 'pages' ? page : main);
  const result = await loadPublicPresentation(request, 'guide', 'en');
  document.body.innerHTML = result.body;
  expect(document.getElementById('bp-initial-html').parentElement).toBe(document.body);
  expect(document.querySelector('[data-node-id="selected"] img')).toBeNull();
  expect(document.querySelector('img').getAttribute('src')).toBe('/media/attachment.png');
  expect(result.bootstrap.envelope.attachments[2]).toEqual(page.attachments[2]);
  expect(JSON.stringify({ page, main })).toBe(original);
});

test('server geometry and closed overlays use normalized settings and escape authored identifiers', () => {
  const main = layout('main', leaf('slot"<script>', { isDynamicHost: true, settings: { mode: 'stack', padding: '12px', interaction: { version: 1, presentation: 'dialog' } } }), [
    { instanceId: 'widget"1', widgetId: 'text', workarea_id: 'slot"<script>', w: 120, h: 48 }
  ]);
  document.body.innerHTML = renderPublicDesignStructure(main, {}).body;
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('[data-bp-layout-path]').hidden).toBe(true);
  expect(document.querySelector('[data-bp-layout-path]').style.padding).toBe('12px');
  expect(document.querySelector('[data-bp-initial-widget]').dataset.bpInitialWidget).toBe('widget"1');
});
