export function getGlobalCssUrl(lane) {
    if (lane === 'admin')
        return '/assets/css/site.css';
    const theme = window.ACTIVE_THEME || 'default';
    return `/themes/${theme}/theme.css`;
}
export function ensureGlobalStyle(lane) {
    const url = getGlobalCssUrl(lane);
    if (document.querySelector(`link[data-global-style="${lane}"]`))
        return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.dataset.globalStyle = lane;
    document.head.appendChild(link);
}
export function sanitizeUrl(val) {
    return typeof val === 'string' && /^(https?:\/\/|\/)[^\s]*$/.test(val)
        ? val
        : '';
}
export function clearContentKeepHeader(el) {
    if (!el)
        return;
    const header = el.querySelector('#content-header');
    el.innerHTML = '';
    if (header)
        el.appendChild(header);
}
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isPageEditorShell(page, context) {
    return page.lane === 'admin'
        && (page.slug === 'pages/edit' || context.slug === 'pages/edit');
}
export function resolveRuntimeShellConfig(page, config = {}, context = {}) {
    const safeConfig = isPlainObject(config) ? config : {};
    const currentLayout = isPlainObject(safeConfig.layout) ? safeConfig.layout : {};
    if (!isPageEditorShell(page, context) || currentLayout.sidebar === 'empty-sidebar') {
        return safeConfig;
    }
    return {
        ...safeConfig,
        layout: {
            ...currentLayout,
            sidebar: 'empty-sidebar'
        }
    };
}
export function ensureLayout(layout = {}, lane = 'public') {
    let scope = document.querySelector('.app-scope');
    if (!scope) {
        scope = document.createElement('div');
        scope.className = 'app-scope';
        document.body.prepend(scope);
    }
    if (lane !== 'admin') {
        if (!document.getElementById('content')) {
            const content = document.createElement('section');
            content.id = 'content';
            scope.appendChild(content);
        }
        return;
    }
    const inherit = layout.inheritsLayout !== false;
    if (inherit || layout.header) {
        if (!document.getElementById('top-header')) {
            const topHeader = document.createElement('header');
            topHeader.id = 'top-header';
            scope.appendChild(topHeader);
        }
    }
    if (inherit) {
        if (!document.getElementById('main-header')) {
            const mainHeader = document.createElement('header');
            mainHeader.id = 'main-header';
            scope.appendChild(mainHeader);
        }
    }
    let mainContent = document.querySelector('.main-content');
    if (!mainContent) {
        mainContent = document.createElement('div');
        mainContent.className = 'main-content';
        scope.appendChild(mainContent);
    }
    if ((inherit || layout.sidebar) && layout.sidebar !== 'empty-sidebar') {
        if (!document.getElementById('sidebar')) {
            const sidebar = document.createElement('aside');
            sidebar.id = 'sidebar';
            mainContent.appendChild(sidebar);
        }
    }
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) {
        if (layout.sidebar === 'empty-sidebar') {
            sidebarEl.style.display = 'none';
        }
        else {
            sidebarEl.style.display = '';
        }
    }
    if (!document.getElementById('content')) {
        const content = document.createElement('section');
        content.id = 'content';
        mainContent.appendChild(content);
    }
    const contentEl = document.getElementById('content');
    if (contentEl && !document.getElementById('content-header')) {
        const header = document.createElement('div');
        header.id = 'content-header';
        contentEl.prepend(header);
    }
}
