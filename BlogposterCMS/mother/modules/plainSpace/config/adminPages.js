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
      icon: '/assets/icons/home.svg',
      widgets: ['contentSummary', 'modulesList', 'pageStats'],
      workspace: 'home'
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
      icon: '/assets/icons/folder.svg',
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
      icon: '/assets/icons/puzzle.svg',
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
      icon: '/assets/icons/menu.svg',
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
      icon: '/assets/icons/layout-dashboard.svg',
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
      icon: '/assets/icons/file-pen-line.svg',
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
      icon: '/assets/icons/cog.svg',
      widgets: [],
      workspace: 'settings'
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
      icon: '/assets/icons/server.svg',
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
      icon: '/assets/icons/users.svg',
      widgets: ['usersList']
    }
  },
  {
    title: 'User Editor',
    slug: 'edit',
    parentSlug: 'settings/users',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/user-pen.svg',
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
      icon: '/assets/icons/package.svg',
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
      icon: '/assets/icons/log-in.svg',
      widgets: ['loginStrategies']
    }
  },
  {
    title: 'Strategy Editor',
    slug: 'edit',
    parentSlug: 'settings/login',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      icon: '/assets/icons/file-pen.svg',
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
      icon: '/assets/icons/type.svg',
      widgets: ['fontsList']
    }
  }
];
