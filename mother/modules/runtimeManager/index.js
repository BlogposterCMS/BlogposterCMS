'use strict';

const crypto = require('crypto');
const { hasPermission } = require('../userManagement/permissionUtils');

const MODULE_NAME = 'runtimeManager';
const MODULE_TYPE = 'core';
const DEFAULT_SCHEDULE_INTERVAL_MS = 60 * 1000;
const DEFAULT_SCHEDULE_LIMIT = 50;
const DEFAULT_PUBLIC_LIMIT = 25;
const MAX_PUBLIC_LIMIT = 100;
const MIN_PREVIEW_TTL_SECONDS = 30;
const DEFAULT_PREVIEW_TTL_SECONDS = 15 * 60;
const MAX_PREVIEW_TTL_SECONDS = 60 * 60;
const PRIVATE_META_KEY_FRAGMENTS = ['password', 'secret', 'token', 'private', 'permission', 'role'];
const PUBLIC_READ_PRINCIPAL = { permissions: {} };
const PUBLIC_COMMENT_PRINCIPAL = { permissions: { comments: { create: true } } };

const CMS_ADMIN_ACTIONS = Object.freeze({
  content: {
    list: { eventName: 'listContentEntries', moduleName: 'contentEngine', permission: 'content.update' },
    get: { eventName: 'getContentEntry', moduleName: 'contentEngine', permission: 'content.update' },
    create: { eventName: 'createContentEntry', moduleName: 'contentEngine', permission: 'content.create' },
    update: { eventName: 'updateContentEntry', moduleName: 'contentEngine', permission: 'content.update' },
    publish: { eventName: 'publishContentEntry', moduleName: 'contentEngine', permission: 'content.publish' },
    trash: { eventName: 'trashContentEntry', moduleName: 'contentEngine', permission: 'content.delete' },
    restore: { eventName: 'restoreContentEntry', moduleName: 'contentEngine', permission: 'content.restore' },
    revisions: { eventName: 'getContentRevisions', moduleName: 'contentEngine', permission: 'content.update' },
    revision: { eventName: 'getContentRevision', moduleName: 'contentEngine', permission: 'content.update' },
    restoreRevision: { eventName: 'restoreContentRevision', moduleName: 'contentEngine', permission: 'content.update' },
    scheduled: { eventName: 'listScheduledContentEntries', moduleName: 'contentEngine', permission: 'content.publish' },
    trashed: { eventName: 'listTrashedContentEntries', moduleName: 'contentEngine', permission: 'content.delete' }
  },
  pages: {
    list: { eventName: 'getAllPages', moduleName: 'pagesManager', permission: 'pages.read' },
    byLane: { eventName: 'getPagesByLane', moduleName: 'pagesManager', permission: 'pages.read' },
    get: { eventName: 'getPageById', moduleName: 'pagesManager', permission: 'pages.read' },
    getBySlug: { eventName: 'getPageBySlug', moduleName: 'pagesManager', permission: 'pages.read' },
    start: { eventName: 'getStartPage', moduleName: 'pagesManager', permission: 'pages.read' },
    children: { eventName: 'getChildPages', moduleName: 'pagesManager', permission: 'pages.read' },
    envelope: { eventName: 'getEnvelope', moduleName: 'pagesManager', permission: 'pages.read' },
    search: { eventName: 'searchPages', moduleName: 'pagesManager', permission: 'pages.read' },
    create: { eventName: 'createPage', moduleName: 'pagesManager', permission: 'pages.create' },
    update: { eventName: 'updatePage', moduleName: 'pagesManager', permission: 'pages.update' },
    trash: { eventName: 'setAsDeleted', moduleName: 'pagesManager', permission: 'pages.delete' },
    delete: { eventName: 'deletePage', moduleName: 'pagesManager', permission: 'pages.delete' },
    setStart: { eventName: 'setAsStart', moduleName: 'pagesManager', permission: 'pages.manage' }
  },
  contentTypes: {
    list: { eventName: 'listContentTypes', moduleName: 'contentEngine', permission: 'content.update' },
    get: { eventName: 'getContentType', moduleName: 'contentEngine', permission: 'content.update' },
    upsert: { eventName: 'registerContentType', moduleName: 'contentEngine', permission: 'content.types.manage' }
  },
  media: {
    list: { eventName: 'listMediaAttachments', moduleName: 'mediaManager', permission: 'media.manage' },
    get: { eventName: 'getMediaAttachment', moduleName: 'mediaManager', permission: 'media.manage' },
    create: { eventName: 'createMediaAttachment', moduleName: 'mediaManager', permission: 'media.manage' },
    update: { eventName: 'updateMediaAttachment', moduleName: 'mediaManager', permission: 'media.manage' },
    delete: { eventName: 'deleteMediaAttachment', moduleName: 'mediaManager', permission: 'media.manage' },
    upsertVariant: { eventName: 'upsertMediaVariant', moduleName: 'mediaManager', permission: 'media.manage' },
    listVariants: { eventName: 'listMediaVariants', moduleName: 'mediaManager', permission: 'media.manage' },
    deleteVariant: { eventName: 'deleteMediaVariant', moduleName: 'mediaManager', permission: 'media.manage' },
    link: { eventName: 'linkMediaToContent', moduleName: 'mediaManager', permission: 'media.manage' },
    unlink: { eventName: 'unlinkMediaFromContent', moduleName: 'mediaManager', permission: 'media.manage' },
    listForContent: { eventName: 'listMediaForContent', moduleName: 'mediaManager', permission: 'media.manage' },
    listContent: { eventName: 'listContentForMedia', moduleName: 'mediaManager', permission: 'media.manage' },
    listLocalFolder: { eventName: 'listLocalFolder', moduleName: 'mediaManager', permission: 'media.manage' },
    createLocalFolder: { eventName: 'createLocalFolder', moduleName: 'mediaManager', permission: 'media.manage' },
    uploadToFolder: { eventName: 'uploadFileToFolder', moduleName: 'mediaManager', permission: 'media.manage' },
    deleteLocalItem: { eventName: 'deleteLocalItem', moduleName: 'mediaManager', permission: 'media.manage' },
    renameLocalItem: { eventName: 'renameLocalItem', moduleName: 'mediaManager', permission: 'media.manage' },
    makeFilePublic: { eventName: 'makeFilePublic', moduleName: 'mediaManager', permission: 'media.manage' }
  },
  widgets: {
    list: { eventName: 'getWidgets', moduleName: 'widgetManager', permission: 'widgets.read' },
    create: { eventName: 'createWidget', moduleName: 'widgetManager', permission: 'widgets.create' },
    update: { eventName: 'updateWidget', moduleName: 'widgetManager', permission: 'widgets.update' },
    delete: { eventName: 'deleteWidget', moduleName: 'widgetManager', permission: 'widgets.delete' },
    saveLayout: { eventName: 'saveLayout.v1', moduleName: 'widgetManager', permission: 'widgets.saveLayout' },
    registerUsage: { eventName: 'registerWidgetUsage', moduleName: 'widgetManager', permission: 'widgets.read' }
  },
  plainSpace: {
    widgetRegistry: { eventName: 'widget.registry.request.v1', moduleName: 'plainspace', permission: 'widgets.read' },
    layoutForViewport: { eventName: 'getLayoutForViewport', moduleName: 'plainspace', permission: 'plainspace.read' },
    allLayoutsForPage: { eventName: 'getAllLayoutsForPage', moduleName: 'plainspace', permission: 'plainspace.read' },
    saveLayoutForViewport: { eventName: 'saveLayoutForViewport', moduleName: 'plainspace', permission: 'plainspace.saveLayout' },
    layoutTemplate: { eventName: 'getLayoutTemplate', moduleName: 'plainspace', permission: 'plainspace.read' },
    layoutTemplateNames: { eventName: 'getLayoutTemplateNames', moduleName: 'plainspace', permission: 'plainspace.read' },
    saveLayoutTemplate: { eventName: 'saveLayoutTemplate', moduleName: 'plainspace', permission: 'plainspace.saveLayoutTemplate' },
    deleteLayoutTemplate: { eventName: 'deleteLayoutTemplate', moduleName: 'plainspace', permission: 'plainspace.saveLayoutTemplate' },
    globalLayoutTemplate: { eventName: 'getGlobalLayoutTemplate', moduleName: 'plainspace', permission: 'plainspace.read' },
    setGlobalLayoutTemplate: { eventName: 'setGlobalLayoutTemplate', moduleName: 'plainspace', permission: 'plainspace.saveLayoutTemplate' },
    widgetInstance: { eventName: 'getWidgetInstance', moduleName: 'plainspace', permission: 'plainspace.widgetInstance' },
    saveWidgetInstance: { eventName: 'saveWidgetInstance', moduleName: 'plainspace', permission: 'plainspace.widgetInstance' },
    publishedDesignMeta: { eventName: 'getPublishedDesignMeta', moduleName: 'plainspace', permission: 'plainspace.read' },
    savePublishedDesignMeta: { eventName: 'savePublishedDesignMeta', moduleName: 'plainspace', permission: 'plainspace.saveLayoutTemplate' }
  },
  workflow: {
    acquireLock: { eventName: 'acquireContentLock', moduleName: 'workflowManager', permission: 'content.update' },
    refreshLock: { eventName: 'refreshContentLock', moduleName: 'workflowManager', permission: 'content.update' },
    releaseLock: { eventName: 'releaseContentLock', moduleName: 'workflowManager', permission: 'content.update' },
    getLock: { eventName: 'getContentLock', moduleName: 'workflowManager', permission: 'content.update' },
    saveAutosave: { eventName: 'saveContentAutosave', moduleName: 'workflowManager', permission: 'content.update' },
    getAutosave: { eventName: 'getContentAutosave', moduleName: 'workflowManager', permission: 'content.update' },
    listAutosaves: { eventName: 'listContentAutosaves', moduleName: 'workflowManager', permission: 'content.update' },
    deleteAutosave: { eventName: 'deleteContentAutosave', moduleName: 'workflowManager', permission: 'content.update' },
    submitReview: { eventName: 'submitContentReview', moduleName: 'workflowManager', permission: 'content.update' },
    approveReview: { eventName: 'approveContentReview', moduleName: 'workflowManager', permission: 'content.publish' },
    rejectReview: { eventName: 'rejectContentReview', moduleName: 'workflowManager', permission: 'content.publish' },
    getReview: { eventName: 'getContentReview', moduleName: 'workflowManager', permission: 'content.publish' },
    reviewQueue: { eventName: 'listContentReviewQueue', moduleName: 'workflowManager', permission: 'content.publish' }
  },
  navigation: {
    registerLocation: { eventName: 'registerNavigationLocation', moduleName: 'navigationManager', permission: 'navigation.manage' },
    locations: { eventName: 'listNavigationLocations', moduleName: 'navigationManager', permission: 'navigation.manage' },
    menus: { eventName: 'listNavigationMenus', moduleName: 'navigationManager', permission: 'navigation.manage' },
    getMenu: { eventName: 'getNavigationMenu', moduleName: 'navigationManager', permission: 'navigation.manage' },
    upsertMenu: { eventName: 'upsertNavigationMenu', moduleName: 'navigationManager', permission: 'navigation.manage' },
    addItem: { eventName: 'addNavigationMenuItem', moduleName: 'navigationManager', permission: 'navigation.manage' },
    setItems: { eventName: 'setNavigationMenuItems', moduleName: 'navigationManager', permission: 'navigation.manage' },
    updateItem: { eventName: 'updateNavigationMenuItem', moduleName: 'navigationManager', permission: 'navigation.manage' },
    deleteItem: { eventName: 'deleteNavigationMenuItem', moduleName: 'navigationManager', permission: 'navigation.manage' },
    tree: { eventName: 'getNavigationTree', moduleName: 'navigationManager', permission: 'navigation.manage' }
  },
  seo: {
    defaults: { eventName: 'getSeoDefaults', moduleName: 'seoManager', permission: 'seo.manage' },
    setDefaults: { eventName: 'setSeoDefaults', moduleName: 'seoManager', permission: 'seo.manage' },
    get: { eventName: 'getSeoMeta', moduleName: 'seoManager', permission: 'seo.manage' },
    list: { eventName: 'listSeoMeta', moduleName: 'seoManager', permission: 'seo.manage' },
    upsert: { eventName: 'upsertSeoMeta', moduleName: 'seoManager', permission: 'seo.manage' },
    delete: { eventName: 'deleteSeoMeta', moduleName: 'seoManager', permission: 'seo.manage' },
    resolve: { eventName: 'resolveSeoMeta', moduleName: 'seoManager', permission: 'seo.manage' }
  },
  comments: {
    create: { eventName: 'createComment', moduleName: 'commentsManager', permission: 'comments.create' },
    get: { eventName: 'getComment', moduleName: 'commentsManager', permission: 'comments.moderate' },
    listForEntry: { eventName: 'listCommentsForEntry', moduleName: 'commentsManager', permission: 'comments.moderate' },
    update: { eventName: 'updateComment', moduleName: 'commentsManager', permission: 'comments.edit' },
    updateStatus: { eventName: 'updateCommentStatus', moduleName: 'commentsManager', permission: 'comments.moderate' },
    delete: { eventName: 'deleteComment', moduleName: 'commentsManager', permission: 'comments.delete' }
  },
  metadata: {
    registerField: { eventName: 'registerMetaField', moduleName: 'metadataManager', permission: 'metadata.manage' },
    getField: { eventName: 'getMetaField', moduleName: 'metadataManager', permission: 'metadata.manage' },
    listFields: { eventName: 'listMetaFields', moduleName: 'metadataManager', permission: 'metadata.manage' },
    deleteField: { eventName: 'deleteMetaField', moduleName: 'metadataManager', permission: 'metadata.manage' },
    set: { eventName: 'setMetadata', moduleName: 'metadataManager', permission: 'metadata.manage' },
    get: { eventName: 'getMetadata', moduleName: 'metadataManager', permission: 'metadata.manage' },
    getValue: { eventName: 'getMetadataValue', moduleName: 'metadataManager', permission: 'metadata.manage' },
    delete: { eventName: 'deleteMetadata', moduleName: 'metadataManager', permission: 'metadata.manage' },
    deleteForTarget: { eventName: 'deleteMetadataForTarget', moduleName: 'metadataManager', permission: 'metadata.manage' }
  },
  redirects: {
    upsert: { eventName: 'upsertRedirectRule', moduleName: 'redirectManager', permission: 'redirects.manage' },
    get: { eventName: 'getRedirectRule', moduleName: 'redirectManager', permission: 'redirects.manage' },
    list: { eventName: 'listRedirectRules', moduleName: 'redirectManager', permission: 'redirects.manage' },
    delete: { eventName: 'deleteRedirectRule', moduleName: 'redirectManager', permission: 'redirects.manage' },
    resolve: { eventName: 'resolveRedirect', moduleName: 'redirectManager', permission: 'redirects.manage' },
    recordHit: { eventName: 'recordRedirectHit', moduleName: 'redirectManager', permission: 'redirects.manage' },
    listHits: { eventName: 'listRedirectHits', moduleName: 'redirectManager', permission: 'redirects.manage' }
  },
  search: {
    index: { eventName: 'indexSearchDocument', moduleName: 'searchManager', permission: 'search.manage' },
    get: { eventName: 'getSearchDocument', moduleName: 'searchManager', permission: 'search.manage' },
    remove: { eventName: 'removeSearchDocument', moduleName: 'searchManager', permission: 'search.manage' },
    query: { eventName: 'searchDocuments', moduleName: 'searchManager', permission: 'search.manage' },
    reindexContent: { eventName: 'reindexContentEntries', moduleName: 'searchManager', permission: 'search.manage' }
  },
  settings: {
    list: { eventName: 'listSettings', moduleName: 'settingsManager', permission: 'settings.core.view' },
    get: { eventName: 'getSetting', moduleName: 'settingsManager', permission: 'settings.core.view' },
    public: { eventName: 'getPublicSettings', moduleName: 'settingsManager', permission: 'settings.core.view' },
    cmsMode: { eventName: 'getCmsMode', moduleName: 'settingsManager', permission: 'settings.core.view' },
    setCmsMode: { eventName: 'setCmsMode', moduleName: 'settingsManager', permission: 'settings.core.edit' },
    set: { eventName: 'setSetting', moduleName: 'settingsManager', permission: 'settings.core.edit' },
    bulk: { eventName: 'setSettings', moduleName: 'settingsManager', permission: 'settings.core.edit' },
    delete: { eventName: 'deleteSetting', moduleName: 'settingsManager', permission: 'settings.core.edit' }
  },
  auth: {
    loginStrategies: { eventName: 'listLoginStrategies', moduleName: 'auth', permission: 'auth.strategies.view' },
    setStrategyEnabled: { eventName: 'setLoginStrategyEnabled', moduleName: 'auth', permission: 'auth.strategies.manage' }
  },
  users: {
    list: { eventName: 'getAllUsers', moduleName: 'userManagement', permission: 'users.read' },
    me: { eventName: 'getUserDetailsById', moduleName: 'userManagement', permission: 'users.read', useActorUserId: true },
    get: { eventName: 'getUserDetailsById', moduleName: 'userManagement', permission: 'users.read' },
    getByUsername: { eventName: 'getUserDetailsByUsername', moduleName: 'userManagement', permission: 'users.read' },
    count: { eventName: 'getUserCount', moduleName: 'userManagement', permission: 'users.read' },
    create: { eventName: 'createUser', moduleName: 'userManagement', permission: 'users.create' },
    update: { eventName: 'updateUserProfile', moduleName: 'userManagement', permission: 'users.update' },
    delete: { eventName: 'deleteUser', moduleName: 'userManagement', permission: 'users.delete' },
    access: { eventName: 'getUserAccess', moduleName: 'userManagement', permission: 'userManagement.editUser' },
    setAccess: { eventName: 'setUserAccess', moduleName: 'userManagement', permission: 'userManagement.editUser' }
  },
  roles: {
    list: { eventName: 'getAllRoles', moduleName: 'userManagement', permission: 'userManagement.listRoles' },
    create: { eventName: 'createRole', moduleName: 'userManagement', permission: 'userManagement.createRole' },
    update: { eventName: 'updateRole', moduleName: 'userManagement', permission: 'userManagement.editRole' },
    delete: { eventName: 'deleteRole', moduleName: 'userManagement', permission: 'userManagement.deleteRole' },
    assign: { eventName: 'assignRoleToUser', moduleName: 'userManagement', permission: 'userManagement.editRole' },
    remove: { eventName: 'removeRoleFromUser', moduleName: 'userManagement', permission: 'userManagement.editRole' },
    forUser: { eventName: 'getRolesForUser', moduleName: 'userManagement', permission: 'userManagement.listRoles' },
    incrementToken: { eventName: 'incrementUserTokenVersion', moduleName: 'userManagement', permission: 'userManagement.editUser' }
  },
  permissions: {
    list: { eventName: 'getAllPermissions', moduleName: 'userManagement', permission: 'userManagement.managePermissions' },
    create: { eventName: 'createPermission', moduleName: 'userManagement', permission: 'userManagement.managePermissions' }
  },
  modules: {
    registry: { eventName: 'getModuleRegistry', moduleName: 'moduleLoader', permission: 'modules.list' },
    system: { eventName: 'listSystemModules', moduleName: 'moduleLoader', permission: 'modules.list' },
    activeStaticFrontends: { eventName: 'listActiveStaticFrontends', moduleName: 'moduleLoader', permission: 'modules.listActive' },
    activate: { eventName: 'activateModuleInRegistry', moduleName: 'moduleLoader', permission: 'modules.activate' },
    deactivate: { eventName: 'deactivateModuleInRegistry', moduleName: 'moduleLoader', permission: 'modules.deactivate' },
    inspectZip: { eventName: 'inspectModuleZipAccess', moduleName: 'moduleLoader', permission: 'modules.install' },
    installZip: { eventName: 'installModuleFromZip', moduleName: 'moduleLoader', permission: 'modules.install' },
    accessRequests: { eventName: 'listPendingModuleAccessRequests', moduleName: 'moduleLoader', permission: 'modules.manageAccess' },
    resolveAccessRequest: { eventName: 'resolveModuleAccessRequest', moduleName: 'moduleLoader', permission: 'modules.manageAccess' }
  },
  apps: {
    list: { eventName: 'listApps', moduleName: 'appLoader', permission: 'apps.list' },
    get: { eventName: 'getApp', moduleName: 'appLoader', permission: 'apps.list' },
    builderList: { eventName: 'listBuilderApps', moduleName: 'appLoader', permission: 'builder.use' },
    launchInfo: { eventName: 'getAppLaunchInfo', moduleName: 'appLoader', permission: 'builder.use' },
    rescan: { eventName: 'rescanApps', moduleName: 'appLoader', permission: 'apps.rescan' }
  },
  fonts: {
    listProviders: { eventName: 'listFontProviders', moduleName: 'fontsManager', permission: 'fonts.read' },
    list: { eventName: 'listFonts', moduleName: 'fontsManager', permission: 'fonts.read' },
    add: { eventName: 'addFont', moduleName: 'fontsManager', permission: 'fonts.manage' },
    setProviderEnabled: { eventName: 'setFontProviderEnabled', moduleName: 'fontsManager', permission: 'fonts.manage' }
  },
  notifications: {
    recent: { eventName: 'getRecentNotifications', moduleName: 'notificationManager', permission: 'notifications.read' }
  },
  importers: {
    list: { eventName: 'listImporters', moduleName: 'importer', permission: 'importers.list' },
    run: { eventName: 'runImport', moduleName: 'importer', permission: 'importers.run' }
  },
  exporters: {
    list: { eventName: 'listExporters', moduleName: 'exportManager', permission: 'exporters.list' },
    run: { eventName: 'runExport', moduleName: 'exportManager', permission: 'exporters.run' }
  },
  serverLocations: {
    create: { eventName: 'addServerLocation', moduleName: 'serverManager', permission: 'serverManager.createLocation' },
    get: { eventName: 'getServerLocation', moduleName: 'serverManager', permission: 'serverManager.viewLocations' },
    list: { eventName: 'listServerLocations', moduleName: 'serverManager', permission: 'serverManager.viewLocations' },
    update: { eventName: 'updateServerLocation', moduleName: 'serverManager', permission: 'serverManager.editLocation' },
    delete: { eventName: 'deleteServerLocation', moduleName: 'serverManager', permission: 'serverManager.deleteLocation' }
  },
  shares: {
    create: { eventName: 'createShareLink', moduleName: 'shareManager', permission: 'share.create' },
    get: { eventName: 'getShareDetails', moduleName: 'shareManager', permission: 'share.read' },
    revoke: { eventName: 'revokeShareLink', moduleName: 'shareManager', permission: 'share.revoke' }
  },
  unifiedSettings: {
    registerSchema: { eventName: 'registerModuleSettingsSchema', moduleName: 'unifiedSettings', permission: 'settings.unified.editSchemas' },
    registerSection: { eventName: 'registerSettingsSection', moduleName: 'unifiedSettings', permission: 'settings.unified.editSchemas' },
    schema: { eventName: 'getModuleSettingsSchema', moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    schemas: { eventName: 'listModuleSettingsSchemas', moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    modules: { eventName: 'listRegisteredSettingsModules', moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    get: { eventName: 'getModuleSettingValue', moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    list: { eventName: 'listModuleSettings', moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    bundle: { eventName: 'getModuleSettings', moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    update: { eventName: 'updateModuleSettingValue', moduleName: 'unifiedSettings', permission: 'settings.unified.editSettings' },
    bulk: { eventName: 'updateModuleSettings', moduleName: 'unifiedSettings', permission: 'settings.unified.editSettings' },
    delete: { eventName: 'deleteModuleSetting', moduleName: 'unifiedSettings', permission: 'settings.unified.editSettings' }
  },
  themes: {
    list: { eventName: 'listThemes', moduleName: 'themeManager', permission: 'themes.list' },
    get: { eventName: 'getTheme', moduleName: 'themeManager', permission: 'themes.list' },
    active: { eventName: 'getActiveTheme', moduleName: 'themeManager', permission: 'themes.list' },
    activate: { eventName: 'activateTheme', moduleName: 'themeManager', permission: 'themes.activate' }
  },
  translations: {
    create: { eventName: 'createTranslatedText', moduleName: 'translationManager', permission: 'translations.create' },
    upsert: { eventName: 'upsertTranslatedText', moduleName: 'translationManager', permission: 'translations.update' },
    get: { eventName: 'getTranslatedText', moduleName: 'translationManager', permission: 'translations.read' },
    list: { eventName: 'listTranslatedTexts', moduleName: 'translationManager', permission: 'translations.read' },
    update: { eventName: 'updateTranslatedText', moduleName: 'translationManager', permission: 'translations.update' },
    delete: { eventName: 'deleteTranslatedText', moduleName: 'translationManager', permission: 'translations.delete' },
    listLanguages: { eventName: 'listLanguages', moduleName: 'translationManager', permission: 'translations.listLanguages' },
    getLanguage: { eventName: 'getTranslationLanguage', moduleName: 'translationManager', permission: 'translations.listLanguages' },
    upsertLanguage: { eventName: 'upsertTranslationLanguage', moduleName: 'translationManager', permission: 'translations.addLanguage' },
    deleteLanguage: { eventName: 'deleteTranslationLanguage', moduleName: 'translationManager', permission: 'translations.delete' }
  },
  designer: {
    get: { eventName: 'designer.getDesign', moduleName: 'designerManager', permission: 'builder.use' },
    getLayout: { eventName: 'designer.getLayout', moduleName: 'designerManager', permission: 'builder.use' },
    list: { eventName: 'designer.listDesigns', moduleName: 'designerManager', permission: 'builder.use' },
    layouts: { eventName: 'designer.listLayouts', moduleName: 'designerManager', permission: 'builder.use' },
    save: { eventName: 'designer.saveDesign', moduleName: 'designerManager', permission: 'builder.publish' }
  },
  preview: {
    token: { eventName: 'createContentPreviewToken', moduleName: 'runtimeManager', permission: 'content.update' }
  }
});

const CMS_PUBLIC_RUNTIME_ACTIONS = Object.freeze({
  settings: {
    public: { eventName: 'getPublicSettings', moduleName: 'settingsManager' }
  },
  users: {
    count: { eventName: 'getUserCount', moduleName: 'userManagement' },
    register: { eventName: 'publicRegister', moduleName: 'userManagement' }
  },
  pages: {
    start: { eventName: 'getStartPage', moduleName: 'pagesManager' },
    envelope: { eventName: 'getEnvelope', moduleName: 'pagesManager' },
    getBySlug: { eventName: 'getPageBySlug', moduleName: 'pagesManager' },
    get: { eventName: 'getPageById', moduleName: 'pagesManager' },
    children: { eventName: 'getChildPages', moduleName: 'pagesManager' }
  },
  widgets: {
    list: { eventName: 'getWidgets', moduleName: 'widgetManager' },
    registerUsage: { eventName: 'registerWidgetUsage', moduleName: 'widgetManager' }
  },
  auth: {
    activeLoginStrategies: { eventName: 'listActiveLoginStrategies', moduleName: 'auth' }
  },
  plainSpace: {
    widgetRegistry: { eventName: 'widget.registry.request.v1', moduleName: 'plainspace' },
    globalLayoutTemplate: { eventName: 'getGlobalLayoutTemplate', moduleName: 'plainspace' },
    layoutTemplate: { eventName: 'getLayoutTemplate', moduleName: 'plainspace' },
    layoutForViewport: { eventName: 'getLayoutForViewport', moduleName: 'plainspace' },
    widgetInstance: { eventName: 'getWidgetInstance', moduleName: 'plainspace' }
  },
  designer: {
    get: { eventName: 'designer.getDesign', moduleName: 'designerManager' },
    getLayout: { eventName: 'designer.getLayout', moduleName: 'designerManager' }
  },
  fonts: {
    list: { eventName: 'listFonts', moduleName: 'fontsManager' },
    listProviders: { eventName: 'listFontProviders', moduleName: 'fontsManager' }
  }
});

const APP_CONTEXT_READ_ACTIONS = Object.freeze({
  content: new Set(['list', 'get', 'revisions', 'revision', 'scheduled', 'trashed']),
  pages: new Set(['list', 'byLane', 'get', 'getBySlug', 'start', 'children', 'envelope', 'search']),
  contentTypes: new Set(['list', 'get']),
  media: new Set(['list', 'get', 'listVariants', 'listForContent', 'listContent']),
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
  settings: new Set(['public']),
  themes: new Set(['list', 'get', 'active']),
  translations: new Set(['get', 'list', 'listLanguages', 'getLanguage'])
});
const APP_CONTEXT_CORE_OWNED_WRITE_BRIDGE_EVENTS = new Set([
  'cms-app-runtime-request',
  'cms-app-runtime-batch-request'
]);
const PUBLIC_PLAINSPACE_LANE_ACTIONS = new Set([
  'widgetRegistry',
  'globalLayoutTemplate',
  'layoutTemplate',
  'layoutForViewport'
]);

const REDIRECT_SKIP_PREFIXES = [
  '/admin',
  '/api',
  '/assets',
  '/build',
  '/ui',
  '/login',
  '/install',
  '/register',
  '/favicon.ico',
  '/plainspace',
  '/themes',
  '/apps',
  '/fonts',
  '/widgets'
];

function once(originalCb) {
  let fired = false;
  return (...args) => {
    if (fired) return;
    fired = true;
    if (typeof originalCb === 'function') originalCb(...args);
  };
}

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    if (typeof motherEmitter.listenerCount === 'function' && motherEmitter.listenerCount(eventName) === 0) {
      reject(new Error(`Missing event listener: ${eventName}`));
      return;
    }
    motherEmitter.emit(eventName, payload, once((err, result) => {
      if (err) reject(err);
      else resolve(result);
    }));
  });
}

function assertRuntimePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[runtimeManager] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePayloadPermission(payload, permission) {
  if (!permission) return;
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function requireAdminPrincipal(payload) {
  if (!payload?.decodedJWT || payload.decodedJWT.isPublic === true) {
    throw new Error('Authentication required: admin principal missing.');
  }
}

function normalizeAdminApiKey(value = '') {
  return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
}

function adminApiDefinition(resource, action) {
  const normalizedResource = normalizeAdminApiKey(resource);
  const normalizedAction = normalizeAdminApiKey(action);
  return {
    resource: normalizedResource,
    action: normalizedAction,
    definition: CMS_ADMIN_ACTIONS[normalizedResource]?.[normalizedAction] || null
  };
}

function adminApiEventDefinition(eventName) {
  const normalizedEventName = String(eventName || '').trim();
  for (const [resource, actions] of Object.entries(CMS_ADMIN_ACTIONS)) {
    for (const [action, definition] of Object.entries(actions)) {
      if (definition?.eventName === normalizedEventName) {
        return {
          event: normalizedEventName,
          resource,
          action,
          definition
        };
      }
    }
  }

  return {
    event: normalizedEventName,
    resource: '',
    action: '',
    definition: null
  };
}

function publicRuntimeDefinition(resource, action) {
  const normalizedResource = normalizeAdminApiKey(resource);
  const normalizedAction = normalizeAdminApiKey(action);
  return {
    resource: normalizedResource,
    action: normalizedAction,
    definition: CMS_PUBLIC_RUNTIME_ACTIONS[normalizedResource]?.[normalizedAction] || null
  };
}

function isAppContextReadAction(resource, action) {
  return APP_CONTEXT_READ_ACTIONS[resource]?.has(action) === true;
}

function isCoreOwnedWriteBridgeContext(appContext = {}) {
  return appContext?.coreOwned === true &&
    APP_CONTEXT_CORE_OWNED_WRITE_BRIDGE_EVENTS.has(String(appContext.event || ''));
}

function requireAppContextReadOnly(payload, resource, action) {
  if (!payload?.appContext) return;
  if (isAppContextReadAction(resource, action)) return;
  if (isCoreOwnedWriteBridgeContext(payload.appContext)) return;
  throw new Error(`Forbidden - apps can only query CMS admin API resources: ${resource}.${action}`);
}

async function emitOptionalAsync(motherEmitter, eventName, payload, fallback = null) {
  if (typeof motherEmitter.listenerCount === 'function' && motherEmitter.listenerCount(eventName) === 0) {
    return fallback;
  }

  try {
    return await emitAsync(motherEmitter, eventName, payload);
  } catch {
    return fallback;
  }
}

function previewSecret() {
  return String(
    process.env.CONTENT_PREVIEW_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    'blogposterdev-preview-secret'
  );
}

function clampPreviewTtl(value) {
  const ttl = Number(value) || DEFAULT_PREVIEW_TTL_SECONDS;
  return Math.min(Math.max(Math.floor(ttl), MIN_PREVIEW_TTL_SECONDS), MAX_PREVIEW_TTL_SECONDS);
}

function stripUndefined(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => typeof entryValue !== 'undefined'));
}

function signPreviewPayload(payload, secret = previewSecret()) {
  const encoded = Buffer.from(JSON.stringify(stripUndefined(payload))).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyPreviewToken(token, options = {}) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Invalid preview token.');
  }

  const expected = crypto
    .createHmac('sha256', options.secret || previewSecret())
    .update(parts[0])
    .digest('base64url');
  if (!timingSafeStringEqual(expected, parts[1])) {
    throw new Error('Invalid preview token.');
  }

  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid preview token.');
  }

  const now = Number(options.now || Math.floor(Date.now() / 1000));
  if (payload?.purpose !== 'content-preview' || Number(payload.exp || 0) <= now) {
    throw new Error('Expired preview token.');
  }
  return payload;
}

