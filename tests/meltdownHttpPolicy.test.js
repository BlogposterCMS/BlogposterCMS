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
  HTTP_LEGACY_ADMIN_EVENT_FACADE_ACTIONS,
  HTTP_PUBLIC_TOKEN_EVENTS,
  isHttpDirectContractEvent,
  isHttpPublicEvent,
  isHttpPublicTokenEvent,
  SENSITIVE_SYSTEM_QUERY_EVENTS,
  stripHttpPayloadAuthMeta,
  translateLegacyHttpFacadeEvent
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

test('meltdown HTTP policy only exposes token bootstrap as public events', () => {
  assert.strictEqual(isHttpPublicEvent('issuePublicToken'), true);
  assert.strictEqual(isHttpPublicEvent('ensurePublicToken'), true);
  assert.strictEqual(isHttpDirectContractEvent('cmsAdminApiRequest'), true);
  assert.strictEqual(isHttpDirectContractEvent('dispatchAppEvent'), true);
  assert.strictEqual(isHttpPublicTokenEvent('cmsPublicRuntimeRequest'), true);
  assert.strictEqual(isHttpPublicTokenEvent('getPublicSetting'), true);
  assert.strictEqual(isHttpPublicTokenEvent('getUserCount'), true);
  assert.strictEqual(isHttpPublicTokenEvent('listActiveLoginStrategies'), true);
  assert.strictEqual(isHttpPublicTokenEvent('publicRegister'), true);
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
    ...Object.keys(HTTP_LEGACY_ADMIN_EVENT_FACADE_ACTIONS),
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

test('meltdown HTTP policy blocks direct PlainSpace presentation events through the runtime facade', () => {
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
    assert(HTTP_LEGACY_ADMIN_EVENT_FACADE_ACTIONS[eventName], eventName);
  }

  const translatedLayout = translateLegacyHttpFacadeEvent('saveLayoutForViewport', {
    jwt: 'browser-token',
    moduleName: 'plainspace',
    moduleType: 'core',
    pageId: 'page-1',
    lane: 'public',
    viewport: 'desktop',
    layout: [{ widgetId: 'hero' }]
  });
  assert.deepStrictEqual(translatedLayout.payload, {
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
  });

  const translatedEnvelope = translateLegacyHttpFacadeEvent('getEnvelope', {
    jwt: 'browser-token',
    moduleName: 'pagesManager',
    moduleType: 'core',
    slug: 'home'
  });
  assert.deepStrictEqual(translatedEnvelope.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'pages',
    action: 'envelope',
    params: { slug: 'home' }
  });
  assert.strictEqual(translatedEnvelope.eventName, 'cmsPublicRuntimeRequest');
  assert.strictEqual(explainExternalEventRejection(translatedEnvelope.eventName, translatedEnvelope.payload), null);

  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('getLayoutForViewport'), false);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('getLayoutTemplate'), false);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('saveLayoutForViewport'), false);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('widget.registry.request.v1'), false);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('saveLayoutTemplate'), true);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('getWidgetInstance'), true);
});

