// mother/modules/pagesManager/config/defaultWidgets.js
// Default widgets seeded by pagesManager.

const ADMIN_LANE = 'admin';

module.exports.DEFAULT_WIDGETS = [
  {
    widgetId: 'pageList',
    widgetType: ADMIN_LANE,
    label: 'Page List',
    content: '/assets/plainspace/widgets/admin/defaultwidgets/pageList.js',
    category: 'core'
  },
  {
    widgetId: 'pageStats',
    widgetType: ADMIN_LANE,
    label: 'Page Stats',
    content: '/assets/plainspace/widgets/admin/defaultwidgets/pageStats.js',
    category: 'core'
  },
  {
    widgetId: 'pageEditorWidget',
    widgetType: ADMIN_LANE,
    label: 'Page Editor',
    content: '/assets/plainspace/widgets/admin/pageEditorWidgets/pageEditorWidget.js',
    category: 'core'
  },
];
