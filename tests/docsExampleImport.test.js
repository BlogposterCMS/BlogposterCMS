'use strict';

const { BACKEND_EVENTS: E } = require('../mother/contracts/generatedBackendEventCatalog');
const { requestBackendEvent } = require('../mother/contracts/backendEventContracts');
const importer = require('../mother/modules/importer/importers/exampleSite');
const { buildDocsExample } = require('../examples/docs-site');
jest.mock('../mother/contracts/backendEventContracts', () => ({ requestBackendEvent: jest.fn() }));

const reads = [E.GET_PAGES_BY_LANE, E.LIST_NAVIGATION_MENUS, E.LIST_NAVIGATION_LOCATIONS];
const options = () => ({ exampleId: 'docs', rootSlug: 'learn-docs', motherEmitter: {}, jwt: 'test-only',
  decodedJWT: { permissions: { pages: { read: true, create: true }, builder: { publish: true }, navigation: { manage: true } } } });
const calls = event => requestBackendEvent.mock.calls.filter(([, name]) => name === event).map(([, , payload]) => payload);

beforeEach(() => {
  jest.clearAllMocks();
  let pageId = 100;
  requestBackendEvent.mockImplementation(async (_, event) => {
    if (reads.includes(event)) return [];
    if (event === E.DESIGNER_SAVE_DESIGN) return { id: 70 };
    if (event === E.CREATE_PAGE) return { pageId: pageId++ };
    return { ok: true };
  });
});

test('plans without writing and creates an isolated editable draft through the domain owners', async () => {
  const preview = await importer.import(options());
  expect(preview).toMatchObject({ dryRun: true, plan: { rootSlug: 'learn-docs', status: 'draft', language: 'en' } });
  expect(requestBackendEvent.mock.calls.every(([, event]) => reads.includes(event))).toBe(true);
  const result = await importer.import({ ...options(), dryRun: false });
  expect(result.result).toEqual({ designId: 70, menuKey: 'example-learn-docs', pageIds: [100, 101, 102], rootPageId: 100 });
  const design = calls(E.DESIGNER_SAVE_DESIGN)[0];
  expect(design.design).toMatchObject({ isDraft: true, isLayout: true });
  expect(design.widgets.map(w => w.widgetId)).toEqual(['textBox', 'navigationMenu', 'breadcrumb', 'textBox']);
  const pages = calls(E.CREATE_PAGE);
  expect(pages.map(p => p.parent_id)).toEqual([null, 100, 100]);
  expect(pages.map(p => p.slug)).toEqual(['learn-docs', 'learn-docs/layouts', 'learn-docs/agents']);
  pages.forEach(page => {
    expect(page).toMatchObject({ status: 'draft', lane: 'public', language: 'en', meta: { designId: 70, pageDesignMode: 'design' } });
    expect(page.skipContentMirror).toBeUndefined();
    expect(page.autoSuffixSlug).toBeUndefined();
    expect(page.decodedJWT).toEqual(options().decodedJWT);
    expect(page.translations[0].html).toContain('<article>');
    expect(page.translations[0].css).toContain('body > #bp-initial-html');
  });
  expect(requestBackendEvent.mock.calls.some(([, event]) => /setting|startPage|homePage/i.test(event))).toBe(false);
});

test.each([E.GET_PAGES_BY_LANE, E.LIST_NAVIGATION_MENUS, E.LIST_NAVIGATION_LOCATIONS])('rejects occupied content before the first write (%s)', async event => {
  requestBackendEvent.mockImplementation(async (_, name) => name === event
    ? [{ slug: 'learn-docs/old-page', key: 'example-learn-docs', status: 'deleted' }] : []);
  await expect(importer.import({ ...options(), dryRun: false })).rejects.toThrow('EXAMPLE_IMPORT_ADDRESS_IN_USE');
  expect(calls(E.DESIGNER_SAVE_DESIGN)).toHaveLength(0);
});

test('checks all target permissions before reads or partial writes', async () => {
  await expect(importer.import({ ...options(), decodedJWT: { permissions: { pages: { create: true, read: true } } }, dryRun: false }))
    .rejects.toThrow('EXAMPLE_IMPORT_FORBIDDEN');
  expect(requestBackendEvent).not.toHaveBeenCalled();
});

test.each([{ rootSlug: '../admin' }, { rootSlug: 'a";run()' }, { manifest: {} }, { filePath: '/tmp/file' }, { exampleId: '../../bad' }, { dryRun: 'false' }])('rejects untrusted package, path or option input %j', async patch => {
  await expect(importer.import({ ...options(), ...patch })).rejects.toThrow(/EXAMPLE_IMPORT_(SLUG|OPTIONS)_INVALID/);
  expect(requestBackendEvent).not.toHaveBeenCalled();
});

test('fails closed when preflight cannot read the existing namespace', async () => {
  requestBackendEvent.mockResolvedValue(undefined);
  await expect(importer.import({ ...options(), dryRun: false })).rejects.toThrow('EXAMPLE_IMPORT_PREFLIGHT_INVALID');
  expect(calls(E.DESIGNER_SAVE_DESIGN)).toHaveLength(0);
});

test('reports created draft IDs after a domain failure without retrying or deleting', async () => {
  const normal = requestBackendEvent.getMockImplementation();
  requestBackendEvent.mockImplementation(async (emitter, event, payload) => {
    if (event === E.CREATE_PAGE && payload.parent_id) throw new Error('PAGE_WRITE_FAILED');
    return normal(emitter, event, payload);
  });
  await expect(importer.import({ ...options(), dryRun: false })).rejects.toThrow('EXAMPLE_IMPORT_PARTIAL: Some draft content was created. Review {"designId":70,"menuKey":"example-learn-docs","pageIds":[100]}');
  expect(calls(E.CREATE_PAGE)).toHaveLength(2);
  expect(requestBackendEvent.mock.calls.some(([, event]) => /delete/i.test(event))).toBe(false);
});

test('blocks concurrent writes to the same example address', async () => {
  let release;
  const read = new Promise(resolve => { release = resolve; });
  requestBackendEvent.mockImplementation(async () => read);
  const pending = importer.import(options());
  await expect(importer.import(options())).rejects.toThrow('EXAMPLE_IMPORT_BUSY');
  release([]);
  await pending;
});

test('the portable English example has one content host and relocates all chapter links', () => {
  const example = buildDocsExample('handbook');
  const hosts = [];
  const visit = node => { if (node.isDynamicHost) hosts.push(node.nodeId); (node.children || []).forEach(visit); };
  visit(example.design.layout);
  expect(hosts).toEqual(['docs-demo-content']);
  const content = JSON.stringify(example);
  expect(content).not.toContain('{{rootSlug}}');
  expect(content).not.toContain('/docs-demo');
  expect(content).not.toMatch(/Einführung|Gemeinsames Layout|Lesezeit|Dokumentation/);
  expect(example.design.widgets.find(w => w.widgetId === 'navigationMenu').code.meta.locationKey).toBe('example-handbook');
  expect(example.pages[0].html).toContain('/handbook/layouts');
  // The first response and Studio share flow styling, so saved free coordinates
  // cannot displace an Auto-container header or collapse its natural height.
  expect(example.pages[0].css).toContain('position:relative!important;inset:auto!important;transform:none!important');
  expect(example.design.widgets[0].code.js).toContain('position:relative!important;inset:auto!important;transform:none!important');
});
