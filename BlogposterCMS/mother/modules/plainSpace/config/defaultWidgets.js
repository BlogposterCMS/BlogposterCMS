// mother/modules/plainSpace/config/defaultWidgets.js
// Our must-have "default" widgets for demonstration purposes.

const { PUBLIC_LANE, ADMIN_LANE } = require('../plainSpaceService');

module.exports.DEFAULT_WIDGETS = [
  {
    widgetId: 'systemInfo',
    widgetType: ADMIN_LANE,
    label: 'System Info',
    content: '/assets/plainspace/widgets/admin/systemInfoWidget.js',
    category: 'core',
    options: { thirdWidth: true }
  },
  {
    widgetId: 'systemSettings',
    widgetType: ADMIN_LANE,
    label: 'System Settings',
    content: '/assets/plainspace/widgets/admin/systemSettingsWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'activityLog',
    widgetType: ADMIN_LANE,
    label: 'Activity Log',
    content: '/assets/plainspace/widgets/admin/activityLogWidget.js',
    category: 'core',
    options: { height: 50, overflow: true, halfWidth: true }
  },
  {
    widgetId: 'contentSummary',
    widgetType: ADMIN_LANE,
    label: 'Content Summary',
    content: '/assets/plainspace/widgets/admin/defaultwidgets/contentSummaryWidget.js',
    category: 'core',
    options: { thirdWidth: true }
  },
  {
    widgetId: 'pageEditor',
    widgetType: ADMIN_LANE,
    label: 'Page Editor',
    content: '/assets/plainspace/widgets/admin/pageEditorWidgets/pageEditorWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'mediaExplorer',
    widgetType: ADMIN_LANE,
    label: 'Media Explorer',
    content: '/assets/plainspace/widgets/admin/mediaExplorerWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 70, overflow: true }
  },
  {
    widgetId: 'modulesList',
    widgetType: ADMIN_LANE,
    label: 'Modules List',
    content: '/assets/plainspace/widgets/admin/modulesListWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true }
  },
  {
    widgetId: 'usersList',
    widgetType: ADMIN_LANE,
    label: 'Users List',
    content: '/assets/plainspace/widgets/admin/usersListWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true }
  },
  {
    widgetId: 'userEdit',
    widgetType: ADMIN_LANE,
    label: 'User Editor',
    content: '/assets/plainspace/widgets/admin/userEditWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'permissionsList',
    widgetType: ADMIN_LANE,
    label: 'Permissions List',
    content: '/assets/plainspace/widgets/admin/permissionsWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true }
  },
  {
    widgetId: 'layoutTemplates',
    widgetType: ADMIN_LANE,
    label: 'Layouts',
    content: '/assets/plainspace/widgets/admin/layoutTemplatesWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'themesList',
    widgetType: ADMIN_LANE,
    label: 'Themes List',
    content: '/assets/plainspace/widgets/admin/themesListWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'loginStrategies',
    widgetType: ADMIN_LANE,
    label: 'Login Strategies',
    content: '/assets/plainspace/widgets/admin/loginStrategiesWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'fontsList',
    widgetType: ADMIN_LANE,
    label: 'Font Providers',
    content: '/assets/plainspace/widgets/admin/fontsListWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'loginStrategyEdit',
    widgetType: ADMIN_LANE,
    label: 'Login Strategy Edit',
    content: '/assets/plainspace/widgets/admin/loginStrategyEditWidget.js',
    category: 'core',
    options: { halfWidth: true }
  },
  {
    widgetId: 'widgetList',
    widgetType: ADMIN_LANE,
    label: 'Widget List',
    content: '/assets/plainspace/widgets/admin/widgetListWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 60, overflow: true }
  },
  {
    widgetId: "htmlBlock",
    widgetType: PUBLIC_LANE,
    label: "HTML Block",
    content: "/assets/plainspace/widgets/public/basicwidgets/htmlWidget.js",
    category: "basic"
  },
  {
    widgetId: "textBox",
    widgetType: PUBLIC_LANE,
    label: "Text Box",
    content: "/assets/plainspace/widgets/public/basicwidgets/textBoxWidget.js",
    category: "basic"
  }
];
