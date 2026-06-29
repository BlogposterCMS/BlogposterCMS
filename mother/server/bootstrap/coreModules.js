'use strict';

function coreModulesForApp({ app, authModuleSecret }) {
  return [
    { name: 'databaseManager', path: 'mother/modules/databaseManager', extra: { app } },
    { name: 'notificationManager', path: 'mother/modules/notificationManager', extra: { app } },
    { name: 'settingsManager', path: 'mother/modules/settingsManager', extra: {} },
    { name: 'widgetManager', path: 'mother/modules/widgetManager', extra: {} },
    { name: 'appLoader', path: 'mother/modules/appLoader', extra: {} },
    { name: 'agentManager', path: 'mother/modules/agentManager', extra: {} },
    { name: 'agentAccess', path: 'mother/modules/agentAccess', extra: { authModuleSecret } },
    { name: 'designerManager', path: 'mother/modules/designerManager', extra: {} },
    { name: 'userManagement', path: 'mother/modules/userManagement', extra: { app } },
    { name: 'contentEngine', path: 'mother/modules/contentEngine', extra: {} },
    { name: 'metadataManager', path: 'mother/modules/metadataManager', extra: {} },
    { name: 'workflowManager', path: 'mother/modules/workflowManager', extra: {} },
    { name: 'commentsManager', path: 'mother/modules/commentsManager', extra: {} },
    { name: 'navigationManager', path: 'mother/modules/navigationManager', extra: {} },
    { name: 'seoManager', path: 'mother/modules/seoManager', extra: {} },
    { name: 'searchManager', path: 'mother/modules/searchManager', extra: {} },
    { name: 'redirectManager', path: 'mother/modules/redirectManager', extra: {} },
    { name: 'pagesManager', path: 'mother/modules/pagesManager', extra: {} },
    { name: 'dependencyLoader', path: 'mother/modules/dependencyLoader', extra: {} },
    { name: 'requestManager', path: 'mother/modules/requestManager', extra: {} },
    { name: 'unifiedSettings', path: 'mother/modules/unifiedSettings', extra: { app } },
    { name: 'serverManager', path: 'mother/modules/serverManager', extra: { app } },
    { name: 'mediaManager', path: 'mother/modules/mediaManager', extra: { app } },
    { name: 'shareManager', path: 'mother/modules/shareManager', extra: { app } },
    { name: 'translationManager', path: 'mother/modules/translationManager', extra: {} },
    { name: 'plainSpace', path: 'mother/modules/plainSpace', extra: { app } },
    { name: 'importer', path: 'mother/modules/importer', extra: {} },
    { name: 'exportManager', path: 'mother/modules/exportManager', extra: {} },
    { name: 'themeManager', path: 'mother/modules/themeManager', extra: {} },
    { name: 'runtimeManager', path: 'mother/modules/runtimeManager', extra: { app } },
    { name: 'fontsManager', path: 'mother/modules/fontsManager', extra: {} }
  ];
}

module.exports = {
  coreModulesForApp
};
