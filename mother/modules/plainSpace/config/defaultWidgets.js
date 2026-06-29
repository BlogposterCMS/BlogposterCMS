// mother/modules/plainSpace/config/defaultWidgets.js
// Core default widgets. Settings pages are rendered as dedicated panels, not widget layouts.

const { PUBLIC_LANE, ADMIN_LANE } = require('../plainSpaceService');

const SLOT_DEFINITIONS = Object.freeze({
  third: { name: 'third', minCols: 4, maxCols: 4 },
  half: { name: 'half', minCols: 6, maxCols: 6 },
  twoThird: { name: 'twoThird', minCols: 8, maxCols: 8 },
  full: { name: 'full', minCols: 12, maxCols: 12 },
  page: { name: 'page', minCols: 12, maxCols: 12, exclusive: true }
});

const BREAKPOINTS = Object.freeze({
  thirdHalfFull: {
    mobile: ['full'],
    tablet: ['half', 'full'],
    desktop: ['third', 'half', 'full']
  },
  halfFull: {
    mobile: ['full'],
    tablet: ['half', 'full'],
    desktop: ['half', 'full']
  },
  halfTwoThirdFull: {
    mobile: ['full'],
    tablet: ['full'],
    desktop: ['half', 'twoThird', 'full']
  },
  twoThirdFull: {
    mobile: ['full'],
    tablet: ['full'],
    desktop: ['twoThird', 'full']
  },
  fullOnly: {
    mobile: ['full'],
    tablet: ['full'],
    desktop: ['full']
  },
  pageOnly: {
    mobile: ['page'],
    tablet: ['page'],
    desktop: ['page']
  }
});

const HEIGHT_POLICIES = Object.freeze({
  third: {
    minHeight: { mobile: 120, tablet: 140, desktop: 160 }
  },
  half: {
    minHeight: { mobile: 160, tablet: 180, desktop: 220 }
  },
  twoThird: {
    minHeight: { mobile: 220, tablet: 260, desktop: 320 }
  },
  full: {
    minHeight: { mobile: 180, tablet: 220, desktop: 280 }
  },
  page: {
    minHeight: {
      mobile: 'calc(100dvh - 120px)',
      tablet: 'calc(100dvh - 140px)',
      desktop: 'calc(100dvh - 160px)'
    },
    height: {
      mobile: 'calc(100dvh - 120px)',
      tablet: 'calc(100dvh - 140px)',
      desktop: 'calc(100dvh - 160px)'
    }
  }
});

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function dashboardHeightPolicy(defaultSlot, heightMode, overrides = {}) {
  const policy = {
    mode: heightMode,
    ...clonePlainObject(HEIGHT_POLICIES[defaultSlot] || HEIGHT_POLICIES.full),
    ...clonePlainObject(overrides)
  };
  if (!policy.minHeight && policy.min) {
    policy.minHeight = policy.min;
  }
  return policy;
}

function dashboardLayout(defaultSlot, slotNames, breakpoints, heightMode = 'dynamic', height = {}) {
  return {
    defaultSlot,
    supportedSlots: slotNames.map(name => SLOT_DEFINITIONS[name]),
    breakpoints,
    heightMode,
    height: dashboardHeightPolicy(defaultSlot, heightMode, height)
  };
}

