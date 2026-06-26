'use strict';

const HTTP_PUBLIC_EVENTS = new Set([
  'issuePublicToken',
  'ensurePublicToken'
]);

const HTTP_PUBLIC_TOKEN_EVENTS = new Set([
  'cmsPublicRuntimeRequest',
  'getPublicSetting',
  'getUserCount',
  'listActiveLoginStrategies',
  'loginWithStrategy',
  'publicRegister'
]);

const HTTP_DIRECT_CONTRACT_EVENTS = new Set([
  ...HTTP_PUBLIC_EVENTS,
  ...HTTP_PUBLIC_TOKEN_EVENTS,
  'cmsAdminApiRequest',
  'dispatchAppEvent'
]);

const AGENT_ACCESS_EVENTS = new Set([
  'agentAccess.createCode',
  'agentAccess.createDevSession',
  'agentAccess.exchangeCode',
  'agentAccess.listCodes',
  'agentAccess.revokeCode'
]);

const AGENT_SURFACE_BRIDGE_EVENTS = new Set([
  'agent.getCapabilities',
  'agent.getApiDefinition',
  'agent.getSurfaceContext',
  'agent.getSurfaceAction',
  'agent.listSurfaceActions',
  'agent.listSurfaceCommands',
  'agent.publishSurfaceSnapshot',
  'agent.pollSurfaceCommands',
  'agent.ackSurfaceCommand'
]);

const AGENT_MANAGER_EVENTS = new Set([
  ...AGENT_SURFACE_BRIDGE_EVENTS,
  'agent.getSystemContext',
  'agent.listSurfaceSnapshots',
  'agent.getSurfaceSnapshot',
  'agent.getSurfacePreview',
  'agent.inspectSurface',
  'agent.validateSurfaceCommand',
  'agent.validateSurfaceWorkflow',
  'agent.listActivity',
  'agent.enqueueSurfaceCommand',
  'agent.invokeSurfaceCommand',
  'agent.invokeSurfaceCommandAndObserve',
  'agent.refreshSurface',
  'agent.invokeSurfaceWorkflow',
  'agent.getSurfaceCommand',
  'agent.waitForSurfaceCommand'
]);

const PLAINSPACE_PRESENTATION_EVENTS = new Set([
  'deleteLayoutTemplate',
  'getAllLayoutsForPage',
  'getEnvelope',
  'getGlobalLayoutTemplate',
  'getLayoutForViewport',
  'getLayoutTemplate',
  'getLayoutTemplateNames',
  'getPublishedDesignMeta',
  'getWidgetInstance',
  'saveLayoutForViewport',
  'saveLayoutTemplate',
  'savePublishedDesignMeta',
  'saveWidgetInstance',
  'setGlobalLayoutTemplate',
  'widget.registry.request.v1'
]);

const DESIGNER_MANAGER_EVENTS = new Set([
  'designer.getDesign',
  'designer.getLayout',
  'designer.listDesigns',
  'designer.listLayouts',
  'designer.saveDesign'
]);