function baseUrlFromRequest(req) {
  const host = req.get?.('host') || req.headers?.host || 'localhost';
  const protocol = req.protocol || 'http';
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return 'http://localhost';
  }
}

function normalizePublicPath(raw = '/') {
  let value = String(raw || '/').trim();
  if (!value) return '/';

  try {
    if (/^https?:\/\//i.test(value)) {
      value = new URL(value).pathname || '/';
    }
  } catch {
    value = '/';
  }

  value = value.split(/[?#]/)[0] || '/';
  if (value === '/') return '/';
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

function normalizePublicKey(raw = '') {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function parseLimit(value, fallback = DEFAULT_PUBLIC_LIMIT) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), MAX_PUBLIC_LIMIT);
}

function parseOffset(value) {
  const offset = Number(value);
  if (!Number.isFinite(offset) || offset <= 0) return 0;
  return Math.floor(offset);
}

function languageFromRequest(req, fallback = '') {
  return String(req.query?.lang || req.query?.language || fallback || '').trim().toLowerCase();
}

function publicPathFromRequest(req) {
  return req.query?.path || req.query?.permalink || req.query?.url || '';
}

function actorIdFromPayload(payload = {}) {
  return String(
    payload.userId ||
    payload.user_id ||
    payload.authorId ||
    payload.author_id ||
    payload.decodedJWT?.user?.id ||
    payload.decodedJWT?.userId ||
    payload.decodedJWT?.id ||
    payload.decodedJWT?.sub ||
    ''
  );
}

function previewTargetFromPayload(payload = {}) {
  if (payload.entryId || payload.contentEntryId || payload.entry_id) {
    return { entryId: String(payload.entryId || payload.contentEntryId || payload.entry_id) };
  }
  if (payload.sourceModule && payload.sourceId) {
    return {
      sourceModule: String(payload.sourceModule).trim().slice(0, 120),
      sourceId: String(payload.sourceId).trim().slice(0, 160)
    };
  }
  if (payload.path || payload.permalink || payload.url) {
    return { path: normalizePublicPath(payload.path || payload.permalink || payload.url) };
  }
  return null;
}

function isPublishedEntry(entry) {
  return entry && String(entry.status || '').toLowerCase() === 'published';
}

function isPublishedPublicPage(page) {
  return page &&
    String(page.status || '').toLowerCase() === 'published' &&
    String(page.lane || 'public').toLowerCase() === 'public';
}

function isDeletedEntry(entry) {
  return entry && (String(entry.status || '').toLowerCase() === 'deleted' || entry.deleted_at || entry.deletedAt);
}

function isPrivatePublicKey(key = '') {
  const lowered = String(key || '').toLowerCase();
  return !lowered ||
    lowered.startsWith('_') ||
    PRIVATE_META_KEY_FRAGMENTS.some(fragment => lowered.includes(fragment));
}

function publicMeta(meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return Object.fromEntries(Object.entries(meta).filter(([key]) => !isPrivatePublicKey(key)));
}

function toPublicPlainSpaceValue(value) {
  if (Array.isArray(value)) {
    return value
      .map(toPublicPlainSpaceValue)
      .filter(item => item !== null && typeof item !== 'undefined');
  }
  if (!value || typeof value !== 'object') return value;

  if (
    Object.prototype.hasOwnProperty.call(value, 'lane') &&
    String(value.lane || '').toLowerCase() !== 'public'
  ) {
    return null;
  }

  const output = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (isPrivatePublicKey(key)) continue;
    const safeValue = toPublicPlainSpaceValue(entryValue);
    if (safeValue !== null && typeof safeValue !== 'undefined') {
      output[key] = safeValue;
    }
  }
  return output;
}

