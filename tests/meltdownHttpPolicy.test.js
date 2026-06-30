const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  APP_FORBIDDEN_DIRECT_EVENTS,
  APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS,
  COMMUNITY_FORBIDDEN_DIRECT_EVENTS,
  explainExternalEventRejection,
  hasRawPlaceholderPayload,
  HTTP_DIRECT_CONTRACT_EVENTS,
  HTTP_FORBIDDEN_EXTERNAL_EVENTS,
  HTTP_PUBLIC_TOKEN_EVENTS,
  isHttpDirectContractEvent,
  isHttpPublicEvent,
  isHttpPublicTokenEvent,
  SENSITIVE_SYSTEM_QUERY_EVENTS,
  stripHttpPayloadAuthMeta
} = require('../mother/utils/meltdownHttpPolicy');

function collectCoreListenerEvents() {
  const roots = [
    path.join(__dirname, '..', 'mother', 'modules'),
    path.join(__dirname, '..', 'modules', 'designer')
  ];
  const skipDirs = new Set(['node_modules', 'dist', 'build', 'coverage']);
  const events = new Map();

  const scanFile = filePath => {
    const source = fs.readFileSync(filePath, 'utf8');
    const patterns = [
      /(?:motherEmitter|emitter|eventBus)\.on\(\s*['"]([^'"]+)['"]/g,
      /registerListener\(\s*['"]([^'"]+)['"]/g
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(source))) {
        const eventName = match[1];
        if (!events.has(eventName)) events.set(eventName, new Set());
        events.get(eventName).add(path.relative(path.join(__dirname, '..'), filePath));
      }
    }
  };

  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(js|ts)$/.test(entry.name)) {
        scanFile(fullPath);
      }
    }
  };

  for (const root of roots) walk(root);
  return events;
}

test('meltdown HTTP policy only exposes token bootstrap and the public runtime facade', () => {
  assert.strictEqual(isHttpPublicEvent('issuePublicToken'), true);
  assert.strictEqual(isHttpPublicEvent('ensurePublicToken'), true);
  assert.strictEqual(isHttpDirectContractEvent('cmsAdminApiRequest'), true);
  assert.strictEqual(isHttpDirectContractEvent('dispatchAppEvent'), true);
  assert.strictEqual(isHttpPublicTokenEvent('cmsPublicRuntimeRequest'), true);
  assert.strictEqual(isHttpPublicTokenEvent('getPublicSetting'), false);
  assert.strictEqual(isHttpPublicTokenEvent('getUserCount'), false);
  assert.strictEqual(isHttpPublicTokenEvent('listActiveLoginStrategies'), false);
  assert.strictEqual(isHttpPublicTokenEvent('loginWithStrategy'), false);
  assert.strictEqual(isHttpPublicTokenEvent('publicRegister'), false);
  assert.strictEqual(HTTP_PUBLIC_TOKEN_EVENTS.has('getRecentNotifications'), false);
  assert.strictEqual(isHttpPublicEvent('deactivateModule'), false);
  assert.strictEqual(isHttpPublicEvent('removeListenersByModule'), false);
});

test('meltdown HTTP policy blocks direct internal and raw database events', () => {
  assert.match(explainExternalEventRejection('dbSelect', {
    table: 'users'
  }), /internal/);
  assert.match(explainExternalEventRejection('deactivateModule', {
    moduleName: 'contentEngine'
  }), /internal/);
  assert.match(explainExternalEventRejection('issueUserToken', {
    userId: 1
  }), /internal/);
  assert.match(explainExternalEventRejection('revokeToken', {
    jti: 'abc'
  }), /internal/);
  assert.match(explainExternalEventRejection('registerWidgetUsage', {
    events: ['widget.loaded']
  }), /internal/);
  assert.match(explainExternalEventRejection('listContentEntries', {
    table: '__rawSQL__',
    data: { rawSQL: 'CREATE_CONTENT_ENTRY' }
  }), /Raw database/);
  assert.strictEqual(hasRawPlaceholderPayload({
    data: { rawSQL: 'LIST_SETTINGS' }
  }), true);
  assert.strictEqual(explainExternalEventRejection('cmsAdminApiRequest', {
    resource: 'content',
    action: 'list'
  }), null);
  assert.match(explainExternalEventRejection('dummyModule.dummyAction', {
    message: 'hello'
  }), /not exposed/);
  assert.strictEqual(explainExternalEventRejection('dispatchAppEvent', {
    moduleName: 'appLoader',
    appName: 'designer',
    event: 'designer-ready'
  }), null);
});