const HTTP_FORBIDDEN_EXTERNAL_EVENTS = new Set([
  'acquireContentLock',
  'addNavigationMenuItem',
  'activateModuleInRegistry',
  'activateTheme',
  'applySchemaDefinition',
  'applySchemaFile',
  'approveContentReview',
  'createDatabase',
  'createContentEntry',
  'createContentPreviewToken',
  'createMediaAttachment',
  'createTranslatedText',
  'createWidget',
  'dbDelete',
  'dbInsert',
  'dbSelect',
  'dbUpdate',
  'deleteContentAutosave',
  'deleteMediaAttachment',
  'deleteMediaVariant',
  'deleteModuleSetting',
  'deleteNavigationMenuItem',
  'deleteSeoMeta',
  'deleteSetting',
  'deleteTranslatedText',
  'deleteTranslationLanguage',
  'deleteWidget',
  'deactivateModule',
  'deactivateModuleInRegistry',
  'installAppFromDirectory',
  'installModuleFromZip',
  'issueModuleToken',
  'issueUserToken',
  'localDbDelete',
  'localDbInsert',
  'localDbSelect',
  'localDbUpdate',
  'linkMediaToContent',
  'performDbOperation',
  'publishContentEntry',
  'registerLoginStrategy',
  'registerWidgetUsage',
  'registerContentType',
  'registerModuleSettingsSchema',
  'registerSettingsSection',
  'refreshContentLock',
  'refreshAccessToken',
  'rejectContentReview',
  'releaseContentLock',
  'restoreContentEntry',
  'restoreContentRevision',
  'revokeAllTokensForUser',
  'revokeRefreshToken',
  'revokeToken',
  'runExport',
  'runImport',
  'rescanApps',
  'saveContentAutosave',
  'saveLayout.v1',
  'setNavigationMenuItems',
  'setSeoDefaults',
  'setSettings',
  'setSetting',
  'setModuleTokenExpiry',
  'setUserTokenExpiry',
  'submitContentReview',
  'trashContentEntry',
  'unlinkMediaFromContent',
  'uninstallApp',
  'updateContentEntry',
  'updateMediaAttachment',
  'updateModuleSettingValue',
  'updateModuleSettings',
  'updateNavigationMenuItem',
  'updateTranslatedText',
  'upsertMediaVariant',
  'upsertNavigationMenu',
  'upsertSeoMeta',
  'upsertTranslatedText',
  'upsertTranslationLanguage',
  'updateWidget',
  'createPage',
  'updatePage',
  'setAsDeleted',
  'setAsStart',
  'deletePage',
  'createUser',
  'updateUserProfile',
  'deleteUser',
  'getAllUsers',
  'getUserDetailsById',
  'getUserDetailsByUsername',
  'getContentAutosave',
  'getContentEntry',
  'getContentEntryBySource',
  'getContentLock',
  'getContentReview',
  'getContentRevision',
  'getContentRevisions',
  'getContentType',
  'getMediaAttachment',
  'getModuleSettings',
  'getModuleSettingsSchema',
  'getModuleSettingValue',
  'getNavigationMenu',
  'getNavigationTree',
  'getSeoDefaults',
  'getSeoMeta',
  'getTranslatedText',
  'getTranslationLanguage',
  'getWidgets',
  'listContentAutosaves',
  'listContentEntries',
  'listContentForMedia',
  'listContentReviewQueue',
  'listContentTypes',
  'listLanguages',
  'listMediaAttachments',
  'listMediaForContent',
  'listMediaVariants',
  'createRole',
  'updateRole',
  'deleteRole',
  'assignRoleToUser',
  'removeRoleFromUser',
  'incrementUserTokenVersion',
  'getAllRoles',
  'getRolesForUser',
  'listLoginStrategies',
  'createPermission',
  'getAllPermissions',
  'listSettings',
  'getSetting',
  'getPublicSettings',
  'getAllSettings',
  'getCmsMode',
  'listModuleSettings',
  'listModuleSettingsSchemas',
  'listNavigationLocations',
  'listNavigationMenus',
  'listRegisteredSettingsModules',
  'listScheduledContentEntries',
  'listSeoMeta',
  'listTranslatedTexts',
  'listTrashedContentEntries',
  'getModuleRegistry',
  'listSystemModules',
  'listActiveGrapesModules',
  'listApps',
  'getApp',
  'getAppLaunchInfo',
  'listBuilderApps',
  'listImporters',
  'listExporters',
  'listThemes',
  'getTheme',
  'getActiveTheme',
  'getRecentNotifications',
  'resolveSeoMeta',
  'getAllPages',
  'getPagesByLane',
  'getPageById',
  'getPageBySlug',
  'getStartPage',
  'getChildPages',
  'searchPages',
  'removeListenersByModule'
]);

AGENT_ACCESS_EVENTS.forEach(eventName => HTTP_FORBIDDEN_EXTERNAL_EVENTS.add(eventName));
AGENT_MANAGER_EVENTS.forEach(eventName => HTTP_FORBIDDEN_EXTERNAL_EVENTS.add(eventName));
PLAINSPACE_PRESENTATION_EVENTS.forEach(eventName => HTTP_FORBIDDEN_EXTERNAL_EVENTS.add(eventName));
DESIGNER_MANAGER_EVENTS.forEach(eventName => HTTP_FORBIDDEN_EXTERNAL_EVENTS.add(eventName));

