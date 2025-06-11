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
        sidebar: 'default-sidebar',
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
    // Slug sanitized by pagesManager => slashes become hyphens
    slug: 'edit',
    parentSlug: 'pages',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'default-sidebar',
        inheritsLayout: true
      },
      widgets: ['pageInfoWidget', 'pageSettingsWidget', 'seoImageWidget', 'savePageWidget']

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
      widgets: ['systemInfo']
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
      widgets: ['userEdit']
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
      widgets: ['modulesList']
    }
  },
  {
    title: 'Themes',
    slug: 'themes',
    parentSlug: 'settings',
    lane: 'admin',
    config: {
      layout: {
        header: 'top-header',
        sidebar: 'settings-sidebar',
        inheritsLayout: true
      },
      widgets: ['themesList']
    }
  }
];
