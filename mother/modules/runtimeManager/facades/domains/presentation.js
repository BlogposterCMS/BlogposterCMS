'use strict';

const { BACKEND_EVENTS } = require('../../../../contracts/generatedBackendEventCatalog');

const PUBLIC_PLAINSPACE_LANE_ACTIONS = new Set([
  'widgetRegistry',
  'globalLayoutTemplate',
  'layoutTemplate',
  'layoutForViewport'
]);

// Page composition, visual assets and public presentation are kept in one
// facade domain while their established module/event ownership stays intact.
const adminActions = Object.freeze({
  pages: Object.freeze({
    list: { eventName: BACKEND_EVENTS.GET_ALL_PAGES, moduleName: 'pagesManager', permission: 'pages.read' },
    byLane: { eventName: BACKEND_EVENTS.GET_PAGES_BY_LANE, moduleName: 'pagesManager', permission: 'pages.read' },
    get: { eventName: BACKEND_EVENTS.GET_PAGE_BY_ID, moduleName: 'pagesManager', permission: 'pages.read' },
    getBySlug: { eventName: BACKEND_EVENTS.GET_PAGE_BY_SLUG, moduleName: 'pagesManager', permission: 'pages.read' },
    start: { eventName: BACKEND_EVENTS.GET_START_PAGE, moduleName: 'pagesManager', permission: 'pages.read' },
    children: { eventName: BACKEND_EVENTS.GET_CHILD_PAGES, moduleName: 'pagesManager', permission: 'pages.read' },
    envelope: { eventName: BACKEND_EVENTS.GET_ENVELOPE, moduleName: 'pagesManager', permission: 'pages.read' },
    search: { eventName: BACKEND_EVENTS.SEARCH_PAGES, moduleName: 'pagesManager', permission: 'pages.read' },
    create: { eventName: BACKEND_EVENTS.CREATE_PAGE, moduleName: 'pagesManager', permission: 'pages.create' },
    update: { eventName: BACKEND_EVENTS.UPDATE_PAGE, moduleName: 'pagesManager', permission: 'pages.update' },
    trash: { eventName: BACKEND_EVENTS.SET_AS_DELETED, moduleName: 'pagesManager', permission: 'pages.delete' },
    delete: { eventName: BACKEND_EVENTS.DELETE_PAGE, moduleName: 'pagesManager', permission: 'pages.delete' },
    setStart: { eventName: BACKEND_EVENTS.SET_AS_START, moduleName: 'pagesManager', permission: 'pages.manage' }
  }),
  widgets: Object.freeze({
    list: { eventName: BACKEND_EVENTS.GET_WIDGETS, moduleName: 'widgetManager', permission: 'widgets.read' },
    create: { eventName: BACKEND_EVENTS.CREATE_WIDGET, moduleName: 'widgetManager', permission: 'widgets.create' },
    update: { eventName: BACKEND_EVENTS.UPDATE_WIDGET, moduleName: 'widgetManager', permission: 'widgets.update' },
    delete: { eventName: BACKEND_EVENTS.DELETE_WIDGET, moduleName: 'widgetManager', permission: 'widgets.delete' },
    saveLayout: { eventName: BACKEND_EVENTS.SAVE_LAYOUT_V1, moduleName: 'widgetManager', permission: 'widgets.saveLayout' },
    registerUsage: { eventName: BACKEND_EVENTS.REGISTER_WIDGET_USAGE, moduleName: 'widgetManager', permission: 'widgets.read' }
  }),
  plainSpace: Object.freeze({
    widgetRegistry: { eventName: BACKEND_EVENTS.WIDGET_REGISTRY_REQUEST_V1, moduleName: 'plainspace', permission: 'widgets.read' },
    layoutForViewport: { eventName: BACKEND_EVENTS.GET_LAYOUT_FOR_VIEWPORT, moduleName: 'plainspace', permission: 'plainspace.read' },
    allLayoutsForPage: { eventName: BACKEND_EVENTS.GET_ALL_LAYOUTS_FOR_PAGE, moduleName: 'plainspace', permission: 'plainspace.read' },
    saveLayoutForViewport: { eventName: BACKEND_EVENTS.SAVE_LAYOUT_FOR_VIEWPORT, moduleName: 'plainspace', permission: 'plainspace.saveLayout' },
    layoutTemplate: { eventName: BACKEND_EVENTS.GET_LAYOUT_TEMPLATE, moduleName: 'plainspace', permission: 'plainspace.read' },
    layoutTemplateNames: { eventName: BACKEND_EVENTS.GET_LAYOUT_TEMPLATE_NAMES, moduleName: 'plainspace', permission: 'plainspace.read' },
    saveLayoutTemplate: { eventName: BACKEND_EVENTS.SAVE_LAYOUT_TEMPLATE, moduleName: 'plainspace', permission: 'plainspace.saveLayoutTemplate' },
    deleteLayoutTemplate: { eventName: BACKEND_EVENTS.DELETE_LAYOUT_TEMPLATE, moduleName: 'plainspace', permission: 'plainspace.saveLayoutTemplate' },
    globalLayoutTemplate: { eventName: BACKEND_EVENTS.GET_GLOBAL_LAYOUT_TEMPLATE, moduleName: 'plainspace', permission: 'plainspace.read' },
    setGlobalLayoutTemplate: { eventName: BACKEND_EVENTS.SET_GLOBAL_LAYOUT_TEMPLATE, moduleName: 'plainspace', permission: 'plainspace.saveLayoutTemplate' },
    widgetInstance: { eventName: BACKEND_EVENTS.GET_WIDGET_INSTANCE, moduleName: 'plainspace', permission: 'plainspace.widgetInstance' },
    saveWidgetInstance: { eventName: BACKEND_EVENTS.SAVE_WIDGET_INSTANCE, moduleName: 'plainspace', permission: 'plainspace.widgetInstance' },
    publishedDesignMeta: { eventName: BACKEND_EVENTS.GET_PUBLISHED_DESIGN_META, moduleName: 'plainspace', permission: 'plainspace.read' },
    savePublishedDesignMeta: { eventName: BACKEND_EVENTS.SAVE_PUBLISHED_DESIGN_META, moduleName: 'plainspace', permission: 'plainspace.saveLayoutTemplate' }
  }),
  navigation: Object.freeze({
    registerLocation: { eventName: BACKEND_EVENTS.REGISTER_NAVIGATION_LOCATION, moduleName: 'navigationManager', permission: 'navigation.manage' },
    locations: { eventName: BACKEND_EVENTS.LIST_NAVIGATION_LOCATIONS, moduleName: 'navigationManager', permission: 'navigation.manage' },
    menus: { eventName: BACKEND_EVENTS.LIST_NAVIGATION_MENUS, moduleName: 'navigationManager', permission: 'navigation.manage' },
    getMenu: { eventName: BACKEND_EVENTS.GET_NAVIGATION_MENU, moduleName: 'navigationManager', permission: 'navigation.manage' },
    upsertMenu: { eventName: BACKEND_EVENTS.UPSERT_NAVIGATION_MENU, moduleName: 'navigationManager', permission: 'navigation.manage' },
    addItem: { eventName: BACKEND_EVENTS.ADD_NAVIGATION_MENU_ITEM, moduleName: 'navigationManager', permission: 'navigation.manage' },
    setItems: { eventName: BACKEND_EVENTS.SET_NAVIGATION_MENU_ITEMS, moduleName: 'navigationManager', permission: 'navigation.manage' },
    updateItem: { eventName: BACKEND_EVENTS.UPDATE_NAVIGATION_MENU_ITEM, moduleName: 'navigationManager', permission: 'navigation.manage' },
    deleteItem: { eventName: BACKEND_EVENTS.DELETE_NAVIGATION_MENU_ITEM, moduleName: 'navigationManager', permission: 'navigation.manage' },
    tree: { eventName: BACKEND_EVENTS.GET_NAVIGATION_TREE, moduleName: 'navigationManager', permission: 'navigation.manage' }
  }),
  seo: Object.freeze({
    defaults: { eventName: BACKEND_EVENTS.GET_SEO_DEFAULTS, moduleName: 'seoManager', permission: 'seo.manage' },
    setDefaults: { eventName: BACKEND_EVENTS.SET_SEO_DEFAULTS, moduleName: 'seoManager', permission: 'seo.manage' },
    get: { eventName: BACKEND_EVENTS.GET_SEO_META, moduleName: 'seoManager', permission: 'seo.manage' },
    list: { eventName: BACKEND_EVENTS.LIST_SEO_META, moduleName: 'seoManager', permission: 'seo.manage' },
    upsert: { eventName: BACKEND_EVENTS.UPSERT_SEO_META, moduleName: 'seoManager', permission: 'seo.manage' },
    delete: { eventName: BACKEND_EVENTS.DELETE_SEO_META, moduleName: 'seoManager', permission: 'seo.manage' },
    resolve: { eventName: BACKEND_EVENTS.RESOLVE_SEO_META, moduleName: 'seoManager', permission: 'seo.manage' }
  }),
  redirects: Object.freeze({
    upsert: { eventName: BACKEND_EVENTS.UPSERT_REDIRECT_RULE, moduleName: 'redirectManager', permission: 'redirects.manage' },
    get: { eventName: BACKEND_EVENTS.GET_REDIRECT_RULE, moduleName: 'redirectManager', permission: 'redirects.manage' },
    list: { eventName: BACKEND_EVENTS.LIST_REDIRECT_RULES, moduleName: 'redirectManager', permission: 'redirects.manage' },
    delete: { eventName: BACKEND_EVENTS.DELETE_REDIRECT_RULE, moduleName: 'redirectManager', permission: 'redirects.manage' },
    resolve: { eventName: BACKEND_EVENTS.RESOLVE_REDIRECT, moduleName: 'redirectManager', permission: 'redirects.manage' },
    recordHit: { eventName: BACKEND_EVENTS.RECORD_REDIRECT_HIT, moduleName: 'redirectManager', permission: 'redirects.manage' },
    listHits: { eventName: BACKEND_EVENTS.LIST_REDIRECT_HITS, moduleName: 'redirectManager', permission: 'redirects.manage' }
  }),
  colors: Object.freeze({
    list: { eventName: BACKEND_EVENTS.COLOR_LIBRARY_LIST, moduleName: 'colorLibrary', permission: 'builder.use' },
    create: { eventName: BACKEND_EVENTS.COLOR_LIBRARY_CREATE, moduleName: 'colorLibrary', permission: 'builder.publish' },
    update: { eventName: BACKEND_EVENTS.COLOR_LIBRARY_UPDATE, moduleName: 'colorLibrary', permission: 'builder.publish' },
    delete: { eventName: BACKEND_EVENTS.COLOR_LIBRARY_DELETE, moduleName: 'colorLibrary', permission: 'builder.publish' },
    createScheme: { eventName: BACKEND_EVENTS.COLOR_LIBRARY_CREATE_SCHEME, moduleName: 'colorLibrary', permission: 'builder.publish' },
    updateScheme: { eventName: BACKEND_EVENTS.COLOR_LIBRARY_UPDATE_SCHEME, moduleName: 'colorLibrary', permission: 'builder.publish' },
    activateScheme: { eventName: BACKEND_EVENTS.COLOR_LIBRARY_ACTIVATE_SCHEME, moduleName: 'colorLibrary', permission: 'builder.publish' },
    deleteScheme: { eventName: BACKEND_EVENTS.COLOR_LIBRARY_DELETE_SCHEME, moduleName: 'colorLibrary', permission: 'builder.publish' }
  }),
  fontPackages: Object.freeze({
    list: { eventName: BACKEND_EVENTS.FONT_PACKAGES_LIST, moduleName: 'fontPackages', permission: 'builder.use' },
    create: { eventName: BACKEND_EVENTS.FONT_PACKAGES_CREATE, moduleName: 'fontPackages', permission: 'builder.publish' },
    update: { eventName: BACKEND_EVENTS.FONT_PACKAGES_UPDATE, moduleName: 'fontPackages', permission: 'builder.publish' },
    updateRole: { eventName: BACKEND_EVENTS.FONT_PACKAGES_UPDATE_ROLE, moduleName: 'fontPackages', permission: 'builder.publish' },
    resetRole: { eventName: BACKEND_EVENTS.FONT_PACKAGES_RESET_ROLE, moduleName: 'fontPackages', permission: 'builder.publish' },
    activate: { eventName: BACKEND_EVENTS.FONT_PACKAGES_ACTIVATE, moduleName: 'fontPackages', permission: 'builder.publish' },
    delete: { eventName: BACKEND_EVENTS.FONT_PACKAGES_DELETE, moduleName: 'fontPackages', permission: 'builder.publish' }
  }),
  fonts: Object.freeze({
    listProviders: { eventName: BACKEND_EVENTS.LIST_FONT_PROVIDERS, moduleName: 'fontsManager', permission: 'fonts.read' },
    list: { eventName: BACKEND_EVENTS.LIST_FONTS, moduleName: 'fontsManager', permission: 'fonts.read' },
    add: { eventName: BACKEND_EVENTS.ADD_FONT, moduleName: 'fontsManager', permission: 'fonts.manage' },
    setProviderEnabled: { eventName: BACKEND_EVENTS.SET_FONT_PROVIDER_ENABLED, moduleName: 'fontsManager', permission: 'fonts.manage' }
  }),
  sitePresets: Object.freeze({
    list: { eventName: BACKEND_EVENTS.SITE_PRESETS_LIST, moduleName: 'sitePresets', permission: 'builder.use' },
    create: { eventName: BACKEND_EVENTS.SITE_PRESETS_CREATE, moduleName: 'sitePresets', permission: 'builder.publish' },
    apply: { eventName: BACKEND_EVENTS.SITE_PRESETS_APPLY, moduleName: 'sitePresets', permission: 'builder.publish' },
    delete: { eventName: BACKEND_EVENTS.SITE_PRESETS_DELETE, moduleName: 'sitePresets', permission: 'builder.publish' }
  }),
  translations: Object.freeze({
    create: { eventName: BACKEND_EVENTS.CREATE_TRANSLATED_TEXT, moduleName: 'translationManager', permission: 'translations.create' },
    upsert: { eventName: BACKEND_EVENTS.UPSERT_TRANSLATED_TEXT, moduleName: 'translationManager', permission: 'translations.update' },
    get: { eventName: BACKEND_EVENTS.GET_TRANSLATED_TEXT, moduleName: 'translationManager', permission: 'translations.read' },
    list: { eventName: BACKEND_EVENTS.LIST_TRANSLATED_TEXTS, moduleName: 'translationManager', permission: 'translations.read' },
    update: { eventName: BACKEND_EVENTS.UPDATE_TRANSLATED_TEXT, moduleName: 'translationManager', permission: 'translations.update' },
    delete: { eventName: BACKEND_EVENTS.DELETE_TRANSLATED_TEXT, moduleName: 'translationManager', permission: 'translations.delete' },
    listLanguages: { eventName: BACKEND_EVENTS.LIST_LANGUAGES, moduleName: 'translationManager', permission: 'translations.listLanguages' },
    getLanguage: { eventName: BACKEND_EVENTS.GET_TRANSLATION_LANGUAGE, moduleName: 'translationManager', permission: 'translations.listLanguages' },
    upsertLanguage: { eventName: BACKEND_EVENTS.UPSERT_TRANSLATION_LANGUAGE, moduleName: 'translationManager', permission: 'translations.addLanguage' },
    deleteLanguage: { eventName: BACKEND_EVENTS.DELETE_TRANSLATION_LANGUAGE, moduleName: 'translationManager', permission: 'translations.delete' }
  }),
  designer: Object.freeze({
    get: { eventName: BACKEND_EVENTS.DESIGNER_GET_DESIGN, moduleName: 'designerManager', permission: 'builder.use' },
    getLayout: { eventName: BACKEND_EVENTS.DESIGNER_GET_LAYOUT, moduleName: 'designerManager', permission: 'builder.use' },
    list: { eventName: BACKEND_EVENTS.DESIGNER_LIST_DESIGNS, moduleName: 'designerManager', permission: 'builder.use' },
    layouts: { eventName: BACKEND_EVENTS.DESIGNER_LIST_LAYOUTS, moduleName: 'designerManager', permission: 'builder.use' },
    save: { eventName: BACKEND_EVENTS.DESIGNER_SAVE_DESIGN, moduleName: 'designerManager', permission: 'builder.publish' }
  })
});