[
  'addFont',
  'addLanguage',
  'addServerLocation',
  'appLoader:appEvent',
  'createLocalFolder',
  'createComment',
  'createShareLink',
  'deleteLocalItem',
  'deleteComment',
  'deleteServerLocation',
  'finalizeUserLogin',
  'generateRobotsTxt',
  'generateSeoSitemap',
  'generateXmlSitemap',
  'getComment',
  'getServerLocation',
  'getShareDetails',
  'httpRequest',
  'issueRefreshToken',
  'listCommentsForEntry',
  'listFontProviders',
  'listFonts',
  'listLocalFolder',
  'listServerLocations',
  'makeFilePublic',
  'publishScheduledContentEntries',
  'registerFontProvider',
  'registerNavigationLocation',
  'renameLocalItem',
  'requestDependency',
  'resolveContentPermalink',
  'revokeShareLink',
  'setCmsMode',
  'setFontProviderEnabled',
  'setLoginStrategyEnabled',
  'updateServerLocation',
  'uploadFileToFolder',
  'userLogin',
  'validateToken',
  'updateComment',
  'updateCommentStatus',
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
].forEach(eventName => HTTP_FORBIDDEN_EXTERNAL_EVENTS.add(eventName));

const HTTP_LEGACY_ADMIN_EVENT_FACADE_ACTIONS = Object.freeze({
  listContentEntries: { resource: 'content', action: 'list' },
  getContentEntry: { resource: 'content', action: 'get' },
  createContentEntry: { resource: 'content', action: 'create' },
  updateContentEntry: { resource: 'content', action: 'update' },
  publishContentEntry: { resource: 'content', action: 'publish' },
  trashContentEntry: { resource: 'content', action: 'trash' },
  restoreContentEntry: { resource: 'content', action: 'restore' },
  getContentRevisions: { resource: 'content', action: 'revisions' },
  getContentRevision: { resource: 'content', action: 'revision' },
  restoreContentRevision: { resource: 'content', action: 'restoreRevision' },
  listScheduledContentEntries: { resource: 'content', action: 'scheduled' },
  listTrashedContentEntries: { resource: 'content', action: 'trashed' },
  getAllPages: { resource: 'pages', action: 'list' },
  getPagesByLane: { resource: 'pages', action: 'byLane' },
  getPageById: { resource: 'pages', action: 'get' },
  getPageBySlug: { resource: 'pages', action: 'getBySlug' },
  getStartPage: { resource: 'pages', action: 'start' },
  getChildPages: { resource: 'pages', action: 'children' },
  getEnvelope: { resource: 'pages', action: 'envelope' },
  searchPages: { resource: 'pages', action: 'search' },
  createPage: { resource: 'pages', action: 'create' },
  updatePage: { resource: 'pages', action: 'update' },
  setAsDeleted: { resource: 'pages', action: 'trash' },
  setAsStart: { resource: 'pages', action: 'setStart' },
  deletePage: { resource: 'pages', action: 'delete' },
  listContentTypes: { resource: 'contentTypes', action: 'list' },
  getContentType: { resource: 'contentTypes', action: 'get' },
  registerContentType: { resource: 'contentTypes', action: 'upsert' },
  listMediaAttachments: { resource: 'media', action: 'list' },
  getMediaAttachment: { resource: 'media', action: 'get' },
  createMediaAttachment: { resource: 'media', action: 'create' },
  updateMediaAttachment: { resource: 'media', action: 'update' },
  deleteMediaAttachment: { resource: 'media', action: 'delete' },
  upsertMediaVariant: { resource: 'media', action: 'upsertVariant' },
  listMediaVariants: { resource: 'media', action: 'listVariants' },
  deleteMediaVariant: { resource: 'media', action: 'deleteVariant' },
  linkMediaToContent: { resource: 'media', action: 'link' },
  unlinkMediaFromContent: { resource: 'media', action: 'unlink' },
  listMediaForContent: { resource: 'media', action: 'listForContent' },
  listContentForMedia: { resource: 'media', action: 'listContent' },
  getWidgets: { resource: 'widgets', action: 'list' },
  createWidget: { resource: 'widgets', action: 'create' },
  updateWidget: { resource: 'widgets', action: 'update' },
  deleteWidget: { resource: 'widgets', action: 'delete' },
  'saveLayout.v1': { resource: 'widgets', action: 'saveLayout' },
  'widget.registry.request.v1': { resource: 'plainSpace', action: 'widgetRegistry' },
  getLayoutForViewport: { resource: 'plainSpace', action: 'layoutForViewport' },
  getAllLayoutsForPage: { resource: 'plainSpace', action: 'allLayoutsForPage' },
  saveLayoutForViewport: { resource: 'plainSpace', action: 'saveLayoutForViewport' },
  getLayoutTemplate: { resource: 'plainSpace', action: 'layoutTemplate' },
  getLayoutTemplateNames: { resource: 'plainSpace', action: 'layoutTemplateNames' },
  saveLayoutTemplate: { resource: 'plainSpace', action: 'saveLayoutTemplate' },
  deleteLayoutTemplate: { resource: 'plainSpace', action: 'deleteLayoutTemplate' },
  getGlobalLayoutTemplate: { resource: 'plainSpace', action: 'globalLayoutTemplate' },
  setGlobalLayoutTemplate: { resource: 'plainSpace', action: 'setGlobalLayoutTemplate' },
  getWidgetInstance: { resource: 'plainSpace', action: 'widgetInstance' },
  saveWidgetInstance: { resource: 'plainSpace', action: 'saveWidgetInstance' },
  getPublishedDesignMeta: { resource: 'plainSpace', action: 'publishedDesignMeta' },
  savePublishedDesignMeta: { resource: 'plainSpace', action: 'savePublishedDesignMeta' },
  acquireContentLock: { resource: 'workflow', action: 'acquireLock' },
  refreshContentLock: { resource: 'workflow', action: 'refreshLock' },
  releaseContentLock: { resource: 'workflow', action: 'releaseLock' },
  getContentLock: { resource: 'workflow', action: 'getLock' },
  saveContentAutosave: { resource: 'workflow', action: 'saveAutosave' },
  getContentAutosave: { resource: 'workflow', action: 'getAutosave' },
  listContentAutosaves: { resource: 'workflow', action: 'listAutosaves' },
  deleteContentAutosave: { resource: 'workflow', action: 'deleteAutosave' },
  submitContentReview: { resource: 'workflow', action: 'submitReview' },
  approveContentReview: { resource: 'workflow', action: 'approveReview' },
  rejectContentReview: { resource: 'workflow', action: 'rejectReview' },
  getContentReview: { resource: 'workflow', action: 'getReview' },
  listContentReviewQueue: { resource: 'workflow', action: 'reviewQueue' },
  listNavigationLocations: { resource: 'navigation', action: 'locations' },
  listNavigationMenus: { resource: 'navigation', action: 'menus' },
  getNavigationMenu: { resource: 'navigation', action: 'getMenu' },
  upsertNavigationMenu: { resource: 'navigation', action: 'upsertMenu' },
  addNavigationMenuItem: { resource: 'navigation', action: 'addItem' },
  setNavigationMenuItems: { resource: 'navigation', action: 'setItems' },
  updateNavigationMenuItem: { resource: 'navigation', action: 'updateItem' },
  deleteNavigationMenuItem: { resource: 'navigation', action: 'deleteItem' },
  getNavigationTree: { resource: 'navigation', action: 'tree' },
  getSeoDefaults: { resource: 'seo', action: 'defaults' },
  setSeoDefaults: { resource: 'seo', action: 'setDefaults' },
  getSeoMeta: { resource: 'seo', action: 'get' },
  listSeoMeta: { resource: 'seo', action: 'list' },
  upsertSeoMeta: { resource: 'seo', action: 'upsert' },
  deleteSeoMeta: { resource: 'seo', action: 'delete' },
  resolveSeoMeta: { resource: 'seo', action: 'resolve' },
  setCmsMode: { resource: 'settings', action: 'setCmsMode' },
  createComment: { resource: 'comments', action: 'create' },
  getComment: { resource: 'comments', action: 'get' },
  listCommentsForEntry: { resource: 'comments', action: 'listForEntry' },
  updateComment: { resource: 'comments', action: 'update' },
  updateCommentStatus: { resource: 'comments', action: 'updateStatus' },
  deleteComment: { resource: 'comments', action: 'delete' },
  registerMetaField: { resource: 'metadata', action: 'registerField' },
  getMetaField: { resource: 'metadata', action: 'getField' },
  listMetaFields: { resource: 'metadata', action: 'listFields' },
  deleteMetaField: { resource: 'metadata', action: 'deleteField' },
  setMetadata: { resource: 'metadata', action: 'set' },
  getMetadata: { resource: 'metadata', action: 'get' },
  getMetadataValue: { resource: 'metadata', action: 'getValue' },
  deleteMetadata: { resource: 'metadata', action: 'delete' },
  deleteMetadataForTarget: { resource: 'metadata', action: 'deleteForTarget' },
  listLocalFolder: { resource: 'media', action: 'listLocalFolder' },
  createLocalFolder: { resource: 'media', action: 'createLocalFolder' },
  uploadFileToFolder: { resource: 'media', action: 'uploadToFolder' },
  deleteLocalItem: { resource: 'media', action: 'deleteLocalItem' },
  renameLocalItem: { resource: 'media', action: 'renameLocalItem' },
  makeFilePublic: { resource: 'media', action: 'makeFilePublic' },
  upsertRedirectRule: { resource: 'redirects', action: 'upsert' },
  getRedirectRule: { resource: 'redirects', action: 'get' },
  listRedirectRules: { resource: 'redirects', action: 'list' },
  deleteRedirectRule: { resource: 'redirects', action: 'delete' },
  resolveRedirect: { resource: 'redirects', action: 'resolve' },
  recordRedirectHit: { resource: 'redirects', action: 'recordHit' },
  listRedirectHits: { resource: 'redirects', action: 'listHits' },
  indexSearchDocument: { resource: 'search', action: 'index' },
  getSearchDocument: { resource: 'search', action: 'get' },
  removeSearchDocument: { resource: 'search', action: 'remove' },
  searchDocuments: { resource: 'search', action: 'query' },
  reindexContentEntries: { resource: 'search', action: 'reindexContent' },
  registerNavigationLocation: { resource: 'navigation', action: 'registerLocation' },
  setLoginStrategyEnabled: { resource: 'auth', action: 'setStrategyEnabled' },
  listFontProviders: { resource: 'fonts', action: 'listProviders' },
  listFonts: { resource: 'fonts', action: 'list' },
  addFont: { resource: 'fonts', action: 'add' },
  setFontProviderEnabled: { resource: 'fonts', action: 'setProviderEnabled' },
  addServerLocation: { resource: 'serverLocations', action: 'create' },
  getServerLocation: { resource: 'serverLocations', action: 'get' },
  listServerLocations: { resource: 'serverLocations', action: 'list' },
  updateServerLocation: { resource: 'serverLocations', action: 'update' },
  deleteServerLocation: { resource: 'serverLocations', action: 'delete' },
  createShareLink: { resource: 'shares', action: 'create' },
  getShareDetails: { resource: 'shares', action: 'get' },
  revokeShareLink: { resource: 'shares', action: 'revoke' },
  addLanguage: { resource: 'translations', action: 'upsertLanguage' },
  listSettings: { resource: 'settings', action: 'list' },
  getAllSettings: { resource: 'settings', action: 'list' },
  getSetting: { resource: 'settings', action: 'get' },
  getPublicSettings: { resource: 'settings', action: 'public' },
  getCmsMode: { resource: 'settings', action: 'cmsMode' },
  setSetting: { resource: 'settings', action: 'set' },
  setSettings: { resource: 'settings', action: 'bulk' },
  deleteSetting: { resource: 'settings', action: 'delete' },
  getAllUsers: { resource: 'users', action: 'list' },
  getUserDetailsById: { resource: 'users', action: 'get' },
  getUserDetailsByUsername: { resource: 'users', action: 'getByUsername' },
  createUser: { resource: 'users', action: 'create' },
  updateUserProfile: { resource: 'users', action: 'update' },
  deleteUser: { resource: 'users', action: 'delete' },
  listLoginStrategies: { resource: 'auth', action: 'loginStrategies' },
  getAllRoles: { resource: 'roles', action: 'list' },
  getRolesForUser: { resource: 'roles', action: 'forUser' },
  createRole: { resource: 'roles', action: 'create' },
  updateRole: { resource: 'roles', action: 'update' },
  deleteRole: { resource: 'roles', action: 'delete' },
  assignRoleToUser: { resource: 'roles', action: 'assign' },
  removeRoleFromUser: { resource: 'roles', action: 'remove' },
  incrementUserTokenVersion: { resource: 'roles', action: 'incrementToken' },
  getAllPermissions: { resource: 'permissions', action: 'list' },
  createPermission: { resource: 'permissions', action: 'create' },
  getModuleRegistry: { resource: 'modules', action: 'registry' },
  listSystemModules: { resource: 'modules', action: 'system' },
  listActiveGrapesModules: { resource: 'modules', action: 'activeGrapes' },
  activateModuleInRegistry: { resource: 'modules', action: 'activate' },
  deactivateModuleInRegistry: { resource: 'modules', action: 'deactivate' },
  installModuleFromZip: { resource: 'modules', action: 'installZip' },
  listApps: { resource: 'apps', action: 'list' },
  getApp: { resource: 'apps', action: 'get' },
  listBuilderApps: { resource: 'apps', action: 'builderList' },
  getAppLaunchInfo: { resource: 'apps', action: 'launchInfo' },
  rescanApps: { resource: 'apps', action: 'rescan' },
  installAppFromDirectory: { resource: 'apps', action: 'installFromDirectory' },
  uninstallApp: { resource: 'apps', action: 'uninstall' },
  listImporters: { resource: 'importers', action: 'list' },
  runImport: { resource: 'importers', action: 'run' },
  listExporters: { resource: 'exporters', action: 'list' },
  runExport: { resource: 'exporters', action: 'run' },
  getModuleSettingsSchema: { resource: 'unifiedSettings', action: 'schema' },
  listModuleSettingsSchemas: { resource: 'unifiedSettings', action: 'schemas' },
  listRegisteredSettingsModules: { resource: 'unifiedSettings', action: 'modules' },
  getModuleSettingValue: { resource: 'unifiedSettings', action: 'get' },
  listModuleSettings: { resource: 'unifiedSettings', action: 'list' },
  getModuleSettings: { resource: 'unifiedSettings', action: 'bundle' },
  registerModuleSettingsSchema: { resource: 'unifiedSettings', action: 'registerSchema' },
  registerSettingsSection: { resource: 'unifiedSettings', action: 'registerSection' },
  updateModuleSettingValue: { resource: 'unifiedSettings', action: 'update' },
  updateModuleSettings: { resource: 'unifiedSettings', action: 'bulk' },
  deleteModuleSetting: { resource: 'unifiedSettings', action: 'delete' },
  listThemes: { resource: 'themes', action: 'list' },
  getTheme: { resource: 'themes', action: 'get' },
  getActiveTheme: { resource: 'themes', action: 'active' },
  activateTheme: { resource: 'themes', action: 'activate' },
  getTranslatedText: { resource: 'translations', action: 'get' },
  listTranslatedTexts: { resource: 'translations', action: 'list' },
  createTranslatedText: { resource: 'translations', action: 'create' },
  upsertTranslatedText: { resource: 'translations', action: 'upsert' },
  updateTranslatedText: { resource: 'translations', action: 'update' },
  deleteTranslatedText: { resource: 'translations', action: 'delete' },
  listLanguages: { resource: 'translations', action: 'listLanguages' },
  getTranslationLanguage: { resource: 'translations', action: 'getLanguage' },
  upsertTranslationLanguage: { resource: 'translations', action: 'upsertLanguage' },
  deleteTranslationLanguage: { resource: 'translations', action: 'deleteLanguage' },
  'designer.getDesign': { resource: 'designer', action: 'get' },
  'designer.getLayout': { resource: 'designer', action: 'getLayout' },
  'designer.listDesigns': { resource: 'designer', action: 'list' },
  'designer.listLayouts': { resource: 'designer', action: 'layouts' },
  'designer.saveDesign': { resource: 'designer', action: 'save' },
  createContentPreviewToken: { resource: 'preview', action: 'token' },
  getRecentNotifications: { resource: 'notifications', action: 'recent' }
});

