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
      widgets: ['roadmapIntro', 'roadmapUpcoming', 'dragbarDemo'],
      workspace: 'home'
    }
  },
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
      widgets: ['contentSummary'],
      actionButton: {
        icon: '/assets/icons/plus.svg',
        action: 'createNewLayout'
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
      widgets: ['pageList', 'pageStats']
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
      widgets: ['mediaExplorer']
    }
  },
  {
    title: 'Collections',
    slug: 'collections',
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
      widgets: ['collectionsList']
    }
  },
  {
    title: 'Widgets',
    slug: 'widgets',
    parentSlug: 'content',
    lane: 'admin',
    weight: 30,
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/puzzle.svg',
      widgets: ['widgetList']
    }
  },
  {
    title: 'Menu',
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
      widgets: []
    }
  },
  {
    title: 'Layouts',
    slug: 'layouts',
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
      widgets: ['layoutTemplates']
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
      widgets: ['designerLayouts']
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
      widgets: ['pageEditorWidget', 'pageContent']

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