const publicActions = Object.freeze({
  colors: Object.freeze({
    list: { eventName: BACKEND_EVENTS.COLOR_LIBRARY_LIST_PUBLIC, moduleName: 'colorLibrary' }
  }),
  fontPackages: Object.freeze({
    active: { eventName: BACKEND_EVENTS.FONT_PACKAGES_GET_PUBLIC, moduleName: 'fontPackages' }
  }),
  pages: Object.freeze({
    start: { eventName: BACKEND_EVENTS.GET_START_PAGE, moduleName: 'pagesManager' },
    envelope: { eventName: BACKEND_EVENTS.GET_ENVELOPE, moduleName: 'pagesManager' },
    getBySlug: { eventName: BACKEND_EVENTS.GET_PAGE_BY_SLUG, moduleName: 'pagesManager' },
    get: { eventName: BACKEND_EVENTS.GET_PAGE_BY_ID, moduleName: 'pagesManager' },
    children: { eventName: BACKEND_EVENTS.GET_CHILD_PAGES, moduleName: 'pagesManager' }
  }),
  widgets: Object.freeze({
    list: { eventName: BACKEND_EVENTS.GET_WIDGETS, moduleName: 'widgetManager' },
    registerUsage: { eventName: BACKEND_EVENTS.REGISTER_WIDGET_USAGE, moduleName: 'widgetManager' }
  }),
  plainSpace: Object.freeze({
    widgetRegistry: { eventName: BACKEND_EVENTS.WIDGET_REGISTRY_REQUEST_V1, moduleName: 'plainspace' },
    globalLayoutTemplate: { eventName: BACKEND_EVENTS.GET_GLOBAL_LAYOUT_TEMPLATE, moduleName: 'plainspace' },
    layoutTemplate: { eventName: BACKEND_EVENTS.GET_LAYOUT_TEMPLATE, moduleName: 'plainspace' },
    layoutForViewport: { eventName: BACKEND_EVENTS.GET_LAYOUT_FOR_VIEWPORT, moduleName: 'plainspace' },
    widgetInstance: { eventName: BACKEND_EVENTS.GET_WIDGET_INSTANCE, moduleName: 'plainspace' }
  }),
  designer: Object.freeze({
    get: { eventName: BACKEND_EVENTS.DESIGNER_GET_DESIGN, moduleName: 'designerManager' },
    getLayout: { eventName: BACKEND_EVENTS.DESIGNER_GET_LAYOUT, moduleName: 'designerManager' }
  }),
  fonts: Object.freeze({
    list: { eventName: BACKEND_EVENTS.LIST_FONTS, moduleName: 'fontsManager' },
    listProviders: { eventName: BACKEND_EVENTS.LIST_FONT_PROVIDERS, moduleName: 'fontsManager' }
  })
});

