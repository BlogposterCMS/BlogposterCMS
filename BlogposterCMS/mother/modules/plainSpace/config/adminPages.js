// mother/modules/plainSpace/config/adminPages.js
// All admin pages: Home, Page Management, Page Builder. Minimalism is dead, flexibility wins.

module.exports.ADMIN_PAGES = [
  {
    title: 'Home',
    slug: 'home',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'empty-sidebar',
        inheritsLayout: true
      },
      widgets: ['systemInfo', 'activityLog']
    }
  },
  {
    title: 'Content',
    slug: 'content',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      widgets: ['contentSummary']
    }
  },
  {
    title: 'Page Management',
    slug: 'pages',
    parentSlug: 'content',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      actionButton: {
        icon: '/assets/icons/plus.svg',
        action: 'createNewPage'
      },
      widgets: ['pageList', 'pageStats']
    }
  },
  {
    title: 'Page Builder',
    slug: 'builder',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'sidebar-builder', // Special sidebar with draggable widget icons
        inheritsLayout: false
      },
      widgetLane: 'public',  // <-- Show ALL public widgets in the builder, not preselected
      widgets: []            // <-- No preselection, empty array: builder picks dynamically
    }
  },
  {
    title: 'Media',
    slug: 'media',
    parentSlug: 'content',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      widgets: ['mediaExplorer']
    }
  },
  {
    title: 'Widgets',
    slug: 'widgets',
    parentSlug: 'content',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      widgets: ['widgetList']
    }
  },
  {
    title: 'Menu',
    slug: 'menu',
    parentSlug: 'content',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      widgets: []
    }
  },
  {
    title: 'Layouts',
    slug: 'layouts',
    parentSlug: 'content',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      widgets: ['layoutTemplates']
    }
  },
  {
    title: 'Page Editor',
    slug: 'edit',
    parentSlug: 'pages',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      widgets: ['pageEditorWidget', 'pageContent']

    }
  },
  {
    title: 'Settings',
    slug: 'settings',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      widgets: []
    }
  },
  {
    title: 'System',
    slug: 'system',
    parentSlug: 'settings',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      widgets: ['systemInfo', 'systemSettings']
    }
  },
  {
    title: 'Users',
    slug: 'users',
    parentSlug: 'settings',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      widgets: ['usersList']
    }
  },
  {
    title: 'User Editor',
    slug: 'edit',
    parentSlug: 'settings-users',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      widgets: ['userEdit'],
      actionButton: {
        icon: '/assets/icons/save.svg',
        action: 'saveUserChanges'
      }
    }
  },
  {
    title: 'Modules',
    slug: 'modules',
    parentSlug: 'settings',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      widgets: ['modulesList'],
      actionButton: {
        icon: '/assets/icons/plus.svg',
        action: 'openUploadPopup'
      }
    }
  },
  {
    title: 'Login',
    slug: 'login',
    parentSlug: 'settings',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      widgets: ['loginStrategies']
    }
  },
  {
    title: 'Strategy Editor',
    slug: 'edit',
    parentSlug: 'settings-login',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      widgets: ['loginStrategyEdit'],
      actionButton: {
        icon: '/assets/icons/save.svg',
        action: 'saveLoginStrategy'
      }
    }
  },
  {
    title: 'Fonts',
    slug: 'fonts',
    parentSlug: 'settings',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      widgets: ['fontsList']
    }
  }
];