const HTTP_LEGACY_PUBLIC_RUNTIME_EVENT_FACADE_ACTIONS = Object.freeze({
  getStartPage: { resource: 'pages', action: 'start' },
  getEnvelope: { resource: 'pages', action: 'envelope' },
  getPageBySlug: { resource: 'pages', action: 'getBySlug' },
  getPageById: { resource: 'pages', action: 'get' },
  getChildPages: { resource: 'pages', action: 'children' },
  getWidgets: { resource: 'widgets', action: 'list' },
  'widget.registry.request.v1': { resource: 'plainSpace', action: 'widgetRegistry' },
  getGlobalLayoutTemplate: { resource: 'plainSpace', action: 'globalLayoutTemplate' },
  getLayoutTemplate: { resource: 'plainSpace', action: 'layoutTemplate' },
  getLayoutForViewport: { resource: 'plainSpace', action: 'layoutForViewport' },
  getWidgetInstance: { resource: 'plainSpace', action: 'widgetInstance' },
  'designer.getDesign': { resource: 'designer', action: 'get' },
  'designer.getLayout': { resource: 'designer', action: 'getLayout' }
});

const LEGACY_HTTP_PAYLOAD_META_KEYS = new Set([
  'jwt',
  'decodedJWT',
  'moduleName',
  'moduleType',
  'isExternalRequest'
]);