const appContextReadActions = Object.freeze({
  pages: new Set(['list', 'byLane', 'get', 'getBySlug', 'start', 'children', 'envelope', 'search']),
  plainSpace: new Set([
    'widgetRegistry',
    'layoutForViewport',
    'allLayoutsForPage',
    'layoutTemplate',
    'layoutTemplateNames',
    'globalLayoutTemplate',
    'widgetInstance',
    'publishedDesignMeta'
  ]),
  navigation: new Set(['locations', 'menus', 'getMenu', 'tree']),
  seo: new Set(['defaults', 'get', 'list', 'resolve']),
  colors: new Set(['list']),
  fonts: new Set(['list', 'listProviders']),
  fontPackages: new Set(['active']),
  sitePresets: new Set(['list']),
  translations: new Set(['get', 'list', BACKEND_EVENTS.LIST_LANGUAGES, 'getLanguage'])
});

function preparePublicParams({ resource, action, params }) {
  const safe = { ...params };

  if (resource === 'pages') {
    safe.lane = 'public';
    if (action === 'children') delete safe.lane;
  }

  if (resource === 'widgets' && action === 'list') {
    safe.widgetType = 'public';
  }

  if (resource === 'plainSpace') {
    if (PUBLIC_PLAINSPACE_LANE_ACTIONS.has(action)) safe.lane = 'public';
    if (action === 'widgetInstance') {
      const instanceId = String(safe.instanceId || '');
      if (!/^default\.[A-Za-z0-9_.:-]{1,160}$/.test(instanceId)) {
        throw new Error('Public widget instance requests are limited to default widget instances.');
      }
    }
  }

  if (resource === 'designer' && action === 'get') {
    const id = String(safe.id || '').trim();
    if (!id) throw new Error('Public design id is required.');
    safe.id = id;
  }
  if (resource === 'designer' && action === 'getLayout') {
    const layoutRef = String(safe.layoutRef || '').trim();
    if (!/^layout:[A-Za-z0-9_.:-]+(?:@[^/\s]+)?$/.test(layoutRef)) {
      throw new Error('[runtimeManager:PUBLIC_DESIGN_LAYOUT_REF_REQUIRED] Public design layoutRef is required.');
    }
    return { layoutRef };
  }

  return safe;
}