test('meltdown HTTP policy blocks direct designer events through runtime facades', () => {
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
    assert(HTTP_LEGACY_ADMIN_EVENT_FACADE_ACTIONS[eventName], eventName);
  }

  const publicDesign = translateLegacyHttpFacadeEvent('designer.getDesign', {
    jwt: 'public-token',
    moduleName: 'designer',
    moduleType: 'core',
    id: 'design-1'
  });
  assert.strictEqual(publicDesign.eventName, 'cmsPublicRuntimeRequest');
  assert.deepStrictEqual(publicDesign.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'designer',
    action: 'get',
    params: { id: 'design-1' }
  });

  const publicDesignLayout = translateLegacyHttpFacadeEvent('designer.getLayout', {
    jwt: 'public-token',
    moduleName: 'designer',
    moduleType: 'core',
    lane: 'public',
    layoutRef: 'layout:design-1@v1'
  });
  assert.strictEqual(publicDesignLayout.eventName, 'cmsPublicRuntimeRequest');
  assert.deepStrictEqual(publicDesignLayout.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'designer',
    action: 'getLayout',
    params: { lane: 'public', layoutRef: 'layout:design-1@v1' }
  });

  const adminDesign = translateLegacyHttpFacadeEvent('designer.getDesign', {
    moduleName: 'designer',
    moduleType: 'core',
    id: 'design-1',
    lane: 'admin'
  });
  assert.strictEqual(adminDesign.eventName, 'cmsAdminApiRequest');
  assert.strictEqual(adminDesign.payload.action, 'get');

  const listDesigns = translateLegacyHttpFacadeEvent('designer.listDesigns', {
    moduleName: 'designer',
    moduleType: 'core'
  });
  assert.strictEqual(listDesigns.eventName, 'cmsAdminApiRequest');
  assert.strictEqual(listDesigns.payload.action, 'list');

  const saveDesign = translateLegacyHttpFacadeEvent('designer.saveDesign', {
    moduleName: 'designer',
    moduleType: 'core',
    title: 'Hero'
  });
  assert.strictEqual(saveDesign.eventName, 'cmsAdminApiRequest');
  assert.strictEqual(saveDesign.payload.action, 'save');

  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('designer.getDesign'), false);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('designer.listDesigns'), false);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('designer.saveDesign'), false);
  assert.strictEqual(APP_FORBIDDEN_DIRECT_EVENTS.has('designer.getLayout'), true);
});

test('meltdown HTTP policy routes public runtime legacy reads through a public facade', () => {
  const start = translateLegacyHttpFacadeEvent('getStartPage', {
    jwt: 'public-token',
    moduleName: 'pagesManager',
    moduleType: 'core',
    language: 'en'
  });
  assert.strictEqual(start.eventName, 'cmsPublicRuntimeRequest');
  assert.deepStrictEqual(start.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'pages',
    action: 'start',
    params: { language: 'en' }
  });
  assert.strictEqual(explainExternalEventRejection(start.eventName, start.payload), null);

  const publicPage = translateLegacyHttpFacadeEvent('getPageBySlug', {
    moduleName: 'pagesManager',
    moduleType: 'core',
    slug: 'home',
    lane: 'public'
  });
  assert.strictEqual(publicPage.eventName, 'cmsPublicRuntimeRequest');
  assert.strictEqual(publicPage.payload.action, 'getBySlug');

  const adminPage = translateLegacyHttpFacadeEvent('getPageBySlug', {
    moduleName: 'pagesManager',
    moduleType: 'core',
    slug: 'settings',
    lane: 'admin'
  });
  assert.strictEqual(adminPage.eventName, 'cmsAdminApiRequest');
  assert.strictEqual(adminPage.payload.action, 'getBySlug');

  const publicWidgets = translateLegacyHttpFacadeEvent('getWidgets', {
    moduleName: 'widgetManager',
    moduleType: 'core',
    widgetType: 'public'
  });
  assert.strictEqual(publicWidgets.eventName, 'cmsPublicRuntimeRequest');
  assert.deepStrictEqual(publicWidgets.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'widgets',
    action: 'list',
    params: { widgetType: 'public' }
  });

  const adminRegistry = translateLegacyHttpFacadeEvent('widget.registry.request.v1', {
    moduleName: 'plainspace',
    moduleType: 'core',
    lane: 'admin'
  });
  assert.strictEqual(adminRegistry.eventName, 'cmsAdminApiRequest');

  const publicRegistry = translateLegacyHttpFacadeEvent('widget.registry.request.v1', {
    moduleName: 'plainspace',
    moduleType: 'core',
    lane: 'public'
  });
  assert.strictEqual(publicRegistry.eventName, 'cmsPublicRuntimeRequest');

  const publicLayout = translateLegacyHttpFacadeEvent('getLayoutForViewport', {
    moduleName: 'plainspace',
    moduleType: 'core',
    pageId: 'page-1',
    lane: 'public',
    viewport: 'desktop'
  });
  assert.strictEqual(publicLayout.eventName, 'cmsPublicRuntimeRequest');
  assert.strictEqual(publicLayout.payload.action, 'layoutForViewport');

  const publicGlobalTemplate = translateLegacyHttpFacadeEvent('getGlobalLayoutTemplate', {
    moduleName: 'plainspace',
    moduleType: 'core',
    lane: 'public'
  });
  assert.strictEqual(publicGlobalTemplate.eventName, 'cmsPublicRuntimeRequest');
  assert.strictEqual(publicGlobalTemplate.payload.action, 'globalLayoutTemplate');

  const adminGlobalTemplate = translateLegacyHttpFacadeEvent('getGlobalLayoutTemplate', {
    moduleName: 'plainspace',
    moduleType: 'core',
    lane: 'admin'
  });
  assert.strictEqual(adminGlobalTemplate.eventName, 'cmsAdminApiRequest');

  const publicWidgetInstance = translateLegacyHttpFacadeEvent('getWidgetInstance', {
    moduleName: 'plainspace',
    moduleType: 'core',
    instanceId: 'default.hero'
  });
  assert.strictEqual(publicWidgetInstance.eventName, 'cmsPublicRuntimeRequest');

  const privateWidgetInstance = translateLegacyHttpFacadeEvent('getWidgetInstance', {
    moduleName: 'plainspace',
    moduleType: 'core',
    instanceId: 'custom.secret'
  });
  assert.strictEqual(privateWidgetInstance.eventName, 'cmsAdminApiRequest');
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
    assert.strictEqual(HTTP_LEGACY_ADMIN_EVENT_FACADE_ACTIONS[eventName], undefined, eventName);
    assert.strictEqual(translateLegacyHttpFacadeEvent(eventName, {}), null, eventName);
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