function toPublicPlainSpaceData(data) {
  return toPublicPlainSpaceValue(data);
}

function toPublicEntry(entry = {}) {
  return {
    id: entry.id || entry.entryId || null,
    contentTypeKey: entry.contentTypeKey || entry.content_type_key || '',
    slug: entry.slug || '',
    permalink: entry.permalink || '',
    status: entry.status || '',
    title: entry.title || '',
    language: entry.language || '',
    parentId: entry.parentId ?? entry.parent_id ?? null,
    excerpt: entry.excerpt || '',
    content: entry.content || {},
    meta: publicMeta(entry.meta || {}),
    publishedAt: entry.publishedAt || entry.published_at || null,
    updatedAt: entry.updatedAt || entry.updated_at || null,
    createdAt: entry.createdAt || entry.created_at || null
  };
}

function normalizeRuntimeRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  return value ? [value] : [];
}

function normalizeRuntimeSingle(value) {
  const rows = normalizeRuntimeRows(value);
  return rows[0] || null;
}

function toPublicPage(page = {}) {
  const meta = page.meta && typeof page.meta === 'object' && !Array.isArray(page.meta)
    ? page.meta
    : {};
  return {
    id: page.id ?? page.pageId ?? null,
    slug: page.slug || '',
    lane: 'public',
    status: page.status || '',
    title: page.title || page.trans_title || '',
    language: page.language || page.trans_lang || '',
    parentId: page.parentId ?? page.parent_id ?? null,
    parentSlug: page.parentSlug || page.parent_slug || '',
    html: page.html || '',
    css: page.css || '',
    js: page.js || '',
    meta: publicMeta(meta),
    metaDesc: page.metaDesc || page.meta_desc || '',
    seoTitle: page.seoTitle || page.seo_title || page.title || '',
    seoKeywords: page.seoKeywords || page.seo_keywords || '',
    is_content: Boolean(page.is_content),
    weight: Number(page.weight) || 0,
    updatedAt: page.updatedAt || page.updated_at || null,
    createdAt: page.createdAt || page.created_at || null
  };
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

function publicDesignObject(result = {}) {
  return result?.design && typeof result.design === 'object' && !Array.isArray(result.design)
    ? result.design
    : result;
}

function isPublicDesignResult(result) {
  const design = publicDesignObject(result);
  if (!design || typeof design !== 'object' || Array.isArray(design)) return false;
  return !isTruthyFlag(design.is_draft ?? design.isDraft);
}

function toPublicDesignResult(result = {}) {
  const design = publicDesignObject(result);
  if (!design || typeof design !== 'object' || Array.isArray(design)) return null;
  const {
    owner_id: ownerIdSnake,
    ownerId,
    user_id: userIdSnake,
    userId,
    created_by: createdBySnake,
    createdBy,
    updated_by: updatedBySnake,
    updatedBy,
    ...publicDesign
  } = design;

  if (result?.design && typeof result === 'object' && !Array.isArray(result)) {
    return { ...result, design: publicDesign };
  }
  return publicDesign;
}

function toFiniteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function publicJsonValue(value, depth = 0) {
  if (depth > 4) return undefined;
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map(item => publicJsonValue(item, depth + 1))
      .filter(item => item !== undefined);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const safeKey = String(key || '').trim();
      if (!safeKey || safeKey === '__proto__' || safeKey === 'constructor' || safeKey === 'prototype') continue;
      const safeValue = publicJsonValue(nested, depth + 1);
      if (safeValue !== undefined) out[safeKey] = safeValue;
    }
    return out;
  }
  return undefined;
}

