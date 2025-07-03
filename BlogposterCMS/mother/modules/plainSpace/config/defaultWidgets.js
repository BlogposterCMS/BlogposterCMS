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
    options: { thirdWidth: true }
  },
  {
    widgetId: 'systemSettings',
    widgetType: ADMIN_LANE,
    label: 'System Settings',
    content: '/plainspace/widgets/admin/systemSettingsWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'activityLog',
    widgetType: ADMIN_LANE,
    label: 'Activity Log',
    content: '/plainspace/widgets/admin/activityLogWidget.js',
    category: 'core',
    options: { height: 50, overflow: true, halfWidth: true }
  },
  {
    widgetId: 'contentSummary',
    widgetType: ADMIN_LANE,
    label: 'Content Summary',
    content: '/plainspace/widgets/admin/defaultwidgets/contentSummaryWidget.js',
    category: 'core',
    options: { maxWidth: true }
  },
  {
    widgetId: 'pageEditor',
    widgetType: ADMIN_LANE,
    label: 'Page Editor',
    content: '/plainspace/widgets/admin/pageEditorWidgets/pageEditorWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'pageContent',
    widgetType: ADMIN_LANE,
    label: 'Page Content',
    content: '/plainspace/widgets/admin/pageEditorWidgets/pageContentWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'mediaExplorer',
    widgetType: ADMIN_LANE,
    label: 'Media Explorer',
    content: '/plainspace/widgets/admin/mediaExplorerWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 70, overflow: true }
  },
  {
    widgetId: 'modulesList',
    widgetType: ADMIN_LANE,
    label: 'Modules List',
    content: '/plainspace/widgets/admin/modulesListWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true }
  },
  {
    widgetId: 'usersList',
    widgetType: ADMIN_LANE,
    label: 'Users List',
    content: '/plainspace/widgets/admin/usersListWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true }
  },
  {
    widgetId: 'userEdit',
    widgetType: ADMIN_LANE,
    label: 'User Editor',
    content: '/plainspace/widgets/admin/userEditWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'permissionsList',
    widgetType: ADMIN_LANE,
    label: 'Permissions List',
    content: '/plainspace/widgets/admin/permissionsWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true }
  },
  {
    widgetId: 'layoutTemplates',
    widgetType: ADMIN_LANE,
    label: 'Layouts',
    content: '/plainspace/widgets/admin/layoutTemplatesWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'loginStrategies',
    widgetType: ADMIN_LANE,
    label: 'Login Strategies',
    content: '/plainspace/widgets/admin/loginStrategiesWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'fontsList',
    widgetType: ADMIN_LANE,
    label: 'Font Providers',
    content: '/plainspace/widgets/admin/fontsListWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'loginStrategyEdit',
    widgetType: ADMIN_LANE,
    label: 'Login Strategy Edit',
    content: '/plainspace/widgets/admin/loginStrategyEditWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'widgetList',
    widgetType: ADMIN_LANE,
    label: 'Widget List',
    content: '/plainspace/widgets/admin/widgetListWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true }
  },
   {
    widgetId: 'pageList',
    widgetType: ADMIN_LANE,
    label: 'Page List',
    content: '/plainspace/widgets/admin/defaultwidgets/pageList.js',
    category: 'core'
  },
  {
    widgetId: 'pageStats',
    widgetType: ADMIN_LANE,
    label: 'Page Stats',
    content: '/plainspace/widgets/admin/defaultwidgets/pageStats.js',
    category: 'core'
  },
  {
    widgetId: 'pageEditorWidget',
    widgetType: ADMIN_LANE,
    label: 'Page Editor',
    content: '/plainspace/widgets/admin/pageEditorWidgets/pageEditorWidget.js',
    category: 'core'
  },
  {
    widgetId: "htmlBlock",
    widgetType: PUBLIC_LANE,
    label: "HTML Block",
    content: "/plainspace/widgets/public/basicwidgets/htmlWidget.js",
    category: "basic"
  },
  {
    widgetId: "textBox",
    widgetType: PUBLIC_LANE,
    label: "Text Box",
    content: "/plainspace/widgets/public/basicwidgets/textBoxWidget.js",
    category: "basic"
  }
];
