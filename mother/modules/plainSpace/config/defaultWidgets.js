// mother/modules/plainSpace/config/defaultWidgets.js
// Core default widgets. Settings pages are rendered as dedicated panels, not widget layouts.

const { PUBLIC_LANE, ADMIN_LANE } = require('../plainSpaceService');

module.exports.DEFAULT_WIDGETS = [
  {
    widgetId: 'contentSummary',
    widgetType: ADMIN_LANE,
    label: 'Content Summary',
    content: '/ui/widgets/plainspace/admin/defaultwidgets/contentSummaryWidget.js',
    category: 'core',
    options: { height: 150, maxWidth: true, debug: true },
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
    content: '/ui/widgets/plainspace/admin/pageEditorWidgets/pageEditorWidget.js',
    category: 'core',
    options: { height: 150, thirdWidth: true },
    metadata: {
      apiEvents: ['getLayoutTemplateNames', 'updatePage']
    }
  },
  {
    widgetId: 'pageContent',
    widgetType: ADMIN_LANE,
    label: 'Page Content',
    content: '/ui/widgets/plainspace/admin/pageEditorWidgets/pageContentWidget.js',
    category: 'core',
    options: { height: 150, halfWidth: true },
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
    content: '/ui/widgets/plainspace/admin/mediaExplorerWidget.js',
    category: 'core',
    options: { width: 100, height: 620, overflow: true },
    metadata: {
      apiEvents: [
        'createLocalFolder',
        'createShareLink',
        'deleteLocalItem',
        'renameLocalItem',
        'listLocalFolder'
      ]
    }
  },
  {
    widgetId: 'layoutTemplates',
    widgetType: ADMIN_LANE,
    label: 'Layouts',
    content: '/ui/widgets/plainspace/admin/layoutTemplatesWidget.js',
    category: 'core',
    options: { height: 150, halfWidth: true },
    metadata: {
      apiEvents: [
        'getLayoutTemplateNames',
        'getPagesByLane',
        'saveLayoutTemplate'
      ]
    }
  },
  {
    widgetId: 'designerLayouts',
    widgetType: ADMIN_LANE,
    label: 'Design Studio',
    content: '/ui/widgets/plainspace/admin/designerLayoutsWidget.js',
    category: 'core',
    options: { height: 150, halfWidth: true },
    metadata: {
      apiEvents: [
        'designer.listDesigns'
      ]
    }
  },
  {
    widgetId: 'widgetList',
    widgetType: ADMIN_LANE,
    label: 'Widget List',
    content: '/ui/widgets/plainspace/admin/widgetListWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 160, overflow: true },
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
    content: '/ui/widgets/plainspace/admin/defaultwidgets/pageList/pageList.js',
    category: 'core',
    options: { halfWidth: true, height: 160, overflow: true },
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
    widgetId: 'collectionsList',
    widgetType: ADMIN_LANE,
    label: 'Collections List',
    content: '/ui/widgets/plainspace/admin/defaultwidgets/collectionsList/collectionsList.js',
    category: 'core',
    options: { halfWidth: true, height: 160, overflow: true },
    metadata: {
      apiEvents: [
        'getPagesByLane'
      ]
    }
  },
  {
    widgetId: 'pageStats',
    widgetType: ADMIN_LANE,
    label: 'Page Stats',
    content: '/ui/widgets/plainspace/admin/defaultwidgets/pageStats.js',
    options: { halfWidth: true, height: 160, overflow: true },
    category: 'core',
    metadata: { apiEvents: ['getPagesByLane'] }
  },
  {
    widgetId: 'pageEditorWidget',
    widgetType: ADMIN_LANE,
    label: 'Page Editor',
    content: '/ui/widgets/plainspace/admin/pageEditorWidgets/pageEditorWidget.js',
    category: 'core',
    metadata: { apiEvents: ['getLayoutTemplateNames', 'updatePage'] }
  },
  {
    widgetId: 'roadmapIntro',
    widgetType: ADMIN_LANE,
    label: 'Roadmap Intro',
    content: '/ui/widgets/plainspace/admin/roadmapIntroWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 160, overflow: true, maxWidth: true },
    metadata: { apiEvents: [] }
  },
  {
    widgetId: 'roadmapUpcoming',
    widgetType: ADMIN_LANE,
    label: 'Roadmap',
    content: '/ui/widgets/plainspace/admin/roadmapWidget.js',
    category: 'core',
    options: { halfWidth: true, height: 160, overflow: true },
    metadata: { apiEvents: [] }
  },
  {
    widgetId: 'dragbarDemo',
    widgetType: ADMIN_LANE,
    label: 'Drag Demo',
    content: '/ui/widgets/plainspace/admin/dragInfoWidget.js',
    category: 'core',
    options: { thirdWidth: true, height: 160 },
    metadata: { apiEvents: [] }
  },
  {
    widgetId: 'htmlBlock',
    widgetType: PUBLIC_LANE,
    label: 'HTML Block',
    content: '/ui/widgets/plainspace/public/basicwidgets/htmlWidget.js',
    category: 'basic',
    metadata: { apiEvents: [] }
  },
  {
    widgetId: 'textBox',
    widgetType: PUBLIC_LANE,
    label: 'Text Box',
    content: '/ui/widgets/plainspace/public/basicwidgets/textBoxWidget.js',
    category: 'basic',
    metadata: { apiEvents: [] }
  }
];