test('meltdown HTTP policy accounts for all core listener events', () => {
  const accountedFor = new Set([
    ...HTTP_FORBIDDEN_EXTERNAL_EVENTS,
    ...HTTP_DIRECT_CONTRACT_EVENTS,
    ...HTTP_PUBLIC_TOKEN_EVENTS,
    'cmsAdminApiRequest',
    'cmsPublicRuntimeRequest'
  ]);

  const uncovered = [];
  for (const [eventName, files] of collectCoreListenerEvents()) {
    if (accountedFor.has(eventName) || isHttpPublicEvent(eventName) || isHttpPublicTokenEvent(eventName)) {
      continue;
    }
    uncovered.push(`${eventName} (${Array.from(files).join(', ')})`);
  }

  assert.deepStrictEqual(uncovered.sort(), []);
});

test('meltdown HTTP policy blocks direct widget management writes', () => {
  for (const eventName of ['createWidget', 'updateWidget', 'deleteWidget', 'saveLayout.v1']) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true);
    assert.match(explainExternalEventRejection(eventName, {
      widgetId: 'example',
      widgetType: 'public'
    }), /internal/);
  }

  assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has('getWidgets'), true);
  assert.match(explainExternalEventRejection('getWidgets', {
    widgetType: 'public'
  }), /internal/);
});

test('meltdown HTTP policy blocks direct PlainSpace presentation events and accepts explicit runtime facades', () => {
  const blocked = [
    'widget.registry.request.v1',
    'getLayoutForViewport',
    'getAllLayoutsForPage',
    'saveLayoutForViewport',
    'getLayoutTemplate',
    'getLayoutTemplateNames',
    'saveLayoutTemplate',
    'deleteLayoutTemplate',
    'getGlobalLayoutTemplate',
    'setGlobalLayoutTemplate',
    'getWidgetInstance',
    'saveWidgetInstance',
    'getPublishedDesignMeta',
    'savePublishedDesignMeta',
    'getEnvelope'
  ];

  for (const eventName of blocked) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true, eventName);
    assert.match(explainExternalEventRejection(eventName, {}), /internal/, eventName);
  }

  assert.strictEqual(explainExternalEventRejection('cmsAdminApiRequest', {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'plainSpace',
    action: 'saveLayoutForViewport',
    params: {
      pageId: 'page-1',
      lane: 'public',
      viewport: 'desktop',
      layout: [{ widgetId: 'hero' }]
    }
  }), null);

  assert.strictEqual(explainExternalEventRejection('cmsPublicRuntimeRequest', {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'pages',
    action: 'envelope',
    params: { slug: 'home' }
  }), null);

  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('getLayoutForViewport'), true);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('getLayoutTemplate'), true);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('saveLayoutForViewport'), true);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('widget.registry.request.v1'), true);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('saveLayoutTemplate'), true);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('getWidgetInstance'), true);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('cmsAdminApiRequest'), false);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('cmsPublicRuntimeRequest'), true);
});

test('meltdown HTTP policy blocks direct designer events and accepts explicit runtime facades', () => {
  const blocked = [
    'designer.getDesign',
    'designer.getLayout',
    'designer.listDesigns',
    'designer.listLayouts',
    'designer.saveDesign'
  ];

  for (const eventName of blocked) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true, eventName);
    assert.match(explainExternalEventRejection(eventName, { id: 'design-1' }), /internal/, eventName);
  }

  assert.strictEqual(explainExternalEventRejection('cmsPublicRuntimeRequest', {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'designer',
    action: 'get',
    params: { id: 'design-1' }
  }), null);
  assert.strictEqual(explainExternalEventRejection('cmsPublicRuntimeRequest', {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'designer',
    action: 'getLayout',
    params: { lane: 'public', layoutRef: 'layout:design-1@v1' }
  }), null);
  assert.strictEqual(explainExternalEventRejection('cmsAdminApiRequest', {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'designer',
    action: 'save',
    params: { title: 'Hero' }
  }), null);

  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('designer.getDesign'), true);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('designer.listDesigns'), true);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('designer.saveDesign'), true);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('designer.getLayout'), true);
});

