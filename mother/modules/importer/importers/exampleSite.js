'use strict';

const { BACKEND_EVENTS } = require('../../../contracts/generatedBackendEventCatalog');
const { requestBackendEvent } = require('../../../contracts/backendEventContracts');
const { hasPermission } = require('../../userManagement/permissionUtils');
// Source examples are optional and are deliberately absent from release images.
// Only an unresolved example is optional; errors inside an installed example
// must still fail importer readiness instead of being silently ignored.
let exampleAvailable = true;
try { require.resolve('../../../../examples/docs-site'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  exampleAvailable = false;
}
const buildDocsExample = exampleAvailable ? require('../../../../examples/docs-site').buildDocsExample : null;
const activeImports = new Set();
const allowedOptions = new Set(['exampleId', 'rootSlug', 'dryRun', 'motherEmitter', 'jwt', 'decodedJWT', 'importPayload']);

function context(options) {
  if (!options.motherEmitter || !options.jwt) throw new Error('EXAMPLE_IMPORT_CONTEXT_MISSING: Importer authorization is required.');
  // Match the existing facade permissions before starting any cross-domain writes.
  for (const permission of ['pages.read', 'pages.create', 'builder.publish', 'navigation.manage']) {
    if (options.decodedJWT && !hasPermission(options.decodedJWT, permission)) {
      throw new Error(`EXAMPLE_IMPORT_FORBIDDEN: Missing permission ${permission}.`);
    }
  }
  return (event, moduleName, params = {}) => requestBackendEvent(options.motherEmitter, event, {
    ...params, jwt: options.jwt, decodedJWT: options.decodedJWT || null, moduleName, moduleType: 'core'
  });
}

async function assertUnused(example, request) {
  const [pages, menus, locations] = await Promise.all([
    request(BACKEND_EVENTS.GET_PAGES_BY_LANE, 'pagesManager', { lane: 'public', language: 'en' }),
    request(BACKEND_EVENTS.LIST_NAVIGATION_MENUS, 'navigationManager'),
    request(BACKEND_EVENTS.LIST_NAVIGATION_LOCATIONS, 'navigationManager')
  ]);
  if (![pages, menus, locations].every(Array.isArray)) throw new Error('EXAMPLE_IMPORT_PREFLIGHT_INVALID: Could not verify existing content.');
  if (pages.some(page => page.slug === example.rootSlug || page.slug?.startsWith(`${example.rootSlug}/`)) ||
      menus.some(menu => menu.key === example.menuKey) || locations.some(location => location.key === example.menuKey)) {
    throw new Error(`EXAMPLE_IMPORT_ADDRESS_IN_USE: /${example.rootSlug} or its example menu already exists. Choose another address; existing content is never replaced.`);
  }
}

/** Optional installed example, using the existing Importer and domain events.
 * It accepts a bundled example ID, never arbitrary packages or executable input. */
module.exports = exampleAvailable ? {
  name: 'exampleSite',
  description: 'Import an editable English Docs example as draft pages and a shared draft design.',
  async import(options = {}) {
    if (Object.keys(options).some(key => !allowedOptions.has(key)) ||
        options.exampleId !== 'docs' ||
        (options.dryRun !== undefined && typeof options.dryRun !== 'boolean')) {
      throw new Error('EXAMPLE_IMPORT_OPTIONS_INVALID: Choose exampleId=docs, rootSlug and dryRun only.');
    }
    const example = buildDocsExample(options.rootSlug);
    const request = context(options);
    if (activeImports.has(example.rootSlug)) throw new Error('EXAMPLE_IMPORT_BUSY: This example address is already being imported.');
    activeImports.add(example.rootSlug);
    const created = { designId: null, menuKey: null, pageIds: [] };
    try {
      await assertUnused(example, request);
      const plan = {
        exampleId: example.id, title: 'Documentation example', rootSlug: example.rootSlug,
        language: 'en', status: 'draft', designTitle: example.design.title,
        pages: example.pages.map(({ title, slug }) => ({ title, slug })),
        summary: '3 draft pages, 1 shared draft design, a chapter menu and a breadcrumb. Your home page and main design stay unchanged.'
      };
      if (options.dryRun !== false) return { dryRun: true, plan };
      const saved = await request(BACKEND_EVENTS.DESIGNER_SAVE_DESIGN, 'designerManager', {
        design: { title: example.design.title, description: example.design.description, bgColor: '#ffffff', isDraft: true, isLayout: true },
        widgets: example.design.widgets, layout: example.design.layout
      });
      created.designId = saved?.id || saved?.designId;
      if (!created.designId) throw new Error('EXAMPLE_IMPORT_DESIGN_RESULT_INVALID');
      await request(BACKEND_EVENTS.REGISTER_NAVIGATION_LOCATION, 'navigationManager', {
        key: example.menuKey, label: `Docs example · ${example.rootSlug}`, description: 'Chapters for the optional documentation example.'
      });
      created.menuKey = example.menuKey;
      await request(BACKEND_EVENTS.UPSERT_NAVIGATION_MENU, 'navigationManager', {
        key: example.menuKey, label: `Docs example · ${example.rootSlug}`, locationKey: example.menuKey
      });
      await request(BACKEND_EVENTS.SET_NAVIGATION_MENU_ITEMS, 'navigationManager', {
        menuKey: example.menuKey,
        items: example.pages.map((page, position) => ({ title: page.title, url: `/${page.slug}`, type: 'custom', status: 'active', position }))
      });
      // Parent first: page hierarchy and independent article bodies retain their
      // canonical owners; Pages performs its usual Content Engine mirror.
      for (const [index, page] of example.pages.entries()) {
        const savedPage = await request(BACKEND_EVENTS.CREATE_PAGE, 'pagesManager', {
          title: page.title, slug: page.slug, status: 'draft', language: 'en', lane: 'public',
          parent_id: index ? created.pageIds[0] : null, weight: index, is_content: false,
          meta: { pageDesignMode: 'design', designId: created.designId, designTitle: example.design.title,
            inheritParentDesign: false, example: { id: example.id, version: example.version, rootSlug: example.rootSlug } },
          translations: [{ language: 'en', title: page.title, html: page.html, css: page.css, metaDesc: `${page.title} — Blogposter documentation example.` }]
        });
        if (!savedPage?.pageId) throw new Error('EXAMPLE_IMPORT_PAGE_RESULT_INVALID');
        created.pageIds.push(savedPage.pageId);
      }
      return { dryRun: false, plan, result: { ...created, rootPageId: created.pageIds[0] } };
    } catch (error) {
      // Domain transactions are independent. Preserve successful work and report
      // exact recovery IDs instead of retrying writes or deleting user content.
      if (created.designId || created.menuKey || created.pageIds.length) {
        throw new Error(`EXAMPLE_IMPORT_PARTIAL: Some draft content was created. Review ${JSON.stringify(created)} before importing again. ${error.message}`);
      }
      throw error;
    } finally { activeImports.delete(example.rootSlug); }
  }
} : null;
