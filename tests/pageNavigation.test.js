const { EventEmitter } = require('events');
const { BACKEND_EVENTS: E } = require('../mother/contracts/generatedBackendEventCatalog');
const { pageNavigationTree } = require('../mother/modules/navigationManager/pageNavigation');
const { validateNavigationTitles } = require('../mother/modules/pagesManager/navigationTitle');

function fixture(rows, translations = {}) {
  const emitter = new EventEmitter();
  emitter.on(E.GET_ALL_PAGES, (_p, cb) => cb(null, rows));
  emitter.on(E.GET_PAGE_BY_ID, (p, cb) => cb(null, translations[p.pageId] || rows.find(row => String(row.id) === p.pageId)));
  return emitter;
}
const page = (id, parent_id, extra = {}) => ({ id, parent_id, title: `Page ${id}`, slug: `docs/${id}`, status: 'published', lane: 'public', language: 'en', ...extra });
test('Pages source projects ordered published hierarchy and localized navigation titles without exposing hidden branches', async () => {
  const rows = [page(1, null), page(2, 1, { weight: 2 }), page(3, 1, { weight: 1 }), page(4, 2),
    page(5, 1, { status: 'draft' }), page(6, 1, { lane: 'admin' }), page(7, 1, { is_deleted: true }), page(8, 5)];
  const translations = { 2: page(2, 1, { trans_lang: 'zh', trans_title: 'Article', meta: { navigationTitles: { zh: 'Short' } } }),
    3: page(3, 1, { trans_lang: 'zh', trans_title: 'Title fallback' }), 4: page(4, 2, { trans_lang: 'zh' }) };
  const result = await pageNavigationTree(fixture(rows, translations), 'fixture', { parentId: 1, language: 'zh', maxDepth: 2 });
  expect(result.tree.map(item => item.id)).toEqual(['page:3', 'page:2']);
  expect(result.tree.map(item => item.title)).toEqual(['Title fallback', 'Short']);
  expect(result.tree[1].children.map(item => item.id)).toEqual(['page:4']);
  const missing = await pageNavigationTree(fixture(rows), 'fixture', { parentId: 1, language: 'de' });
  expect(missing.tree).toEqual([]);
});
test('Pages source rejects unavailable parent, invalid language/depth and cyclic hierarchy', async () => {
  await expect(pageNavigationTree(fixture([page(1, null, { status: 'draft' })]), 't', { parentId: 1 })).rejects.toThrow('NAVIGATION_PAGES_PARENT_UNAVAILABLE');
  await expect(pageNavigationTree(fixture([]), 't', { parentId: 1, language: '<script>' })).rejects.toThrow('NAVIGATION_PAGES_LANGUAGE_INVALID');
  await expect(pageNavigationTree(fixture([]), 't', { parentId: 1, maxDepth: 8 })).rejects.toThrow('NAVIGATION_PAGES_DEPTH_INVALID');
  await expect(pageNavigationTree(fixture([page(1, 2), page(2, 1)]), 't', { parentId: 1 })).rejects.toThrow('NAVIGATION_PAGES_CYCLE');
});
test('navigation titles allow bounded localized optional copy, rejecting malformed maps', () => {
  expect(() => validateNavigationTitles({ navigationTitles: { en: '', 'zh-cn': '短标题' } })).not.toThrow();
  for (const navigationTitles of [[], null, { EN: 'Wrong key' }, { en: 7 }, { en: 'x'.repeat(121) }]) {
    expect(() => validateNavigationTitles({ navigationTitles })).toThrow('PAGE_NAVIGATION_TITLE_INVALID');
  }
});

test('public HTTP adapter forwards Pages settings and keeps unavailable parent private', async () => {
  const { setupNavigationEvents } = require('../mother/modules/navigationManager');
  const { _internals: { renderPublicNavigation } } = require('../mother/modules/runtimeManager');
  const emitter = fixture([page(1, null), page(2, 1)]);
  setupNavigationEvents(emitter);
  const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req = { params: { locationKey: 'primary' }, query: { source: 'pages', parentId: '1', language: 'en', maxDepth: '1' } };
  await renderPublicNavigation(emitter, 't', req, res);
  expect(res.json.mock.calls[0][0].tree[0]).toMatchObject({ title: 'Page 2', url: '/docs/2?lang=en' });
  req.query.parentId = 'missing';
  await renderPublicNavigation(emitter, 't', req, res);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.json.mock.calls.at(-1)[0]).toEqual({ error: { code: 'NAVIGATION_PAGES_PARENT_UNAVAILABLE', message: 'NAVIGATION_PAGES_PARENT_UNAVAILABLE' } });
});