function publicWidgetLayoutItem(item = {}) {
  const result = {
    instanceId: String(item.instanceId || ''),
    widgetId: String(item.widgetId || ''),
    xPercent: toFiniteNumber(item.xPercent, 0),
    yPercent: toFiniteNumber(item.yPercent, 0),
    wPercent: toFiniteNumber(item.wPercent, 0),
    hPercent: toFiniteNumber(item.hPercent, 0)
  };
  for (const key of ['zIndex', 'rotationDeg', 'opacity']) {
    if (item[key] != null) result[key] = toFiniteNumber(item[key], key === 'opacity' ? 1 : 0);
  }
  for (const key of ['html', 'css', 'js']) {
    if (typeof item[key] === 'string' && item[key]) result[key] = item[key];
  }
  const metadata = publicJsonValue(item.metadata);
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) && Object.keys(metadata).length) {
    result.metadata = metadata;
  }
  return result;
}

function toPublicDesignerLayout(layout = {}) {
  const source = layout && typeof layout === 'object' && !Array.isArray(layout) ? layout : {};
  const grid = source.grid && typeof source.grid === 'object' && !Array.isArray(source.grid)
    ? source.grid
    : {};
  return {
    grid: {
      columns: toFiniteNumber(grid.columns, 12),
      cellHeight: toFiniteNumber(grid.cellHeight, 8)
    },
    items: Array.isArray(source.items)
      ? source.items
          .filter(item => item && typeof item === 'object' && !Array.isArray(item))
          .map(publicWidgetLayoutItem)
          .filter(item => item.instanceId && item.widgetId)
      : [],
    layoutRef: typeof source.layoutRef === 'string' ? source.layoutRef : undefined
  };
}