async function beforePublicDispatch(request, runtime) {
  if (request.resource !== 'pages' || request.action !== 'envelope') return;

  const page = await runtime.requestEvent(request.motherEmitter, BACKEND_EVENTS.GET_PAGE_BY_SLUG, {
    ...request.eventPayload,
    slug: request.params.slug || '',
    lane: 'public'
  });
  if (!runtime.isPublishedPublicPage(runtime.normalizeRuntimeSingle(page))) {
    throw new Error('Page not found');
  }
}

function formatPublicData({ resource, action, data }, runtime) {
  if (resource === 'pages') {
    if (action === 'children') {
      return runtime.normalizeRuntimeRows(data)
        .filter(runtime.isPublishedPublicPage)
        .map(runtime.toPublicPage);
    }
    if (action === 'envelope') return data;
    const page = runtime.normalizeRuntimeSingle(data);
    return runtime.isPublishedPublicPage(page) ? runtime.toPublicPage(page) : null;
  }

  if (resource === 'widgets' && action === 'list') {
    return runtime.normalizeRuntimeRows(data).filter(widget =>
      String(widget.widgetType || widget.widget_type || 'public').toLowerCase() === 'public'
    );
  }

  if (resource === 'designer' && action === 'get') {
    return runtime.isPublicDesignResult(data) ? runtime.toPublicDesignResult(data) : null;
  }
  if (resource === 'designer' && action === 'getLayout') {
    return runtime.toPublicDesignerLayout(data);
  }

  if (resource === 'plainSpace') return runtime.toPublicPlainSpaceData(data);
  return data;
}

module.exports = Object.freeze({
  name: 'presentation',
  adminActions,
  publicActions,
  appContextReadActions,
  preparePublicParams,
  beforePublicDispatch,
  formatPublicData
});
