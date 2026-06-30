'use strict';

const HTTP_PUBLIC_EVENTS = new Set([
  'issuePublicToken',
  'ensurePublicToken'
]);

const HTTP_PUBLIC_TOKEN_EVENTS = new Set([
  'cmsPublicRuntimeRequest'
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
  'inspectModuleZipAccess',
  'installModuleFromZip',
  'issueModuleToken',
  'issueUserToken',
  'listPendingModuleAccessRequests',
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
  'resolveModuleAccessRequest',
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
  'setUserAccess',
  'getAllUsers',
  'getUserAccess',
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
  'listActiveLoginStrategies',
  'listLoginStrategies',
  'createPermission',
  'getAllPermissions',
  'listSettings',
  'getSetting',
  'getPublicSetting',
  'getPublicSettings',
  'getAllSettings',
  'getCmsMode',
  'getUserCount',
  'listModuleSettings',
  'listModuleSettingsSchemas',
  'listNavigationLocations',
  'listNavigationMenus',
  'listRegisteredSettingsModules',
  'listScheduledContentEntries',
  'listSeoMeta',
  'listActiveStaticFrontends',
  'listTranslatedTexts',
  'listTrashedContentEntries',
  'getModuleRegistry',
  'listSystemModules',
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
  'loginWithStrategy',
  'listCommentsForEntry',
  'listFontProviders',
  'listFonts',
  'listLocalFolder',
  'listServerLocations',
  'makeFilePublic',
  'publishScheduledContentEntries',
  'publicRegister',
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
  'listPendingModuleAccessRequests',
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
  'getUserAccess',
  'getUserDetailsById',
  'getUserDetailsByUsername',
  'listActiveStaticFrontends',
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
  'resolveModuleAccessRequest',
  'listThemes'
]);

const APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS = SENSITIVE_SYSTEM_QUERY_EVENTS;

const APP_FORBIDDEN_DIRECT_EVENTS = new Set([
  ...Array.from(HTTP_FORBIDDEN_EXTERNAL_EVENTS).filter(eventName =>
    !AGENT_SURFACE_BRIDGE_EVENTS.has(eventName)
  ),
  ...APP_FORBIDDEN_SENSITIVE_QUERY_EVENTS,
  'cmsPublicRuntimeRequest',
  'dispatchAppEvent',
  'validateToken'
]);

function normalizeEventName(eventName) {
  return String(eventName || '').trim();
}

function stripHttpPayloadAuthMeta(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const clean = { ...source };
  delete clean.jwt;
  delete clean.decodedJWT;
  return clean;
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
  HTTP_PUBLIC_EVENTS,
  HTTP_PUBLIC_TOKEN_EVENTS,
  SENSITIVE_SYSTEM_QUERY_EVENTS,
  explainExternalEventRejection,
  hasRawPlaceholderPayload,
  isHttpDirectContractEvent,
  isHttpPublicEvent,
  isHttpPublicTokenEvent,
  stripHttpPayloadAuthMeta
};