test('meltdown HTTP policy blocks internal backend infrastructure events without legacy facade mapping', () => {
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
    assert.strictEqual(translateLegacyHttpFacadeEvent(eventName, {}), null, eventName);
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
    assert.strictEqual(translateLegacyHttpFacadeEvent(eventName, {}), null, eventName);
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

test('meltdown HTTP policy translates legacy admin events through runtime facade', () => {
  const blockedLegacyEvents = Object.keys(HTTP_LEGACY_ADMIN_EVENT_FACADE_ACTIONS);

  for (const eventName of blockedLegacyEvents) {
    assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(eventName), true, eventName);
    assert.match(explainExternalEventRejection(eventName, {}), /internal/, eventName);
    assert(HTTP_LEGACY_ADMIN_EVENT_FACADE_ACTIONS[eventName], eventName);
  }

  const translated = translateLegacyHttpFacadeEvent('createPage', {
    jwt: 'browser-token',
    decodedJWT: { permissions: { '*': true } },
    moduleName: 'pagesManager',
    moduleType: 'core',
    title: 'About',
    lane: 'admin'
  });

  assert.deepStrictEqual(translated, {
    originalEventName: 'createPage',
    eventName: 'cmsAdminApiRequest',
    unwrapData: true,
    payload: {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'create',
      params: {
        title: 'About',
        lane: 'admin'
      }
    }
  });
  assert.strictEqual(explainExternalEventRejection(translated.eventName, translated.payload), null);

  const translatedRead = translateLegacyHttpFacadeEvent('getAllUsers', {
    moduleName: 'userManagement',
    moduleType: 'core',
    jwt: 'browser-token'
  });
  assert.strictEqual(translatedRead.eventName, 'cmsAdminApiRequest');
  assert.deepStrictEqual(translatedRead.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'users',
    action: 'list',
    params: {}
  });

  const translatedShellRead = translateLegacyHttpFacadeEvent('getRecentNotifications', {
    jwt: 'browser-token',
    moduleName: 'notificationManager',
    moduleType: 'core',
    limit: 5
  });
  assert.deepStrictEqual(translatedShellRead.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'notifications',
    action: 'recent',
    params: { limit: 5 }
  });

  const translatedContentRead = translateLegacyHttpFacadeEvent('listContentEntries', {
    jwt: 'browser-token',
    decodedJWT: { permissions: { '*': true } },
    moduleName: 'contentEngine',
    moduleType: 'core',
    status: 'draft',
    limit: 20
  });
  assert.deepStrictEqual(translatedContentRead.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'content',
    action: 'list',
    params: {
      status: 'draft',
      limit: 20
    }
  });

  const translatedPresentationRead = translateLegacyHttpFacadeEvent('getNavigationTree', {
    jwt: 'browser-token',
    moduleName: 'navigationManager',
    moduleType: 'core',
    locationKey: 'main'
  });
  assert.deepStrictEqual(translatedPresentationRead.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'navigation',
    action: 'tree',
    params: { locationKey: 'main' }
  });

  const translatedCommentRead = translateLegacyHttpFacadeEvent('listCommentsForEntry', {
    jwt: 'browser-token',
    moduleName: 'commentsManager',
    moduleType: 'core',
    entryId: 'entry-1',
    status: 'pending'
  });
  assert.deepStrictEqual(translatedCommentRead.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'comments',
    action: 'listForEntry',
    params: {
      entryId: 'entry-1',
      status: 'pending'
    }
  });

  const translatedSearchRead = translateLegacyHttpFacadeEvent('searchDocuments', {
    jwt: 'browser-token',
    moduleName: 'searchManager',
    moduleType: 'core',
    query: 'launch',
    status: 'draft'
  });
  assert.deepStrictEqual(translatedSearchRead.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'search',
    action: 'query',
    params: {
      query: 'launch',
      status: 'draft'
    }
  });

  const translatedFontRead = translateLegacyHttpFacadeEvent('listFonts', {
    jwt: 'browser-token',
    moduleName: 'fontsManager',
    moduleType: 'core'
  });
  assert.deepStrictEqual(translatedFontRead.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'fonts',
    action: 'list',
    params: {}
  });

  const translatedShareRead = translateLegacyHttpFacadeEvent('getShareDetails', {
    jwt: 'browser-token',
    moduleName: 'shareManager',
    moduleType: 'core',
    shortToken: 'abc123'
  });
  assert.deepStrictEqual(translatedShareRead.payload, {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'shares',
    action: 'get',
    params: { shortToken: 'abc123' }
  });

  assert.strictEqual(HTTP_FORBIDDEN_EXTERNAL_EVENTS.has('getUserCount'), false);
  assert.strictEqual(translateLegacyHttpFacadeEvent('getUserCount', {}), null);
});