function toPreviewInfo(payload = {}, source = 'entry') {
  return {
    source,
    expiresAt: payload.exp ? new Date(Number(payload.exp) * 1000).toISOString() : null,
    issuedAt: payload.iat ? new Date(Number(payload.iat) * 1000).toISOString() : null,
    entryId: payload.entryId || null,
    revisionId: payload.revisionId || null,
    version: payload.version || null,
    autosaveId: payload.autosaveId || null
  };
}

function toPublicSearchDocument(doc = {}) {
  return {
    id: doc.id || doc.documentId || null,
    entryId: doc.entryId ?? doc.entry_id ?? null,
    sourceModule: doc.sourceModule || doc.source_module || '',
    sourceId: doc.sourceId || doc.source_id || '',
    contentTypeKey: doc.contentTypeKey || doc.content_type_key || '',
    title: doc.title || '',
    excerpt: doc.excerpt || '',
    url: doc.url || doc.permalink || '',
    language: doc.language || '',
    status: doc.status || '',
    visibility: doc.visibility || '',
    meta: publicMeta(doc.meta || {})
  };
}

function isPublicSearchDocument(doc) {
  return doc &&
    String(doc.status || '').toLowerCase() === 'published' &&
    String(doc.visibility || 'public').toLowerCase() === 'public';
}

function toPublicNavigationItem(item = {}) {
  const normalized = {
    id: item.id || item.itemId || null,
    parentId: item.parentId ?? item.parent_id ?? null,
    type: item.type || 'custom',
    title: item.title || '',
    url: item.url || '',
    target: item.target || '',
    rel: item.rel || '',
    cssClass: item.cssClass || item.css_class || '',
    position: Number(item.position) || 0,
    status: item.status || '',
    entryId: item.entryId ?? item.entry_id ?? null,
    sourceModule: item.sourceModule || item.source_module || '',
    sourceId: item.sourceId || item.source_id || '',
    meta: publicMeta(item.meta || {})
  };
  if (Array.isArray(item.children)) {
    normalized.children = item.children.map(toPublicNavigationItem);
  }
  return normalized;
}

function toPublicComment(comment = {}) {
  return {
    id: comment.id || comment.commentId || null,
    entryId: comment.entryId ?? comment.entry_id ?? null,
    sourceModule: comment.sourceModule || comment.source_module || '',
    sourceId: comment.sourceId || comment.source_id || '',
    parentId: comment.parentId ?? comment.parent_id ?? null,
    authorName: comment.authorName || comment.author_name || 'Anonymous',
    authorUrl: comment.authorUrl || comment.author_url || '',
    content: comment.content || '',
    status: comment.status || '',
    meta: publicMeta(comment.meta || {}),
    createdAt: comment.createdAt || comment.created_at || null,
    updatedAt: comment.updatedAt || comment.updated_at || null
  };
}

function isApprovedComment(comment) {
  return comment && String(comment.status || '').toLowerCase() === 'approved';
}

function activeNavigationItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(item => String(item.status || 'active').toLowerCase() === 'active')
    .map(item => ({
      ...item,
      children: activeNavigationItems(item.children || [])
    }));
}

function toPublicMenu(menu = {}) {
  return {
    id: menu.id || menu.menuId || null,
    key: menu.key || menu.menuKey || '',
    label: menu.label || '',
    description: menu.description || '',
    locationKey: menu.locationKey || menu.location_key || ''
  };
}

function sendPublicNotFound(res, code = 'not_found') {
  res.status(404).json({ error: { code, message: 'Public resource not found.' } });
}

function sendPublicApiError(res, err) {
  const missingListener = /^Missing event listener:/.test(err?.message || '');
  const status = Number(err?.statusCode || err?.status) || (missingListener ? 503 : 500);
  const code = err?.code || (missingListener ? 'service_unavailable' : 'runtime_error');
  const message = status >= 500 ? 'Public runtime request failed.' : err.message;
  res.status(status).json({ error: { code, message } });
}

function publicCommentTargetFromRequest(req, body = {}) {
  const entryId = req.query?.entryId || req.query?.contentEntryId || body.entryId || body.contentEntryId || null;
  const sourceModule = req.query?.sourceModule || body.sourceModule || '';
  const sourceId = req.query?.sourceId || body.sourceId || '';
  if (entryId) return { entryId: String(entryId) };
  if (sourceModule && sourceId) {
    return {
      sourceModule: String(sourceModule).trim().slice(0, 120),
      sourceId: String(sourceId).trim().slice(0, 160)
    };
  }
  return null;
}