test('meltdown HTTP policy accepts public runtime reads only as explicit public facades', () => {
  for (const eventName of [
    'getStartPage',
    'getPageBySlug',
    'getPageById',
    'getChildPages',
    'getWidgets',
    'widget.registry.request.v1',
    'getLayoutForViewport',
    'getGlobalLayoutTemplate',
    'getWidgetInstance'
  ]) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true, eventName);
    assert.match(explainExternalEventRejection(eventName, {}), /internal/, eventName);
  }

  const publicFacades = [
    { resource: 'pages', action: 'start', params: { language: 'en' } },
    { resource: 'pages', action: 'getBySlug', params: { slug: 'home' } },
    { resource: 'widgets', action: 'list', params: { widgetType: 'public' } },
    { resource: 'plainSpace', action: 'widgetRegistry', params: { lane: 'public' } },
    { resource: 'plainSpace', action: 'layoutForViewport', params: { pageId: 'page-1', lane: 'public', viewport: 'desktop' } },
    { resource: 'plainSpace', action: 'globalLayoutTemplate', params: { lane: 'public' } },
    { resource: 'plainSpace', action: 'widgetInstance', params: { instanceId: 'default.hero' } }
  ];

  for (const facade of publicFacades) {
    assert.strictEqual(explainExternalEventRejection('cmsPublicRuntimeRequest', {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      ...facade
    }), null, `${facade.resource}.${facade.action}`);
  }
});
test('meltdown HTTP policy blocks direct app management and inventory events', () => {
  for (const eventName of ['installAppFromDirectory', 'uninstallApp', 'rescanApps', 'listApps', 'getApp', 'listBuilderApps', 'getAppLaunchInfo']) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true);
    assert.match(explainExternalEventRejection(eventName, {
      appName: 'example'
    }), /internal/);
  }
});

test('meltdown HTTP policy blocks direct import export and theme writes', () => {
  for (const eventName of ['runImport', 'runExport', 'activateTheme', 'listImporters', 'listExporters', 'listThemes', 'getTheme', 'getActiveTheme']) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true);
    assert.match(explainExternalEventRejection(eventName, {
      slug: 'example'
    }), /internal/);
  }
});

test('meltdown HTTP policy blocks direct CMS content and media events covered by runtime facade', () => {
  const blocked = [
    'listContentEntries',
    'getContentEntry',
    'getContentRevisions',
    'getContentRevision',
    'listScheduledContentEntries',
    'listTrashedContentEntries',
    'listContentTypes',
    'getContentType',
    'registerContentType',
    'createContentEntry',
    'updateContentEntry',
    'publishContentEntry',
    'trashContentEntry',
    'restoreContentEntry',
    'restoreContentRevision',
    'listMediaAttachments',
    'getMediaAttachment',
    'createMediaAttachment',
    'updateMediaAttachment',
    'deleteMediaAttachment',
    'upsertMediaVariant',
    'listMediaVariants',
    'deleteMediaVariant',
    'linkMediaToContent',
    'unlinkMediaFromContent',
    'listMediaForContent',
    'listContentForMedia'
  ];

  for (const eventName of blocked) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true, eventName);
    assert.match(explainExternalEventRejection(eventName, {}), /internal/, eventName);
  }
});

test('meltdown HTTP policy does not expose removed content taxonomy facade events', () => {
  const removed = [
    'listContentTaxonomies',
    'getContentTaxonomy',
    'registerContentTaxonomy',
    'deleteContentTaxonomy',
    'listContentTerms',
    'getContentTerm',
    'listContentTermsForEntry',
    'upsertContentTerm',
    'deleteContentTerm',
    'assignContentTerm',
    'unassignContentTerm'
  ];

  for (const eventName of removed) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), false, eventName);
    assert.match(explainExternalEventRejection(eventName, {}), /not exposed/, eventName);
  }
});