const COMMUNITY_QUERY_EVENT_PREFIX = /^(get|list|find|search|query|read|count|has|is|can|check|lookup|resolve)/i;

const COMMUNITY_FORBIDDEN_DIRECT_EVENTS = new Set([
  ...Array.from(HTTP_FORBIDDEN_EXTERNAL_EVENTS).filter(eventName =>
    eventName !== 'dbSelect' && !COMMUNITY_QUERY_EVENT_PREFIX.test(eventName)
  ),
  'cmsAdminApiRequest',
  'cmsPublicRuntimeRequest',
  'dispatchAppEvent',
  'httpRequest',
  'requestDependency',
  'validateToken'
]);

const SENSITIVE_SYSTEM_QUERY_EVENTS = new Set([
  'getAllPermissions',
  'getAllRoles',
  'getAllSettings',
  'getAllUsers',
  'getApp',
  'getAppLaunchInfo',
  'getCmsMode',
  'getModuleRegistry',
  'getModuleSettingValue',
  'getModuleSettings',
  'getModuleSettingsSchema',
  'getPublicSetting',
  'getPublicSettings',
  'getRecentNotifications',
  'getRolesForUser',
  'getSetting',
  'getTheme',
  'getUserCount',
  'getUserDetailsById',
  'getUserDetailsByUsername',
  'listActiveGrapesModules',
  'listActiveLoginStrategies',
  'listApps',
  'listBuilderApps',
  'listExporters',
  'listImporters',
  'listLoginStrategies',
  'listModuleSettings',
  'listModuleSettingsSchemas',
  'listRegisteredSettingsModules',
  'listSettings',
  'listSystemModules',
  'listThemes'
]);

const APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS = SENSITIVE_SYSTEM_QUERY_EVENTS;

const APP_BRIDGE_MANIFEST_MANAGED_EVENTS = new Set([
  ...AGENT_SURFACE_BRIDGE_EVENTS,
  'deleteLocalItem',
  'designer.getDesign',
  'designer.listDesigns',
  'designer.saveDesign',
  'getGlobalLayoutTemplate',
  'getLayoutForViewport',
  'getLayoutTemplate',
  'getPublishedDesignMeta',
  'makeFilePublic',
  'saveLayoutForViewport',
  'savePublishedDesignMeta',
  'widget.registry.request.v1',
  'uploadFileToFolder'
]);

const APP_FORBIDDEN_DIRECT_EVENTS = new Set([
  ...Array.from(HTTP_FORBIDDEN_EXTERNAL_EVENTS).filter(eventName =>
    !APP_BRIDGE_MANIFEST_MANAGED_EVENTS.has(eventName)
  ),
  ...APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS,
  'cmsPublicRuntimeRequest',
  'dispatchAppEvent',
  'validateToken'
]);

function normalizeEventName(eventName) {
  return String(eventName || '').trim();
}

function legacyHttpFacadeAction(eventName) {
  return HTTP_LEGACY_ADMIN_EVENT_FACADE_ACTIONS[normalizeEventName(eventName)] || null;
}