function shouldCheckRedirect(req) {
  if (!req || !['GET', 'HEAD'].includes(String(req.method || '').toUpperCase())) return false;
  const requestPath = req.path || '/';
  return !REDIRECT_SKIP_PREFIXES.some(prefix =>
    requestPath === prefix || requestPath.startsWith(`${prefix}/`)
  );
}

function normalizeRedirectStatus(value) {
  const status = Number(value) || 301;
  return [301, 302, 303, 307, 308].includes(status) ? status : 301;
}

async function isMaintenanceMode(motherEmitter, jwt) {
  try {
    const value = await emitAsync(motherEmitter, 'getSetting', {
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'MAINTENANCE_MODE'
    });
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  } catch {
    return false;
  }
}

async function ensurePublicContentTarget(motherEmitter, jwt, target, language = 'en') {
  if (!target) return { ok: false, reason: 'missing-target' };

  let entry = null;
  if (target.entryId) {
    entry = await emitOptionalAsync(motherEmitter, 'getContentEntry', {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      entryId: target.entryId
    }, null);
  } else if (target.sourceModule && target.sourceId) {
    entry = await emitOptionalAsync(motherEmitter, 'getContentEntryBySource', {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      sourceModule: target.sourceModule,
      sourceId: target.sourceId,
      language
    }, null);
  }

  if (entry && !isPublishedEntry(entry)) {
    return { ok: false, reason: 'not-public', entry };
  }
  return { ok: true, entry };
}

async function loadContentEntryForTarget(motherEmitter, jwt, target, language = 'en') {
  if (!target) return null;
  if (target.entryId) {
    return emitAsync(motherEmitter, 'getContentEntry', {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      entryId: target.entryId
    });
  }
  if (target.sourceModule && target.sourceId) {
    return emitAsync(motherEmitter, 'getContentEntryBySource', {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      sourceModule: target.sourceModule,
      sourceId: target.sourceId
    });
  }
  if (target.path) {
    return emitAsync(motherEmitter, 'resolveContentPermalink', {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      permalink: target.path,
      language
    });
  }
  return null;
}

function applyPreviewOverlay(entry = {}, overlay = {}, source = 'entry') {
  if (!overlay || !Object.keys(overlay).length) {
    return { entry, source: 'entry', overlay: null };
  }

  return {
    source,
    overlay,
    entry: {
      ...entry,
      status: overlay.status ?? entry.status,
      title: overlay.title ?? entry.title,
      excerpt: overlay.excerpt ?? entry.excerpt,
      content: overlay.content ?? entry.content,
      meta: {
        ...(entry.meta || {}),
        ...(overlay.meta || {})
      },
      updatedAt: overlay.updatedAt || overlay.updated_at || entry.updatedAt || entry.updated_at,
      updated_at: overlay.updatedAt || overlay.updated_at || entry.updated_at
    }
  };
}

async function loadPreviewOverlay(motherEmitter, jwt, tokenPayload, entry) {
  const entryId = String(entry.id || entry.entryId || tokenPayload.entryId || '');
  if (tokenPayload.revisionId || tokenPayload.version) {
    const revision = await emitAsync(motherEmitter, 'getContentRevision', {
      jwt,
      moduleName: 'contentEngine',
      moduleType: 'core',
      entryId,
      revisionId: tokenPayload.revisionId || null,
      version: tokenPayload.version || null
    });
    if (!revision) throw new Error('Preview revision not found.');
    const revisionEntryId = String(revision.entry_id || revision.entryId || entryId);
    if (revisionEntryId !== entryId) throw new Error('Preview revision target mismatch.');
    return applyPreviewOverlay(entry, revision, 'revision');
  }

  if (tokenPayload.autosaveId || tokenPayload.useAutosave) {
    const autosave = await emitOptionalAsync(motherEmitter, 'getContentAutosave', {
      jwt,
      moduleName: 'workflowManager',
      moduleType: 'core',
      id: tokenPayload.autosaveId || null,
      entryId,
      authorId: tokenPayload.userId || ''
    }, null);
    if (tokenPayload.autosaveId && !autosave) throw new Error('Preview autosave not found.');
    if (autosave) return applyPreviewOverlay(entry, autosave, 'autosave');
  }

  return { entry, source: 'entry', overlay: null };
}

async function loadPreviewEntry(motherEmitter, jwt, tokenPayload) {
  const target = previewTargetFromPayload(tokenPayload);
  const entry = await loadContentEntryForTarget(motherEmitter, jwt, target, tokenPayload.language || 'en');
  if (!entry || isDeletedEntry(entry)) {
    return null;
  }
  return loadPreviewOverlay(motherEmitter, jwt, tokenPayload, entry);
}

async function resolvePublicContentByPath(motherEmitter, jwt, req, res) {
  const requestedPath = normalizePublicPath(publicPathFromRequest(req));
  const language = languageFromRequest(req, 'en');
  const entry = await emitAsync(motherEmitter, 'resolveContentPermalink', {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    permalink: requestedPath,
    language
  });

  if (!isPublishedEntry(entry)) {
    return sendPublicNotFound(res, 'content_not_found');
  }

  const seoResult = await emitOptionalAsync(motherEmitter, 'resolveSeoMeta', {
      jwt,
      moduleName: 'seoManager',
      moduleType: 'core',
      path: entry.permalink || requestedPath,
      language
    }, null);

  res.set('Cache-Control', 'public, max-age=60');
  return res.json({
    entry: toPublicEntry(entry),
    seo: seoResult?.seo || null
  });
}

async function listPublicContent(motherEmitter, jwt, req, res) {
  const contentTypeKey = normalizePublicKey(req.params?.contentTypeKey || req.query?.contentTypeKey || req.query?.type || '');
  const language = languageFromRequest(req, '');
  const limit = parseLimit(req.query?.limit);
  const offset = parseOffset(req.query?.offset);
  const entries = await emitAsync(motherEmitter, 'listContentEntries', {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    contentTypeKey,
    status: 'published',
    language,
    limit,
    offset
  });

  res.set('Cache-Control', 'public, max-age=60');
  return res.json({
    entries: (Array.isArray(entries) ? entries : []).filter(isPublishedEntry).map(toPublicEntry),
    pagination: {
      limit,
      offset,
      count: Array.isArray(entries) ? entries.length : 0
    }
  });
}

