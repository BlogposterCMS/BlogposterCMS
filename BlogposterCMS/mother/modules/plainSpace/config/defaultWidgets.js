// mother/modules/plainSpace/config/defaultWidgets.js
// Our must-have "default" widgets for demonstration purposes.

const { PUBLIC_LANE, ADMIN_LANE } = require('../plainSpaceService');

module.exports.DEFAULT_WIDGETS = [
  {
    widgetId: 'systemInfo',
    widgetType: ADMIN_LANE,
    label: 'System Info',
    content: '/plainspace/widgets/admin/systemInfoWidget.js',
    category: 'core',
    options: { thirdWidth: true },
    metadata: { apiEvents: [] }
  },
  {
    widgetId: 'systemSettings',
    widgetType: ADMIN_LANE,
    label: 'System Settings',
    content: '/plainspace/widgets/admin/systemSettingsWidget.js',
    category: 'core',
    options: { halfWidth: true },
    metadata: {
      apiEvents: [
        'getSetting',
        'getAllPages',
        'setSetting',
        'openMediaExplorer'
      ]
    }
  },
  {
    widgetId: 'activityLog',
    widgetType: ADMIN_LANE,
    label: 'Activity Log',
    content: '/plainspace/widgets/admin/activityLogWidget.js',
    category: 'core',
    options: { height: 50, overflow: true, halfWidth: true },
    metadata: { apiEvents: [] }
  },

  {
    widgetId: 'contentSummary',
    widgetType: ADMIN_LANE,
    label: 'Content Summary',
    content: '/plainspace/widgets/admin/defaultwidgets/contentSummaryWidget.js',
    category: 'core',
    options: { maxWidth: true },
    metadata: {
      apiEvents: [
        'getLayoutTemplateNames',
        'getAllPages',
        'getLayoutTemplate',
        'saveLayoutTemplate',
        'setGlobalLayoutTemplate',
        'deleteLayoutTemplate'
      ]
    }
  },
  {
    widgetId: 'pageEditor',
    widgetType: ADMIN_LANE,
    label: 'Page Editor',
    content: '/plainspace/widgets/admin/pageEditorWidgets/pageEditorWidget.js',
    category: 'core',
    options: { thirdWidth: true },
    metadata: {
      apiEvents: ['getLayoutTemplateNames', 'updatePage']
    }
  },
  {
    widgetId: 'pageContent',
    widgetType: ADMIN_LANE,
    label: 'Page Content',
    content: '/plainspace/widgets/admin/pageEditorWidgets/pageContentWidget.js',
    category: 'core',
    options: { halfWidth: true },
    metadata: {
      apiEvents: [
        'listBuilderApps',
        'updatePage',
        'getLayoutTemplateNames',
        'createLocalFolder',
        'listLocalFolder',
        'uploadFileToFolder'
      ]
    }
  },
  {
    widgetId: 'mediaExplorer',
    widgetType: ADMIN_LANE,
    label: 'Media Explorer',
    content: '/plainspace/widgets/admin/mediaExplorerWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 70, overflow: true },
    metadata: {
      apiEvents: [
        'createLocalFolder',
        'createShareLink',
        'listLocalFolder'
      ]
    }
  },
  {
    widgetId: 'modulesList',
    widgetType: ADMIN_LANE,
    label: 'Modules List',
    content: '/plainspace/widgets/admin/modulesListWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true },
    metadata: {
      apiEvents: [
        'getModuleRegistry',
        'listSystemModules',
        'installModuleFromZip',
        'activateModuleInRegistry',
        'deactivateModuleInRegistry'
      ]
    }
  },
  {
    widgetId: 'usersList',
    widgetType: ADMIN_LANE,
    label: 'Users List',
    content: '/plainspace/widgets/admin/usersListWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true },
    metadata: {
      apiEvents: [
        'getAllUsers',
        'getAllRoles',
        'createUser',
        'createRole',
        'updateRole',
        'deleteRole'
      ]
    }
  },
  {
    widgetId: 'userEdit',
    widgetType: ADMIN_LANE,
    label: 'User Editor',
    content: '/plainspace/widgets/admin/userEditWidget.js',
    category: 'core',
    options: { halfWidth: true },
    metadata: {
      apiEvents: [
        'getUserDetailsById',
        'deleteUser',
        'updateUserProfile'
      ]
    }
  },
  {
    widgetId: 'permissionsList',
    widgetType: ADMIN_LANE,
    label: 'Permissions List',
    content: '/plainspace/widgets/admin/permissionsWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true },
    metadata: {
      apiEvents: [
        'getAllPermissions',
        'getAllRoles',
        'createPermission',
        'createRole',
        'updateRole',
        'deleteRole'
      ]
    }
  },
  {
    widgetId: 'layoutTemplates',
    widgetType: ADMIN_LANE,
    label: 'Layouts',
    content: '/plainspace/widgets/admin/layoutTemplatesWidget.js',
    category: 'core',
    options: { halfWidth: true },
    metadata: {
      apiEvents: [
        'getLayoutTemplateNames',
        'getPagesByLane',
        'saveLayoutTemplate'
      ]
    }
  },
  {
    widgetId: 'loginStrategies',
    widgetType: ADMIN_LANE,
    label: 'Login Strategies',
    content: '/plainspace/widgets/admin/loginStrategiesWidget.js',
    category: 'core',
    options: { halfWidth: true },
    metadata: {
      apiEvents: ['listLoginStrategies', 'setLoginStrategyEnabled']
    }
  },
  {
    widgetId: 'fontsList',
    widgetType: ADMIN_LANE,
    label: 'Font Providers',
    content: '/plainspace/widgets/admin/fontsListWidget.js',
    category: 'core',
    options: { halfWidth: true },
    metadata: {
      apiEvents: ['listFontProviders', 'setFontProviderEnabled']
    }
  },
  {
    widgetId: 'loginStrategyEdit',
    widgetType: ADMIN_LANE,
    label: 'Login Strategy Edit',
    content: '/plainspace/widgets/admin/loginStrategyEditWidget.js',
    category: 'core',
    options: { halfWidth: true },
    metadata: {
      apiEvents: ['getSetting', 'setSetting']
    }
  },
  {
    widgetId: 'widgetList',
    widgetType: ADMIN_LANE,
    label: 'Widget List',
    content: '/plainspace/widgets/admin/widgetListWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true },
    metadata: {
      apiEvents: [
        'widget.registry.request.v1',
        'getPagesByLane',
        'getLayoutForViewport'
      ]
    }
  },
  {
    widgetId: 'pageList',
    widgetType: ADMIN_LANE,
    label: 'Page List',
    content: '/plainspace/widgets/admin/defaultwidgets/pageList.js',
    category: 'core',
    metadata: {
      apiEvents: [
        'getPagesByLane',
        'createPage',
        'updatePage',
        'setAsStart',
        'deletePage'
      ]
    }
  },
  {
    widgetId: 'pageStats',
    widgetType: ADMIN_LANE,
    label: 'Page Stats',
    content: '/plainspace/widgets/admin/defaultwidgets/pageStats.js',
    category: 'core',
    metadata: { apiEvents: ['getPagesByLane'] }
  },
  {
    widgetId: 'pageEditorWidget',
    widgetType: ADMIN_LANE,
    label: 'Page Editor',
    content: '/plainspace/widgets/admin/pageEditorWidgets/pageEditorWidget.js',
    category: 'core',
    metadata: { apiEvents: ['getLayoutTemplateNames', 'updatePage'] }
  },
  {
    widgetId: "htmlBlock",
    widgetType: PUBLIC_LANE,
    label: "HTML Block",
    content: "/plainspace/widgets/public/basicwidgets/htmlWidget.js",
    category: "basic",
    metadata: { apiEvents: [] }
  },
  {
    widgetId: "textBox",
    widgetType: PUBLIC_LANE,
    label: "Text Box",
    content: "/plainspace/widgets/public/basicwidgets/textBoxWidget.js",
    category: "basic",
    metadata: { apiEvents: [] }
  }
];
