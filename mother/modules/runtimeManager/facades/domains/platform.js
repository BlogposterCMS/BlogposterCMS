'use strict';

const { BACKEND_EVENTS } = require('../../../../contracts/generatedBackendEventCatalog');

// Platform administration resources remain facade declarations; this split
// does not change their module owners, permissions or emitted event names.
const adminActions = Object.freeze({
  settings: Object.freeze({
    list: { eventName: BACKEND_EVENTS.LIST_SETTINGS, moduleName: 'settingsManager', permission: 'settings.core.view' },
    get: { eventName: BACKEND_EVENTS.GET_SETTING, moduleName: 'settingsManager', permission: 'settings.core.view' },
    public: { eventName: BACKEND_EVENTS.GET_PUBLIC_SETTINGS, moduleName: 'settingsManager', permission: 'settings.core.view' },
    cmsMode: { eventName: BACKEND_EVENTS.GET_CMS_MODE, moduleName: 'settingsManager', permission: 'settings.core.view' },
    setCmsMode: { eventName: BACKEND_EVENTS.SET_CMS_MODE, moduleName: 'settingsManager', permission: 'settings.core.edit' },
    set: { eventName: BACKEND_EVENTS.SET_SETTING, moduleName: 'settingsManager', permission: 'settings.core.edit' },
    bulk: { eventName: BACKEND_EVENTS.SET_SETTINGS, moduleName: 'settingsManager', permission: 'settings.core.edit' },
    delete: { eventName: BACKEND_EVENTS.DELETE_SETTING, moduleName: 'settingsManager', permission: 'settings.core.edit' }
  }),
  modules: Object.freeze({
    registry: { eventName: BACKEND_EVENTS.GET_MODULE_REGISTRY, moduleName: 'moduleLoader', permission: 'modules.list' },
    system: { eventName: BACKEND_EVENTS.LIST_SYSTEM_MODULES, moduleName: 'moduleLoader', permission: 'modules.list' },
    activeStaticFrontends: { eventName: BACKEND_EVENTS.LIST_ACTIVE_STATIC_FRONTENDS, moduleName: 'moduleLoader', permission: 'modules.listActive' },
    activate: { eventName: BACKEND_EVENTS.ACTIVATE_MODULE_IN_REGISTRY, moduleName: 'moduleLoader', permission: 'modules.activate' },
    deactivate: { eventName: BACKEND_EVENTS.DEACTIVATE_MODULE_IN_REGISTRY, moduleName: 'moduleLoader', permission: 'modules.deactivate' },
    inspectZip: { eventName: BACKEND_EVENTS.INSPECT_MODULE_ZIP_ACCESS, moduleName: 'moduleLoader', permission: 'modules.install' },
    installZip: { eventName: BACKEND_EVENTS.INSTALL_MODULE_FROM_ZIP, moduleName: 'moduleLoader', permission: 'modules.install' },
    checkUpdates: { eventName: BACKEND_EVENTS.CHECK_MODULE_UPDATES, moduleName: 'moduleLoader', permission: 'modules.list' },
    inspectUpdate: { eventName: BACKEND_EVENTS.INSPECT_MODULE_UPDATE, moduleName: 'moduleLoader', permission: 'modules.install' },
    installUpdate: { eventName: BACKEND_EVENTS.INSTALL_MODULE_UPDATE, moduleName: 'moduleLoader', permission: 'modules.install' },
    setUpdateSource: { eventName: BACKEND_EVENTS.SET_MODULE_UPDATE_SOURCE, moduleName: 'moduleLoader', permission: 'modules.install' },
    accessRequests: { eventName: BACKEND_EVENTS.LIST_PENDING_MODULE_ACCESS_REQUESTS, moduleName: 'moduleLoader', permission: 'modules.manageAccess' },
    resolveAccessRequest: { eventName: BACKEND_EVENTS.RESOLVE_MODULE_ACCESS_REQUEST, moduleName: 'moduleLoader', permission: 'modules.manageAccess' }
  }),
  apps: Object.freeze({
    list: { eventName: BACKEND_EVENTS.LIST_APPS, moduleName: 'appLoader', permission: 'apps.list' },
    get: { eventName: BACKEND_EVENTS.GET_APP, moduleName: 'appLoader', permission: 'apps.list' },
    builderList: { eventName: BACKEND_EVENTS.LIST_BUILDER_APPS, moduleName: 'appLoader', permission: 'builder.use' },
    launchInfo: { eventName: BACKEND_EVENTS.GET_APP_LAUNCH_INFO, moduleName: 'appLoader', permission: 'builder.use' },
    rescan: { eventName: BACKEND_EVENTS.RESCAN_APPS, moduleName: 'appLoader', permission: 'apps.rescan' }
  }),
  notifications: Object.freeze({
    recent: { eventName: BACKEND_EVENTS.GET_RECENT_NOTIFICATIONS, moduleName: 'notificationManager', permission: 'notifications.read' }
  }),
  serverLocations: Object.freeze({
    create: { eventName: BACKEND_EVENTS.ADD_SERVER_LOCATION, moduleName: 'serverManager', permission: 'serverManager.createLocation' },
    get: { eventName: BACKEND_EVENTS.GET_SERVER_LOCATION, moduleName: 'serverManager', permission: 'serverManager.viewLocations' },
    list: { eventName: BACKEND_EVENTS.LIST_SERVER_LOCATIONS, moduleName: 'serverManager', permission: 'serverManager.viewLocations' },
    update: { eventName: BACKEND_EVENTS.UPDATE_SERVER_LOCATION, moduleName: 'serverManager', permission: 'serverManager.editLocation' },
    delete: { eventName: BACKEND_EVENTS.DELETE_SERVER_LOCATION, moduleName: 'serverManager', permission: 'serverManager.deleteLocation' }
  }),
  shares: Object.freeze({
    create: { eventName: BACKEND_EVENTS.CREATE_SHARE_LINK, moduleName: 'shareManager', permission: 'share.create' },
    get: { eventName: BACKEND_EVENTS.GET_SHARE_DETAILS, moduleName: 'shareManager', permission: 'share.read' },
    revoke: { eventName: BACKEND_EVENTS.REVOKE_SHARE_LINK, moduleName: 'shareManager', permission: 'share.revoke' }
  }),
  unifiedSettings: Object.freeze({
    registerSchema: { eventName: BACKEND_EVENTS.REGISTER_MODULE_SETTINGS_SCHEMA, moduleName: 'unifiedSettings', permission: 'settings.unified.editSchemas' },
    registerSection: { eventName: BACKEND_EVENTS.REGISTER_SETTINGS_SECTION, moduleName: 'unifiedSettings', permission: 'settings.unified.editSchemas' },
    schema: { eventName: BACKEND_EVENTS.GET_MODULE_SETTINGS_SCHEMA, moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    schemas: { eventName: BACKEND_EVENTS.LIST_MODULE_SETTINGS_SCHEMAS, moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    modules: { eventName: BACKEND_EVENTS.LIST_REGISTERED_SETTINGS_MODULES, moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    get: { eventName: BACKEND_EVENTS.GET_MODULE_SETTING_VALUE, moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    list: { eventName: BACKEND_EVENTS.LIST_MODULE_SETTINGS, moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    bundle: { eventName: BACKEND_EVENTS.GET_MODULE_SETTINGS, moduleName: 'unifiedSettings', permission: 'settings.unified.viewSettings' },
    update: { eventName: BACKEND_EVENTS.UPDATE_MODULE_SETTING_VALUE, moduleName: 'unifiedSettings', permission: 'settings.unified.editSettings' },
    bulk: { eventName: BACKEND_EVENTS.UPDATE_MODULE_SETTINGS, moduleName: 'unifiedSettings', permission: 'settings.unified.editSettings' },
    delete: { eventName: BACKEND_EVENTS.DELETE_MODULE_SETTING, moduleName: 'unifiedSettings', permission: 'settings.unified.editSettings' }
  })
});

const publicActions = Object.freeze({
  settings: Object.freeze({
    public: { eventName: BACKEND_EVENTS.GET_PUBLIC_SETTINGS, moduleName: 'settingsManager' }
  })
});

const appContextReadActions = Object.freeze({
  settings: new Set(['public'])
});

module.exports = Object.freeze({
  name: 'platform',
  adminActions,
  publicActions,
  appContextReadActions
});