function legacyPublicRuntimeFacadeAction(eventName) {
  return HTTP_LEGACY_PUBLIC_RUNTIME_EVENT_FACADE_ACTIONS[normalizeEventName(eventName)] || null;
}

function isPublicLaneValue(value) {
  return String(value || '').trim().toLowerCase() === 'public';
}

function shouldUsePublicRuntimeFacade(eventName, payload = {}) {
  const normalized = normalizeEventName(eventName);
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

  if (normalized === 'getStartPage' || normalized === 'getEnvelope') return true;
  if (normalized === 'designer.getDesign') {
    return !source.lane || isPublicLaneValue(source.lane);
  }
  if (normalized === 'designer.getLayout') {
    return isPublicLaneValue(source.lane);
  }
  if (normalized === 'getWidgets') return isPublicLaneValue(source.widgetType || source.lane);
  if (normalized === 'widget.registry.request.v1') return isPublicLaneValue(source.lane);
  if (normalized === 'getChildPages') return !source.lane || isPublicLaneValue(source.lane);
  if (normalized === 'getWidgetInstance') return /^default\.[A-Za-z0-9_.:-]{1,160}$/.test(String(source.instanceId || ''));

  if ([
    'getPageBySlug',
    'getPageById',
    'getGlobalLayoutTemplate',
    'getLayoutTemplate',
    'getLayoutForViewport'
  ].includes(normalized)) {
    return isPublicLaneValue(source.lane);
  }

  return false;
}