test('meltdown HTTP policy blocks direct workflow navigation SEO translation and settings events covered by runtime facade', () => {
  const blocked = [
    'acquireContentLock',
    'refreshContentLock',
    'releaseContentLock',
    'getContentLock',
    'saveContentAutosave',
    'getContentAutosave',
    'listContentAutosaves',
    'deleteContentAutosave',
    'submitContentReview',
    'approveContentReview',
    'rejectContentReview',
    'getContentReview',
    'listContentReviewQueue',
    'listNavigationLocations',
    'listNavigationMenus',
    'getNavigationMenu',
    'upsertNavigationMenu',
    'addNavigationMenuItem',
    'setNavigationMenuItems',
    'updateNavigationMenuItem',
    'deleteNavigationMenuItem',
    'getNavigationTree',
    'getSeoDefaults',
    'setSeoDefaults',
    'getSeoMeta',
    'listSeoMeta',
    'upsertSeoMeta',
    'deleteSeoMeta',
    'resolveSeoMeta',
    'getTranslatedText',
    'listTranslatedTexts',
    'createTranslatedText',
    'upsertTranslatedText',
    'updateTranslatedText',
    'deleteTranslatedText',
    'listLanguages',
    'getTranslationLanguage',
    'upsertTranslationLanguage',
    'deleteTranslationLanguage',
    'listSettings',
    'getAllSettings',
    'getSetting',
    'getPublicSettings',
    'getCmsMode',
    'setSetting',
    'setSettings',
    'deleteSetting',
    'getModuleSettingsSchema',
    'listModuleSettingsSchemas',
    'listRegisteredSettingsModules',
    'getModuleSettingValue',
    'listModuleSettings',
    'getModuleSettings',
    'registerModuleSettingsSchema',
    'registerSettingsSection',
    'updateModuleSettingValue',
    'updateModuleSettings',
    'deleteModuleSetting',
    'createContentPreviewToken'
  ];

  for (const eventName of blocked) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true, eventName);
    assert.match(explainExternalEventRejection(eventName, {}), /internal/, eventName);
  }
});

test('meltdown HTTP policy blocks direct comments metadata redirects and search events covered by runtime facade', () => {
  const blocked = [
    'createComment',
    'getComment',
    'listCommentsForEntry',
    'updateComment',
    'updateCommentStatus',
    'deleteComment',
    'registerMetaField',
    'getMetaField',
    'listMetaFields',
    'deleteMetaField',
    'setMetadata',
    'getMetadata',
    'getMetadataValue',
    'deleteMetadata',
    'deleteMetadataForTarget',
    'upsertRedirectRule',
    'getRedirectRule',
    'listRedirectRules',
    'deleteRedirectRule',
    'resolveRedirect',
    'recordRedirectHit',
    'listRedirectHits',
    'indexSearchDocument',
    'getSearchDocument',
    'removeSearchDocument',
    'searchDocuments',
    'reindexContentEntries'
  ];

  for (const eventName of blocked) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true, eventName);
    assert.match(explainExternalEventRejection(eventName, {}), /internal/, eventName);
  }
});

test('meltdown HTTP policy blocks direct backend infrastructure events covered by runtime facade', () => {
  const blocked = [
    'listLocalFolder',
    'createLocalFolder',
    'uploadFileToFolder',
    'deleteLocalItem',
    'renameLocalItem',
    'makeFilePublic',
    'registerNavigationLocation',
    'setLoginStrategyEnabled',
    'setCmsMode',
    'listActiveStaticFrontends',
    'listFontProviders',
    'listFonts',
    'addFont',
    'setFontProviderEnabled',
    'addServerLocation',
    'getServerLocation',
    'listServerLocations',
    'updateServerLocation',
    'deleteServerLocation',
    'createShareLink',
    'getShareDetails',
    'revokeShareLink',
    'addLanguage'
  ];

  for (const eventName of blocked) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true, eventName);
    assert.match(explainExternalEventRejection(eventName, {}), /internal/, eventName);
  }
});

