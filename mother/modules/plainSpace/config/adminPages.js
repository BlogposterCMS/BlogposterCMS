// mother/modules/plainSpace/config/adminPages.js
// All admin pages: Home, Page Management and Design Studio.

module.exports.ADMIN_PAGES = [
  {
    title: 'Home',
    slug: 'home',
    lane: 'admin',
    weight: 10,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'empty-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/house.svg',
      widgets: ['homeWebsite', 'homeOperations'],
      retiredWidgets: ['roadmapUpcoming', 'dragbarDemo', 'roadmapIntro', 'pageStats', 'contentSummary'],
      widgetSlots: {
        homeWebsite: 'twoThird',
        homeOperations: 'third'
      },
      workspace: 'home'
    }
  },
  {
    title: 'Analytics',
    slug: 'analytics',
    lane: 'admin',
    weight: 15,
    config: {
      layout: { header: 'top-header', sidebar: 'default-sidebar', inheritsLayout: true },
      icon: '/assets/icons/layout-dashboard.svg',
      seedOnce: true,
      migrateFixedDashboard: true,
      widgets: ['analyticsDashboard'],
      widgetSlots: { analyticsDashboard: 'full' },
      workspace: 'analytics'
    }
  },
  ...[
    ['Website', 'website', 'analyticsWebsite'],
    ['Devices & Software', 'devices', 'analyticsDevices'],
    ['System Activity', 'system', 'analyticsSystem']
  ].map(([title, slug, widget]) => ({
    title, slug, parentSlug: 'analytics', lane: 'admin',
    weight: { website: 10, devices: 20, system: 30 }[slug],
    config: {
      seedOnce: true,
      layout: { header: 'top-header', sidebar: 'default-sidebar', inheritsLayout: true },
      icon: '/assets/icons/layout-dashboard.svg',
      widgets: [widget], widgetSlots: { [widget]: 'full' }
    }
  })),
  {
    title: 'Content',
    slug: 'content',
    lane: 'admin',
    weight: 20,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/file-box.svg',
      // Content should open on real page management instead of a design-only summary.
      dashboardLayout: 'fixed',
      widgets: ['pageList'],
      widgetSlots: {
        pageList: 'page'
      },
      actionButton: {
        icon: '/assets/icons/plus.svg',
        action: 'createNewPage'
      },
      workspace: 'content'
    }
  },
  {
    title: 'Page Management',
    slug: 'pages',
    parentSlug: 'content',
    lane: 'admin',
    weight: 10,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/file-text.svg',
      actionButton: {
        icon: '/assets/icons/plus.svg',
        action: 'createNewPage'
      },
      dashboardLayout: 'fixed',
      widgets: ['pageList'],
      widgetSlots: {
        pageList: 'page'
      }
    }
  },
  {
    title: 'Media',
    slug: 'media',
    parentSlug: 'content',
    lane: 'admin',
    weight: 20,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/image.svg',
      dashboardLayout: 'fixed',
      widgets: ['mediaExplorer'],
      widgetSlots: {
        mediaExplorer: 'page'
      }
    }
  },
  {
    title: 'Collections',
    slug: 'collections',
    // Collections are a filtered hierarchy in Page Manager, not another editor.
    retired: true,
    parentSlug: 'content',
    lane: 'admin',
    weight: 25,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/folder-tree.svg',
      widgets: ['collectionsList'],
      widgetSlots: {
        collectionsList: 'full'
      }
    }
  },
  {
    title: 'Navigation Studio',
    slug: 'menu',
    parentSlug: 'content',
    lane: 'admin',
    weight: 40,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/menu.svg',
      widgets: ['navigationStudio'],
      dashboardLayout: 'fixed',
      widgetSlots: {
        navigationStudio: 'page'
      }
    }
  },
  {
    title: 'Layouts',
    slug: 'layouts',
    // Retire the old core entry on upgrades without touching saved templates.
    retired: true,
    parentSlug: 'content',
    lane: 'admin',
    weight: 50,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/layout-dashboard.svg',
      widgets: ['layoutTemplates'],
      widgetSlots: {
        layoutTemplates: 'page'
      }
    }
  },
  {
    title: 'Design Studio',
    slug: 'designer-layouts',
    parentSlug: 'content',
    lane: 'admin',
    weight: 60,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/layers.svg',
      dashboardLayout: 'fixed',
      widgets: ['designerLayouts'],
      widgetSlots: {
        designerLayouts: 'page'
      }
    }
  },
  {
    title: 'Page Editor',
    slug: 'edit',
    parentSlug: 'pages',
    lane: 'admin',
    weight: 10,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'empty-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/file-pen-line.svg',
      dashboardLayout: 'fixed',
      widgets: ['pageEditorWidget'],
      widgetSlots: {
        pageEditorWidget: 'page'
      }

    }
  },
  {
    title: 'Settings',
    slug: 'settings',
    lane: 'admin',
    weight: 30,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/settings.svg',
      widgets: [],
      workspace: 'settings'
    }
  },
  {
    title: 'General',
    slug: 'general',
    parentSlug: 'settings',
    lane: 'admin',
    weight: 10,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/server.svg',
      widgets: []
    }
  },
  {
    title: 'Design',
    slug: 'design',
    parentSlug: 'settings',
    lane: 'admin',
    weight: 20,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/type.svg',
      widgets: []
    }
  },
  {
    title: 'UI Kit',
    slug: 'ui-kit',
    parentSlug: 'settings',
    lane: 'admin',
    weight: 25,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/component.svg',
      widgets: []
    }
  },
  {
    title: 'SEO',
    slug: 'seo',
    parentSlug: 'settings',
    lane: 'admin',
    weight: 30,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/file-text.svg',
      widgets: []
    }
  },
  {
    title: 'Security',
    slug: 'security',
    parentSlug: 'settings',
    lane: 'admin',
    weight: 40,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/shield-check.svg',
      widgets: []
    }
  },
  {
    title: 'Modules',
    slug: 'modules',
    parentSlug: 'settings',
    lane: 'admin',
    weight: 50,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/package.svg',
      widgets: []
    }
  },
  {
    title: 'Widgets',
    slug: 'widgets',
    // Preserve the existing page and its saved state when moving the core tool.
    migrateFromSlug: 'content/widgets',
    parentSlug: 'settings',
    lane: 'admin',
    weight: 52,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/puzzle.svg',
      dashboardLayout: 'fixed',
      widgets: ['widgetList'],
      widgetSlots: {
        widgetList: 'page'
      }
    }
  },
  {
    title: 'Update Center',
    slug: 'updates',
    parentSlug: 'settings',
    lane: 'admin',
    weight: 55,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/refresh-cw.svg',
      widgets: []
    }
  },
  {
    title: 'Users & Access',
    slug: 'users-access',
    parentSlug: 'settings',
    lane: 'admin',
    weight: 60,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/users.svg',
      widgets: []
    }
  },

  {
    title: 'Import / Export',
    // Module-owned tools have no core operations on this placeholder page.
    retired: true,
    slug: 'import-export',
    parentSlug: 'settings',
    lane: 'admin',
    weight: 70,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/arrow-left-right.svg',
      widgets: []
    }
  }
];