async function renderPublicSearch(motherEmitter, jwt, req, res) {
  try {
    const limit = parseLimit(req.query?.limit, 20);
    const offset = parseOffset(req.query?.offset);
    const results = await emitAsync(motherEmitter, 'searchDocuments', {
      jwt,
      moduleName: 'searchManager',
      moduleType: 'core',
      decodedJWT: PUBLIC_READ_PRINCIPAL,
      query: req.query?.q || req.query?.query || '',
      contentTypeKey: normalizePublicKey(req.query?.contentTypeKey || req.query?.type || ''),
      language: languageFromRequest(req, ''),
      status: 'published',
      visibility: 'public',
      limit,
      offset
    });

    res.set('Cache-Control', 'public, max-age=30');
    return res.json({
      results: (Array.isArray(results) ? results : []).filter(isPublicSearchDocument).map(toPublicSearchDocument),
      pagination: {
        limit,
        offset,
        count: Array.isArray(results) ? results.length : 0
      }
    });
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

async function createContentPreviewToken(motherEmitter, jwt, payload = {}) {
  assertRuntimePayload(payload, 'createContentPreviewToken');
  requirePayloadPermission(payload, 'content.update');

  const target = previewTargetFromPayload(payload);
  if (!target) throw new Error('Preview target is required.');

  const language = String(payload.language || 'en').trim().toLowerCase();
  const entry = await loadContentEntryForTarget(motherEmitter, jwt, target, language);
  if (!entry || isDeletedEntry(entry)) {
    throw new Error('Content entry not found.');
  }

  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = clampPreviewTtl(payload.ttlSeconds || payload.ttl);
  const entryId = String(entry.id || entry.entryId || target.entryId || '');
  const tokenPayload = stripUndefined({
    v: 1,
    purpose: 'content-preview',
    entryId,
    sourceModule: entry.sourceModule || entry.source_module || target.sourceModule,
    sourceId: entry.sourceId || entry.source_id || target.sourceId,
    path: entry.permalink || target.path,
    language: entry.language || language,
    revisionId: payload.revisionId || payload.revision_id,
    version: payload.version ? Number(payload.version) : undefined,
    autosaveId: payload.autosaveId || payload.autosave_id,
    useAutosave: payload.useAutosave === true,
    userId: actorIdFromPayload(payload),
    iat: now,
    exp: now + ttlSeconds,
    nonce: crypto.randomBytes(8).toString('hex')
  });
  const token = signPreviewPayload(tokenPayload);

  return {
    token,
    previewUrl: `/api/public/preview?token=${encodeURIComponent(token)}`,
    expiresAt: new Date(tokenPayload.exp * 1000).toISOString(),
    entry: toPublicEntry(entry)
  };
}

function requirePublicRuntimePrincipal(payload) {
  if (!payload?.decodedJWT) {
    throw new Error('Authentication required: public runtime principal missing.');
  }
}

function publicRuntimeParams(params = {}, resource = '', action = '') {
  const source = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  const safe = { ...source };
  delete safe.jwt;
  delete safe.decodedJWT;
  delete safe.moduleName;
  delete safe.moduleType;

  if (resource === 'pages') {
    safe.lane = 'public';
    if (action === 'children') delete safe.lane;
  }

  if (resource === 'widgets' && action === 'list') {
    safe.widgetType = 'public';
  }

  if (resource === 'plainSpace') {
    if (PUBLIC_PLAINSPACE_LANE_ACTIONS.has(action)) {
      safe.lane = 'public';
    }
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

function publicRuntimeData(resource, action, data) {
  if (resource === 'pages') {
    if (action === 'children') {
      return normalizeRuntimeRows(data)
        .filter(isPublishedPublicPage)
        .map(toPublicPage);
    }
    if (action === 'envelope') return data;
    const page = normalizeRuntimeSingle(data);
    return isPublishedPublicPage(page) ? toPublicPage(page) : null;
  }

  if (resource === 'widgets' && action === 'list') {
    return normalizeRuntimeRows(data).filter(widget =>
      String(widget.widgetType || widget.widget_type || 'public').toLowerCase() === 'public'
    );
  }

  if (resource === 'designer' && action === 'get') {
    return isPublicDesignResult(data) ? toPublicDesignResult(data) : null;
  }
  if (resource === 'designer' && action === 'getLayout') {
    return toPublicDesignerLayout(data);
  }

  if (resource === 'plainSpace') {
    return toPublicPlainSpaceData(data);
  }

  return data;
}

async function cmsPublicRuntimeRequest(motherEmitter, internalJwt, payload = {}) {
  assertRuntimePayload(payload, 'cmsPublicRuntimeRequest');
  requirePublicRuntimePrincipal(payload);

  const { resource, action, definition } = publicRuntimeDefinition(payload.resource, payload.action);
  if (!definition) {
    throw new Error(`Unknown CMS public runtime action: ${payload.resource || ''}.${payload.action || ''}`);
  }

  const params = publicRuntimeParams(payload.params, resource, action);
  const eventPayload = {
    ...params,
    jwt: internalJwt || payload.jwt,
    moduleName: definition.moduleName,
    moduleType: definition.moduleType || 'core'
  };

  if (resource === 'pages' && action === 'envelope') {
    const page = await emitAsync(motherEmitter, 'getPageBySlug', {
      ...eventPayload,
      slug: params.slug || '',
      lane: 'public'
    });
    if (!isPublishedPublicPage(normalizeRuntimeSingle(page))) {
      throw new Error('Page not found');
    }
  }

  const data = await emitAsync(motherEmitter, definition.eventName, eventPayload);
  return {
    resource,
    action,
    eventName: definition.eventName,
    data: publicRuntimeData(resource, action, data)
  };
}

async function cmsAdminApiRequest(motherEmitter, jwt, payload = {}) {
  assertRuntimePayload(payload, 'cmsAdminApiRequest');
  requireAdminPrincipal(payload);

  const { resource, action, definition } = adminApiDefinition(payload.resource, payload.action);
  if (!definition) {
    throw new Error(`Unknown CMS admin API action: ${payload.resource || ''}.${payload.action || ''}`);
  }

  requireAppContextReadOnly(payload, resource, action);
  requirePayloadPermission(payload, definition.permission);

  const params = payload.params && typeof payload.params === 'object' && !Array.isArray(payload.params)
    ? payload.params
    : {};
  const eventPayload = {
    ...params,
    jwt,
    moduleName: definition.moduleName,
    moduleType: definition.moduleType || 'core',
    decodedJWT: payload.decodedJWT
  };
  if (definition.useActorUserId) {
    const userId = actorIdFromPayload(payload);
    if (!userId) {
      throw new Error('[runtimeManager:ACTOR_USER_ID_REQUIRED] Current-user admin action requires an authenticated user id.');
    }
    eventPayload.userId = userId;
  }
  const data = await emitAsync(motherEmitter, definition.eventName, eventPayload);
  return {
    resource,
    action,
    eventName: definition.eventName,
    data
  };
}

async function renderPublicPreview(motherEmitter, jwt, req, res) {
  try {
    const rawToken = req.query?.token || String(req.get?.('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!rawToken) {
      return res.status(401).json({ error: { code: 'missing_preview_token', message: 'Preview token is required.' } });
    }

    let tokenPayload = null;
    try {
      tokenPayload = verifyPreviewToken(rawToken);
    } catch {
      return res.status(401).json({ error: { code: 'invalid_preview_token', message: 'Invalid or expired preview token.' } });
    }

    const preview = await loadPreviewEntry(motherEmitter, jwt, tokenPayload);
    if (!preview) return sendPublicNotFound(res, 'preview_not_found');

    const entryId = preview.entry.id || preview.entry.entryId || tokenPayload.entryId;
    const seoResult = await emitOptionalAsync(motherEmitter, 'resolveSeoMeta', {
        jwt,
        moduleName: 'seoManager',
        moduleType: 'core',
        path: preview.entry.permalink || tokenPayload.path || '',
        entryId,
        language: tokenPayload.language || preview.entry.language || 'en'
      }, null);

    res.set('Cache-Control', 'no-store');
    return res.json({
      entry: toPublicEntry(preview.entry),
      preview: toPreviewInfo(tokenPayload, preview.source),
      seo: seoResult?.seo || null
    });
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

async function renderPublicContent(motherEmitter, jwt, req, res) {
  try {
    if (publicPathFromRequest(req)) {
      return await resolvePublicContentByPath(motherEmitter, jwt, req, res);
    }
    return await listPublicContent(motherEmitter, jwt, req, res);
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

async function listPublicComments(motherEmitter, jwt, req, res) {
  const target = publicCommentTargetFromRequest(req);
  const targetCheck = await ensurePublicContentTarget(motherEmitter, jwt, target, languageFromRequest(req, 'en'));
  if (!targetCheck.ok) {
    if (targetCheck.reason === 'missing-target') {
      return res.status(400).json({ error: { code: 'invalid_comment_target', message: 'entryId or sourceModule/sourceId is required.' } });
    }
    return sendPublicNotFound(res, 'comments_not_found');
  }

  const limit = parseLimit(req.query?.limit, 50);
  const offset = parseOffset(req.query?.offset);
  const comments = await emitAsync(motherEmitter, 'listCommentsForEntry', {
    jwt,
    moduleName: 'commentsManager',
    moduleType: 'core',
    decodedJWT: PUBLIC_READ_PRINCIPAL,
    ...target,
    status: 'approved',
    limit,
    offset
  });

  res.set('Cache-Control', 'public, max-age=30');
  return res.json({
    comments: (Array.isArray(comments) ? comments : []).filter(isApprovedComment).map(toPublicComment),
    pagination: {
      limit,
      offset,
      count: Array.isArray(comments) ? comments.length : 0
    }
  });
}

async function createPublicComment(motherEmitter, jwt, req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const target = publicCommentTargetFromRequest(req, body);
  const targetCheck = await ensurePublicContentTarget(motherEmitter, jwt, target, languageFromRequest(req, 'en'));
  if (!targetCheck.ok) {
    if (targetCheck.reason === 'missing-target') {
      return res.status(400).json({ error: { code: 'invalid_comment_target', message: 'entryId or sourceModule/sourceId is required.' } });
    }
    return sendPublicNotFound(res, 'comments_not_found');
  }

  if (!String(body.content || '').trim()) {
    return res.status(400).json({ error: { code: 'invalid_comment_content', message: 'Comment content is required.' } });
  }

  const input = {
    jwt,
    moduleName: 'commentsManager',
    moduleType: 'core',
    decodedJWT: PUBLIC_COMMENT_PRINCIPAL,
    ...target,
    parentId: body.parentId || body.parent_id || null,
    authorName: body.authorName || body.author_name || 'Anonymous',
    authorEmail: body.authorEmail || body.author_email || '',
    authorUrl: body.authorUrl || body.author_url || '',
    authorIp: req.ip || req.connection?.remoteAddress || '',
    userAgent: req.get?.('user-agent') || '',
    content: body.content,
    status: 'pending',
    meta: publicMeta(body.meta || {})
  };
  const result = await emitAsync(motherEmitter, 'createComment', input);

  res.set('Cache-Control', 'no-store');
  return res.status(201).json({
    comment: toPublicComment({
      ...input,
      ...result,
      status: result?.status || 'pending'
    }),
    moderation: 'pending'
  });
}

async function renderPublicComments(motherEmitter, jwt, req, res) {
  try {
    if (String(req.method || '').toUpperCase() === 'POST') {
      return await createPublicComment(motherEmitter, jwt, req, res);
    }
    return await listPublicComments(motherEmitter, jwt, req, res);
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

async function renderPublicNavigation(motherEmitter, jwt, req, res) {
  try {
    const locationKey = normalizePublicKey(req.params?.locationKey || req.query?.location || 'primary');
    if (!locationKey) {
      return res.status(400).json({ error: { code: 'invalid_location', message: 'Navigation location is required.' } });
    }

    const result = await emitAsync(motherEmitter, 'getNavigationTree', {
      jwt,
      moduleName: 'navigationManager',
      moduleType: 'core',
      locationKey,
      status: 'active'
    });

    res.set('Cache-Control', 'public, max-age=60');
    return res.json({
      menu: toPublicMenu(result?.menu || {}),
      items: activeNavigationItems(result?.items || []).map(toPublicNavigationItem),
      tree: activeNavigationItems(result?.tree || []).map(toPublicNavigationItem)
    });
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

function publicSettingKeysFromRequest(req) {
  const raw = req.query?.keys || req.query?.key || '';
  if (Array.isArray(raw)) return raw.flatMap(item => String(item || '').split(',')).map(item => item.trim()).filter(Boolean);
  return String(raw || '').split(',').map(item => item.trim()).filter(Boolean);
}

async function renderPublicSettings(motherEmitter, jwt, req, res) {
  try {
    const keys = publicSettingKeysFromRequest(req);
    const settings = await emitAsync(motherEmitter, 'getPublicSettings', {
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core',
      ...(keys.length ? { keys } : {})
    });
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({ settings: settings || {} });
  } catch (err) {
    if (/key not allowed/i.test(err?.message || '')) err.statusCode = 403;
    return sendPublicApiError(res, err);
  }
}

async function renderPublicSeo(motherEmitter, jwt, req, res) {
  try {
    const requestedPath = publicPathFromRequest(req) ? normalizePublicPath(publicPathFromRequest(req)) : '';
    const entryId = req.query?.entryId || req.query?.id || '';
    const language = languageFromRequest(req, 'en');
    let entry = null;

    if (requestedPath) {
      entry = await emitOptionalAsync(motherEmitter, 'resolveContentPermalink', {
        jwt,
        moduleName: 'contentEngine',
        moduleType: 'core',
        permalink: requestedPath,
        language
      }, null);
    } else if (entryId) {
      entry = await emitOptionalAsync(motherEmitter, 'getContentEntry', {
        jwt,
        moduleName: 'contentEngine',
        moduleType: 'core',
        entryId
      }, null);
    }

    if ((requestedPath || entryId) && entry && !isPublishedEntry(entry)) {
      return sendPublicNotFound(res, 'seo_not_found');
    }

    const seoPayload = {
      jwt,
      moduleName: 'seoManager',
      moduleType: 'core',
      language
    };
    if (requestedPath) seoPayload.path = requestedPath;
    else if (entryId) seoPayload.entryId = entryId;
    else {
      seoPayload.targetType = 'global';
      seoPayload.targetKey = 'default';
    }

    const result = await emitAsync(motherEmitter, 'resolveSeoMeta', seoPayload);
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({
      target: result?.target || null,
      seo: result?.seo || {},
      entry: isPublishedEntry(entry) ? toPublicEntry(entry) : null
    });
  } catch (err) {
    return sendPublicApiError(res, err);
  }
}

async function handleRedirectRequest(motherEmitter, jwt, req, res, next) {
  if (!shouldCheckRedirect(req)) return next();
  try {
    if (await isMaintenanceMode(motherEmitter, jwt)) {
      return next();
    }

    const resolved = await emitAsync(motherEmitter, 'resolveRedirect', {
      jwt,
      moduleName: 'redirectManager',
      moduleType: 'core',
      path: req.path || '/',
      language: req.query?.lang || req.query?.language || '',
      userAgent: req.get?.('user-agent') || '',
      referer: req.get?.('referer') || req.get?.('referrer') || ''
    });

    if (!resolved?.target) return next();
    const currentUrl = req.originalUrl || req.url || req.path || '/';
    if (resolved.target === currentUrl || resolved.target === req.path) return next();

    res.redirect(normalizeRedirectStatus(resolved.statusCode), resolved.target);
  } catch (err) {
    console.warn('[RUNTIME MANAGER] Redirect lookup failed:', err.message);
    next();
  }
}

async function renderSitemap(motherEmitter, jwt, req, res, next) {
  try {
    const xml = await emitAsync(motherEmitter, 'generateSeoSitemap', {
      jwt,
      moduleName: 'seoManager',
      moduleType: 'core',
      baseUrl: baseUrlFromRequest(req),
      language: req.query?.lang || req.query?.language || '',
      limit: req.query?.limit || 500
    });
    res.set('Cache-Control', 'public, max-age=300');
    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
}

async function renderRobots(motherEmitter, jwt, req, res, next) {
  try {
    const txt = await emitAsync(motherEmitter, 'generateRobotsTxt', {
      jwt,
      moduleName: 'seoManager',
      moduleType: 'core',
      baseUrl: baseUrlFromRequest(req)
    });
    res.set('Cache-Control', 'public, max-age=300');
    res.type('text/plain').send(txt);
  } catch (err) {
    next(err);
  }
}

function setupRuntimeEvents(motherEmitter, runtimeJwt = '') {
  motherEmitter.on('cmsAdminApiRequest', async (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      const result = await cmsAdminApiRequest(motherEmitter, payload?.jwt, payload);
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('cmsPublicRuntimeRequest', async (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      const result = await cmsPublicRuntimeRequest(motherEmitter, runtimeJwt || payload?.jwt, payload);
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('createContentPreviewToken', async (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      const result = await createContentPreviewToken(motherEmitter, payload?.jwt, payload);
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });
}

function registerPublicRuntimeRoutes(app, motherEmitter, jwt) {
  app.get('/api/public/search', (req, res) => renderPublicSearch(motherEmitter, jwt, req, res));
  app.get('/api/public/preview', (req, res) => renderPublicPreview(motherEmitter, jwt, req, res));
  app.get('/api/public/content', (req, res) => renderPublicContent(motherEmitter, jwt, req, res));
  app.get('/api/public/content/:contentTypeKey', (req, res) => renderPublicContent(motherEmitter, jwt, req, res));
  app.get('/api/public/comments', (req, res) => renderPublicComments(motherEmitter, jwt, req, res));
  app.post('/api/public/comments', (req, res) => renderPublicComments(motherEmitter, jwt, req, res));
  app.get('/api/public/navigation/:locationKey', (req, res) => renderPublicNavigation(motherEmitter, jwt, req, res));
  app.get('/api/public/settings', (req, res) => renderPublicSettings(motherEmitter, jwt, req, res));
  app.get('/api/public/seo', (req, res) => renderPublicSeo(motherEmitter, jwt, req, res));
  app.get('/sitemap.xml', (req, res, next) => renderSitemap(motherEmitter, jwt, req, res, next));
  app.get('/robots.txt', (req, res, next) => renderRobots(motherEmitter, jwt, req, res, next));
  app.use((req, res, next) => handleRedirectRequest(motherEmitter, jwt, req, res, next));
}

async function runScheduledPublisherOnce(motherEmitter, jwt, options = {}) {
  if (typeof motherEmitter.listenerCount === 'function' &&
      motherEmitter.listenerCount('publishScheduledContentEntries') === 0) {
    return { skipped: true, reason: 'missing-listener' };
  }
  return emitAsync(motherEmitter, 'publishScheduledContentEntries', {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    dueBefore: new Date().toISOString(),
    limit: Number(options.limit) || DEFAULT_SCHEDULE_LIMIT
  });
}

function startScheduledPublisher(motherEmitter, jwt, options = {}) {
  if (process.env.CONTENT_SCHEDULER_DISABLED === 'true' || options.disabled === true) {
    return null;
  }

  const intervalMs = Math.max(
    Number(options.intervalMs || process.env.CONTENT_SCHEDULER_INTERVAL_MS || DEFAULT_SCHEDULE_INTERVAL_MS),
    5000
  );

  const tick = async () => {
    try {
      const result = await runScheduledPublisherOnce(motherEmitter, jwt, options);
      if (result?.publishedCount > 0) {
        console.log(`[RUNTIME MANAGER] Published ${result.publishedCount} scheduled entries.`);
      }
    } catch (err) {
      console.warn('[RUNTIME MANAGER] Scheduled publishing failed:', err.message);
    }
  };

  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  tick();
  return timer;
}

module.exports = {
  async initialize({ app, motherEmitter, isCore, jwt }) {
    if (!isCore) throw new Error('[RUNTIME MANAGER] Must be loaded as a core module.');
    if (!jwt) throw new Error('[RUNTIME MANAGER] initialization requires a valid JWT token.');
    if (!app) throw new Error('[RUNTIME MANAGER] Express app is required.');
    if (!motherEmitter) throw new Error('[RUNTIME MANAGER] motherEmitter missing.');
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[RUNTIME MANAGER] Initializing public runtime hooks...');
    setupRuntimeEvents(motherEmitter, jwt);
    registerPublicRuntimeRoutes(app, motherEmitter, jwt);
    startScheduledPublisher(motherEmitter, jwt);
    console.log('[RUNTIME MANAGER] Ready.');
  },

  _internals: {
    activeNavigationItems,
    adminApiDefinition,
    adminApiEventDefinition,
    baseUrlFromRequest,
    cmsAdminApiRequest,
    cmsPublicRuntimeRequest,
    createPublicComment,
    createContentPreviewToken,
    handleRedirectRequest,
    isPublicSearchDocument,
    languageFromRequest,
    loadPreviewEntry,
    listPublicComments,
    listPublicContent,
    normalizeRedirectStatus,
    publicRuntimeDefinition,
    normalizePublicKey,
    normalizePublicPath,
    registerPublicRuntimeRoutes,
    renderPublicComments,
    renderPublicContent,
    renderPublicNavigation,
    renderPublicPreview,
    renderPublicSearch,
    renderPublicSeo,
    renderPublicSettings,
    renderRobots,
    renderSitemap,
    setupRuntimeEvents,
    signPreviewPayload,
    isMaintenanceMode,
    runScheduledPublisherOnce,
    shouldCheckRedirect,
    startScheduledPublisher,
    verifyPreviewToken
  },

  MODULE_NAME,
  MODULE_TYPE
};