module.exports.DEFAULT_WIDGETS = [
  {
    widgetId: 'contentSummary',
    widgetType: ADMIN_LANE,
    label: 'Content Summary',
    content: '/ui/widgets/plainspace/admin/defaultwidgets/contentSummaryWidget.js',
    category: 'core',
    metadata: {
      layout: dashboardLayout('full', ['full'], BREAKPOINTS.fullOnly),
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
    metadata: {
      aliasOf: 'pageEditorWidget',
      hiddenFromCatalog: true,
      deprecated: true,
      layout: dashboardLayout('third', ['third', 'half', 'full'], BREAKPOINTS.thirdHalfFull),
      apiEvents: ['getLayoutTemplateNames', 'updatePage']
    }
  },
  {
    widgetId: 'pageContent',
    widgetType: ADMIN_LANE,
    label: 'Page Content',
    content: '/ui/widgets/plainspace/admin/pageEditorWidgets/pageContentWidget.js',
    category: 'core',
    metadata: {
      layout: dashboardLayout('twoThird', ['twoThird', 'full'], BREAKPOINTS.twoThirdFull),
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
    metadata: {
      layout: dashboardLayout('page', ['page'], BREAKPOINTS.pageOnly, 'scroll'),
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
    metadata: {
      layout: dashboardLayout('half', ['half', 'full'], BREAKPOINTS.halfFull),
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
    metadata: {
      layout: dashboardLayout('half', ['half', 'full'], BREAKPOINTS.halfFull),
      apiEvents: [
        'designer.listDesigns'
      ]
    }
  },
  {
    widgetId: 'navigationStudio',
    widgetType: ADMIN_LANE,
    label: 'Navigation Studio',
    content: '/ui/widgets/plainspace/admin/navigationStudioWidget.js',
    category: 'core',
    metadata: {
      layout: dashboardLayout('page', ['page'], BREAKPOINTS.pageOnly, 'scroll'),
      apiEvents: [
        'listNavigationLocations',
        'registerNavigationLocation',
        'listNavigationMenus',
        'upsertNavigationMenu',
        'getNavigationTree',
        'addNavigationMenuItem',
        'updateNavigationMenuItem',
        'deleteNavigationMenuItem',
        'getPagesByLane',
        'designer.listDesigns',
        'designer.saveDesign'
      ],
      icon: 'menu'
    }
  },
  {
    widgetId: 'widgetList',
    widgetType: ADMIN_LANE,
    label: 'Widget List',
    content: '/ui/widgets/plainspace/admin/widgetListWidget.js',
    category: 'core',
    metadata: {
      layout: dashboardLayout('full', ['full'], BREAKPOINTS.fullOnly, 'scroll'),
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
    metadata: {
      layout: dashboardLayout('twoThird', ['twoThird', 'full'], BREAKPOINTS.twoThirdFull, 'scroll'),
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
    metadata: {
      layout: dashboardLayout('full', ['full'], BREAKPOINTS.fullOnly, 'scroll'),
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
    category: 'core',
    metadata: {
      layout: dashboardLayout('third', ['third', 'half', 'full'], BREAKPOINTS.thirdHalfFull),
      apiEvents: ['getPagesByLane']
    }
  },
  {
    widgetId: 'pageEditorWidget',
    widgetType: ADMIN_LANE,
    label: 'Page Editor',
    content: '/ui/widgets/plainspace/admin/pageEditorWidgets/pageEditorWidget.js',
    category: 'core',
    metadata: {
      layout: dashboardLayout('third', ['third', 'half', 'full'], BREAKPOINTS.thirdHalfFull),
      apiEvents: ['getLayoutTemplateNames', 'updatePage']
    }
  },
  {
    widgetId: 'roadmapIntro',
    widgetType: ADMIN_LANE,
    label: 'Roadmap Intro',
    content: '/ui/widgets/plainspace/admin/roadmapIntroWidget.js',
    category: 'core',
    metadata: {
      layout: dashboardLayout('half', ['half', 'full'], BREAKPOINTS.halfFull),
      apiEvents: []
    }
  },
  {
    widgetId: 'roadmapUpcoming',
    widgetType: ADMIN_LANE,
    label: 'Roadmap',
    content: '/ui/widgets/plainspace/admin/roadmapWidget.js',
    category: 'core',
    metadata: {
      layout: dashboardLayout('half', ['half', 'full'], BREAKPOINTS.halfFull),
      apiEvents: []
    }
  },
  {
    widgetId: 'dragbarDemo',
    widgetType: ADMIN_LANE,
    label: 'Drag Demo',
    content: '/ui/widgets/plainspace/admin/dragInfoWidget.js',
    category: 'core',
    metadata: {
      layout: dashboardLayout('third', ['third', 'half', 'full'], BREAKPOINTS.thirdHalfFull),
      apiEvents: []
    }
  },
  {
    widgetId: 'htmlBlock',
    widgetType: PUBLIC_LANE,
    label: 'HTML Block',
    content: '/ui/widgets/plainspace/public/basicwidgets/htmlWidget.js',
    category: 'basic',
    metadata: {
      advanced: true,
      hiddenFromCatalog: true,
      layout: dashboardLayout('full', ['full'], BREAKPOINTS.fullOnly),
      apiEvents: []
    }
  },
  {
    widgetId: 'textBox',
    widgetType: PUBLIC_LANE,
    label: 'Rich Text',
    content: '/ui/widgets/plainspace/public/basicwidgets/textBoxWidget.js',
    category: 'authoring',
    metadata: {
      layout: dashboardLayout('third', ['third', 'half', 'twoThird', 'full'], {
        mobile: ['full'],
        tablet: ['half', 'full'],
        desktop: ['third', 'half', 'twoThird', 'full']
      }),
      apiEvents: [],
      icon: 'type',
      defaults: {
        heading: 'New headline',
        body: 'Write your copy'
      }
    }
  },
  {
    widgetId: 'mediaBlock',
    widgetType: PUBLIC_LANE,
    label: 'Media',
    content: '/ui/widgets/plainspace/public/basicwidgets/mediaWidget.js',
    category: 'authoring',
    metadata: {
      layout: dashboardLayout('half', ['half', 'twoThird', 'full'], BREAKPOINTS.halfTwoThirdFull),
      apiEvents: [],
      icon: 'image',
      defaults: {
        aspectRatio: '16/9',
        fit: 'cover'
      }
    }
  },
  {
    widgetId: 'buttonLink',
    widgetType: PUBLIC_LANE,
    label: 'Button / Link',
    content: '/ui/widgets/plainspace/public/basicwidgets/buttonWidget.js',
    category: 'authoring',
    metadata: {
      layout: dashboardLayout('third', ['third', 'half', 'full'], BREAKPOINTS.thirdHalfFull),
      apiEvents: [],
      icon: 'mouse-pointer-click',
      defaults: {
        label: 'Start now',
        href: '#',
        variant: 'primary'
      }
    }
  },
  {
    widgetId: 'navigationMenu',
    widgetType: PUBLIC_LANE,
    label: 'Menu',
    content: '/ui/widgets/plainspace/public/basicwidgets/navigationMenuWidget.js',
    category: 'navigation',
    metadata: {
      layout: dashboardLayout('full', ['full'], BREAKPOINTS.fullOnly),
      apiEvents: [],
      icon: 'menu',
      defaults: {
        locationKey: 'primary',
        orientation: 'horizontal',
        maxDepth: 2
      }
    }
  },
  {
    widgetId: 'breadcrumb',
    widgetType: PUBLIC_LANE,
    label: 'Breadcrumb',
    content: '/ui/widgets/plainspace/public/basicwidgets/breadcrumbWidget.js',
    category: 'navigation',
    metadata: {
      layout: dashboardLayout('full', ['full'], BREAKPOINTS.fullOnly),
      apiEvents: [],
      icon: 'chevrons-right',
      defaults: {
        homeLabel: 'Home',
        separator: '/'
      }
    }
  },
  {
    widgetId: 'gallery',
    widgetType: PUBLIC_LANE,
    label: 'Gallery',
    content: '/ui/widgets/plainspace/public/basicwidgets/galleryWidget.js',
    category: 'media',
    metadata: {
      layout: dashboardLayout('full', ['half', 'twoThird', 'full'], BREAKPOINTS.halfTwoThirdFull),
      apiEvents: [],
      icon: 'images',
      defaults: {
        mode: 'grid',
        columns: 3,
        rows: 0,
        aspectRatio: 'square',
        heightMode: 'ratio',
        fit: 'cover',
        focalX: 50,
        focalY: 50,
        sliderAnimation: 'slide',
        animationSpeed: 360,
        autoplay: false,
        autoplayDelay: 4000,
        loop: true,
        showControls: true,
        showDots: true,
        slidesToShow: 1,
        slidesToScroll: 1
      }
    }
  }
];