function stripLegacyPayloadMeta(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const params = {};
  for (const [key, value] of Object.entries(source)) {
    if (!LEGACY_HTTP_PAYLOAD_META_KEYS.has(key)) {
      params[key] = value;
    }
  }
  return params;
}

function stripHttpPayloadAuthMeta(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const clean = { ...source };
  delete clean.jwt;
  delete clean.decodedJWT;
  return clean;
}

function translateLegacyHttpFacadeEvent(eventName, payload = {}) {
  const normalized = normalizeEventName(eventName);
  const publicDefinition = shouldUsePublicRuntimeFacade(normalized, payload)
    ? legacyPublicRuntimeFacadeAction(normalized)
    : null;
  if (publicDefinition) {
    return {
      originalEventName: normalized,
      eventName: 'cmsPublicRuntimeRequest',
      unwrapData: true,
      payload: {
        moduleName: 'runtimeManager',
        moduleType: 'core',
        resource: publicDefinition.resource,
        action: publicDefinition.action,
        params: stripLegacyPayloadMeta(payload)
      }
    };
  }

  const definition = legacyHttpFacadeAction(normalized);
  if (!definition) return null;
  return {
    originalEventName: normalized,
    eventName: 'cmsAdminApiRequest',
    unwrapData: true,
    payload: {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: definition.resource,
      action: definition.action,
      params: stripLegacyPayloadMeta(payload)
    }
  };
}

function isHttpPublicEvent(eventName) {
  return HTTP_PUBLIC_EVENTS.has(normalizeEventName(eventName));
}

function isHttpPublicTokenEvent(eventName) {
  return HTTP_PUBLIC_TOKEN_EVENTS.has(normalizeEventName(eventName));
}

function isHttpDirectContractEvent(eventName) {
  return HTTP_DIRECT_CONTRACT_EVENTS.has(normalizeEventName(eventName));
}

function hasRawPlaceholderPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return false;
  return (
    payload.table === '__rawSQL__' ||
    Boolean(payload?.data?.rawSQL) ||
    Boolean(payload?.where?.rawSQL)
  );
}

function explainExternalEventRejection(eventName, payload = {}) {
  const normalized = normalizeEventName(eventName);
  if (!normalized) return 'Missing eventName';

  if (hasRawPlaceholderPayload(payload)) {
    return 'Raw database placeholders cannot be called through /api/meltdown.';
  }

  if (HTTP_FORBIDDEN_EXTERNAL_EVENTS.has(normalized)) {
    return `Event "${normalized}" is internal and cannot be called through /api/meltdown. Use a public API or cmsAdminApiRequest.`;
  }

  if (!isHttpDirectContractEvent(normalized)) {
    return `Event "${normalized}" is not exposed through /api/meltdown. Use a public API, cmsAdminApiRequest, cmsPublicRuntimeRequest or dispatchAppEvent.`;
  }

  return null;
}

module.exports = {
  APP_FORBIDDEN_DIRECT_EVENTS,
  APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS,
  COMMUNITY_FORBIDDEN_DIRECT_EVENTS,
  HTTP_DIRECT_CONTRACT_EVENTS,
  HTTP_FORBIDDEN_EXTERNAL_EVENTS,
  HTTP_LEGACY_ADMIN_EVENT_FACADE_ACTIONS,
  HTTP_LEGACY_PUBLIC_RUNTIME_EVENT_FACADE_ACTIONS,
  HTTP_PUBLIC_EVENTS,
  HTTP_PUBLIC_TOKEN_EVENTS,
  SENSITIVE_SYSTEM_QUERY_EVENTS,
  explainExternalEventRejection,
  hasRawPlaceholderPayload,
  isHttpDirectContractEvent,
  isHttpPublicEvent,
  isHttpPublicTokenEvent,
  legacyHttpFacadeAction,
  legacyPublicRuntimeFacadeAction,
  stripHttpPayloadAuthMeta,
  translateLegacyHttpFacadeEvent
};