test('meltdown HTTP policy blocks internal backend infrastructure events without facade aliases', () => {
  const blocked = [
    'appLoader:appEvent',
    'finalizeUserLogin',
    'generateRobotsTxt',
    'generateSeoSitemap',
    'generateXmlSitemap',
    'httpRequest',
    'issueRefreshToken',
    'publishScheduledContentEntries',
    'registerFontProvider',
    'requestDependency',
    'resolveContentPermalink',
    'userLogin',
    'validateToken'
  ];

  for (const eventName of blocked) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true, eventName);
    assert.match(explainExternalEventRejection(eventName, {}), /internal/, eventName);
  }

  assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has('dispatchAppEvent'), false);
  assert.strictEqual(explainExternalEventRejection('dispatchAppEvent', {
    moduleName: 'appLoader',
    appName: 'designer',
    event: 'designer-ready'
  }), null);
  assert.strictEqual(COMMUNITY_FORBIDDEN_DIRECT_EVENTS.has('dispatchAppEvent'), true);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('dispatchAppEvent'), true);
});

test('meltdown HTTP policy blocks direct agent manager events while preserving agent surface app bridge contracts', () => {
  const agentEvents = [
    'agent.getCapabilities',
    'agent.getApiDefinition',
    'agent.getSystemContext',
    'agent.publishSurfaceSnapshot',
    'agent.listSurfaceSnapshots',
    'agent.getSurfaceSnapshot',
    'agent.getSurfaceContext',
    'agent.getSurfacePreview',
    'agent.inspectSurface',
    'agent.listSurfaceActions',
    'agent.getSurfaceAction',
    'agent.validateSurfaceCommand',
    'agent.validateSurfaceWorkflow',
    'agent.listActivity',
    'agent.enqueueSurfaceCommand',
    'agent.invokeSurfaceCommand',
    'agent.invokeSurfaceCommandAndObserve',
    'agent.refreshSurface',
    'agent.invokeSurfaceWorkflow',
    'agent.pollSurfaceCommands',
    'agent.ackSurfaceCommand',
    'agent.listSurfaceCommands',
    'agent.getSurfaceCommand',
    'agent.waitForSurfaceCommand'
  ];

  for (const eventName of agentEvents) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true, eventName);
    assert.match(explainExternalEventRejection(eventName, {}), /internal/, eventName);
  }

  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('agent.getCapabilities'), false);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('agent.publishSurfaceSnapshot'), false);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('agent.enqueueSurfaceCommand'), true);
});

test('meltdown HTTP policy strips caller supplied auth metadata from payloads', () => {
  const payload = {
    jwt: 'body-token',
    decodedJWT: { permissions: { '*': true } },
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'pages',
    action: 'list',
    params: { status: 'draft' }
  };

  assert.deepStrictEqual(stripHttpPayloadAuthMeta(payload), {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'pages',
    action: 'list',
    params: { status: 'draft' }
  });
  assert.strictEqual(payload.jwt, 'body-token');
  assert.deepStrictEqual(payload.decodedJWT, { permissions: { '*': true } });
  assert.deepStrictEqual(stripHttpPayloadAuthMeta(null), {});
});