test('app meltdown route uses the shared HTTP policy', () => {
  const routerSource = fs.readFileSync(path.join(__dirname, '..', 'mother/server/http/meltdownRouter.js'), 'utf8');
  const authSource = fs.readFileSync(path.join(__dirname, '..', 'mother/server/auth/adminAuth.js'), 'utf8');
  assert.match(routerSource, /meltdownHttpPolicy/);
  assert.match(routerSource, /translateLegacyHttpFacadeEvent\(eventName, payload\)/);
  assert.match(authSource, /jwt:\s*token,\s*\r?\n\s*moduleName: 'auth'/);
  assert.match(authSource, /tokenToValidate:\s*token/);
  assert.match(routerSource, /stripHttpPayloadAuthMeta\(legacyFacade\?\.payload \|\| payload\)/);
  assert.match(routerSource, /explainExternalEventRejection\(targetEventName, targetPayload\)/);
  assert.match(routerSource, /isHttpPublicEvent\(targetEventName\)/);
  assert.match(routerSource, /isHttpPublicTokenEvent\(targetEventName\)/);
  assert.match(routerSource, /isHttpAdminPrincipal\(decoded\)/);
  assert.match(routerSource, /const jwt = globalJwt;/);
  assert.doesNotMatch(routerSource, /targetPayload\.jwt\s*\|\|\s*globalJwt/);
  assert.match(routerSource, /listenerCount\(targetEventName\) === 0/);
  assert.match(routerSource, /motherEmitter\.emit\(targetEventName, targetPayload/);
  assert.match(routerSource, /legacyFacade\?\.unwrapData \? data\?\.data : data/);
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
  assert.strictEqual(COMMUNITY_FORBIDDEN_DIRECT_EVENTS.has('cmsAdminApiRequest'), true);
  assert.strictEqual(COMMUNITY_FORBIDDEN_DIRECT_EVENTS.has('cmsPublicRuntimeRequest'), true);
  assert.strictEqual(COMMUNITY_FORBIDDEN_DIRECT_EVENTS.has('requestDependency'), true);
  assert.strictEqual(COMMUNITY_FORBIDDEN_DIRECT_EVENTS.has('validateToken'), true);
  assert.strictEqual(COMMUNITY_FORBIDDEN_DIRECT_EVENTS.has('dbSelect'), false);
});