test('meltdown HTTP policy requires explicit runtime facade contracts for admin API access', () => {
  const blockedDirectEvents = [
    'createPage',
    'getAllUsers',
    'getRecentNotifications',
    'listContentEntries',
    'getNavigationTree',
    'listCommentsForEntry',
    'searchDocuments',
    'listFonts',
    'getShareDetails'
  ];

  for (const eventName of blockedDirectEvents) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true, eventName);
    assert.match(explainExternalEventRejection(eventName, {}), /internal/, eventName);
  }

  const adminFacades = [
    {
      resource: 'pages',
      action: 'create',
      params: { title: 'About', lane: 'admin' }
    },
    {
      resource: 'users',
      action: 'list',
      params: {}
    },
    {
      resource: 'notifications',
      action: 'recent',
      params: { limit: 5 }
    },
    {
      resource: 'content',
      action: 'list',
      params: { status: 'draft', limit: 20 }
    },
    {
      resource: 'navigation',
      action: 'tree',
      params: { locationKey: 'main' }
    },
    {
      resource: 'comments',
      action: 'listForEntry',
      params: { entryId: 'entry-1', status: 'pending' }
    },
    {
      resource: 'search',
      action: 'query',
      params: { query: 'launch', status: 'draft' }
    },
    {
      resource: 'fonts',
      action: 'list',
      params: {}
    },
    {
      resource: 'shares',
      action: 'get',
      params: { shortToken: 'abc123' }
    }
  ];

  for (const facade of adminFacades) {
    assert.strictEqual(explainExternalEventRejection('cmsAdminApiRequest', {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      ...facade
    }), null, `${facade.resource}.${facade.action}`);
  }

  assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has('getUserCount'), true);
  assert.strictEqual(isHttpPublicTokenEvent('getUserCount'), false);
  assert.match(explainExternalEventRejection('getUserCount', {}), /internal/);
});
test('app meltdown route uses the shared HTTP policy', () => {
  const routerSource = fs.readFileSync(path.join(__dirname, '..', 'mother/server/http/meltdownRouter.js'), 'utf8');
  const authSource = fs.readFileSync(path.join(__dirname, '..', 'mother/server/auth/adminAuth.js'), 'utf8');
  assert.match(routerSource, /meltdownHttpPolicy/);
  assert.doesNotMatch(routerSource, /translate[A-Za-z]+HttpFacadeEvent/);
  assert.match(authSource, /jwt:\s*token,\s*\r?\n\s*moduleName: 'auth'/);
  assert.match(authSource, /tokenToValidate:\s*token/);
  assert.match(routerSource, /stripHttpPayloadAuthMeta\(payload\)/);
  assert.match(routerSource, /explainExternalEventRejection\(targetEventName, targetPayload\)/);
  assert.match(routerSource, /isHttpPublicEvent\(targetEventName\)/);
  assert.match(routerSource, /isHttpPublicTokenEvent\(targetEventName\)/);
  assert.match(routerSource, /isHttpAdminPrincipal\(decoded\)/);
  assert.match(routerSource, /const jwt = globalJwt;/);
  assert.doesNotMatch(routerSource, /targetPayload\.jwt\s*\|\|\s*globalJwt/);
  assert.match(routerSource, /listenerCount\(targetEventName\) === 0/);
  assert.match(routerSource, /motherEmitter\.emit\(targetEventName, targetPayload/);
  assert.doesNotMatch(routerSource, /unwrapData/);
});

test('app bridge policy blocks sensitive system query contracts', () => {
  assert.strictEqual(APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS.has('getAllUsers'), true);
  assert.strictEqual(APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS.has('listLoginStrategies'), true);
  assert.strictEqual(APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS.has('getSetting'), true);
  assert.strictEqual(APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS.has('getPublicSettings'), true);
  assert.strictEqual(APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS.has('listThemes'), true);
  assert.strictEqual(APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS.has('listImporters'), true);
  assert.strictEqual(APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS.has('searchPages'), false);
});

test('module and app boundaries share sensitive system query policy', () => {
  assert.strictEqual(APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS, SENSITIVE_SYSTEM_QUERY_EVENTS);
  assert.strictEqual(SENSITIVE_SYSTEM_QUERY_EVENTS.has('getAllPermissions'), true);
  assert.strictEqual(SENSITIVE_SYSTEM_QUERY_EVENTS.has('getTheme'), true);
  assert.strictEqual(SENSITIVE_SYSTEM_QUERY_EVENTS.has('listActiveStaticFrontends'), true);
  assert.strictEqual(COMMUNITY_FORBIDDEN_DIRECT_EVENTS.has('cmsAdminApiRequest'), true);
  assert.strictEqual(COMMUNITY_FORBIDDEN_DIRECT_EVENTS.has('cmsPublicRuntimeRequest'), true);
  assert.strictEqual(COMMUNITY_FORBIDDEN_DIRECT_EVENTS.has('requestDependency'), true);
  assert.strictEqual(COMMUNITY_FORBIDDEN_DIRECT_EVENTS.has('validateToken'), true);
  assert.strictEqual(COMMUNITY_FORBIDDEN_DIRECT_EVENTS.has('dbSelect'), false);
});
