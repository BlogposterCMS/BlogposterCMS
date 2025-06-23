// public/assets/plainspace/main/pageRenderer.js

import { fetchPartial } from '../dashboard/fetchPartial.js';
import { initBuilder } from '../builder/builderRenderer.js';
import { init as initCanvasGrid } from './canvasGrid.js';
import { enableAutoEdit, sanitizeHtml } from '../builder/editor/editor.js';

// Default rows for admin widgets (~50px with 5px grid cells)
// Temporary patch: double the default height for larger widgets
const DEFAULT_ADMIN_ROWS = 20;

function getGlobalCssUrl(lane) {
  if (lane === 'admin') return '/assets/css/site.css';
  const theme = window.ACTIVE_THEME || 'default';
  return `/themes/${theme}/theme.css`;
}

function ensureGlobalStyle(lane) {
  const url = getGlobalCssUrl(lane);
  if (document.querySelector(`link[data-global-style="${lane}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.dataset.globalStyle = lane;
  document.head.appendChild(link);


  // In builder mode widgets import the theme in their shadow roots.
  // Avoid injecting the theme globally so the builder UI remains untouched.
}

async function fetchPartialSafe(name, type) {
  try {
    return await fetchPartial(name, type);
  } catch (err) {
    console.error(`[Renderer] failed to load partial ${type}/${name}`, err);
    return '';
  }
}

function executeJs(code, wrapper, root) {
  if (!code) return;
  const nonce = window.NONCE;
  if (!nonce) {
    console.error('[Renderer] missing nonce');
    return;
  }
  code = code.trim();
  // If the code contains ES module syntax, run it via dynamic import
  if (/^import\s|^export\s/m.test(code)) {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    import(url).then(m => {
      if (typeof m.render === 'function') {
        try { m.render.call(wrapper, root); } catch (err) {
          console.error('[Renderer] module render error', err);
        }
      }
      URL.revokeObjectURL(url);
    }).catch(err => {
      console.error('[Renderer] module import error', err);
      URL.revokeObjectURL(url);
    });
    return;
  }
  window.__rendererRoot = root;
  window.__rendererWrapper = wrapper;
  const script = document.createElement('script');
  script.setAttribute('nonce', nonce);
  script.textContent = `(function(root){\n${code}\n}).call(window.__rendererWrapper, window.__rendererRoot);`;
  document.body.appendChild(script);
  script.remove();
  delete window.__rendererRoot;
  delete window.__rendererWrapper;
}

function renderWidget(wrapper, def, code = null, lane = 'public') {
  const root = wrapper.attachShadow({ mode: 'open' });
  const globalCss = getGlobalCssUrl(lane);

  const style = document.createElement('style');
  style.textContent = `@import url('${globalCss}');`;
  root.appendChild(style);

  const container = document.createElement('div');
  container.className = 'widget-container';
  container.style.width = '100%';
  container.style.height = '100%';
  // Prevent drag actions when interacting with form controls inside widgets on
  // admin pages. Attach the handler on both the container and the grid item
  // content element so events are intercepted before the grid logic runs.
  const stop = ev => {
    const t = ev.target.closest('input, textarea, select, label, button');
    if (t) {
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    }
  };
  container.addEventListener('pointerdown', stop, true);
  container.addEventListener('mousedown', stop, true);
  container.addEventListener(
    'touchstart',
    stop,
    { capture: true, passive: true }
  );
  wrapper.addEventListener('pointerdown', stop, true);
  wrapper.addEventListener('mousedown', stop, true);
  wrapper.addEventListener(
    'touchstart',
    stop,
    { capture: true, passive: true }
  );
  root.appendChild(container);

  if (code) {
    if (code.css) {
      const customStyle = document.createElement('style');
      customStyle.textContent = code.css;
      root.appendChild(customStyle);
    }
    if (code.html) {
      container.innerHTML = sanitizeHtml(code.html);
    }
    if (code.js) {
      try { executeJs(code.js, wrapper, root); } catch (e) { console.error('[Renderer] custom js error', e); }

    }
    return;
  }
  const host = wrapper.closest('.canvas-item') || wrapper;
  const ctx = {
    id: host.dataset.instanceId,
    widgetId: def.id,
    metadata: def.metadata
  };
  if (lane === 'admin' && window.ADMIN_TOKEN) {
    ctx.jwt = window.ADMIN_TOKEN;
  }
  import(def.codeUrl)
    .then(m => m.render?.(container, ctx))
    .catch(err => console.error(`[Widget ${def.id}] import error:`, err));
}

function clearContentKeepHeader(el) {
  if (!el) return;
  const header = el.querySelector('#content-header');
  el.innerHTML = '';
  if (header) el.appendChild(header);
}

function ensureLayout(layout = {}, lane = 'public') {
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
    } else {
      sidebarEl.style.display = '';
    }
  }

  if (!document.getElementById('content')) {
    const content = document.createElement('section');
    content.id = 'content';
    mainContent.appendChild(content);
  }

  // Ensure global content header inside the content section
  const contentEl = document.getElementById('content');
  if (contentEl && !document.getElementById('content-header')) {
    const header = document.createElement('div');
    header.id = 'content-header';
    contentEl.prepend(header);
  }
}

(async () => {
  try {
    // 1. ROUTE BASICS
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const lane = window.location.pathname.startsWith('/admin') ? 'admin' : 'public';
    ensureGlobalStyle(lane);
    let slug;
    if (window.PAGE_SLUG) {
      slug = window.PAGE_SLUG;
    } else {
      const parts = lane === 'admin' ? pathParts.slice(1) : pathParts;
      slug = parts.join('-') || 'dashboard';
    }
    const DEBUG = window.DEBUG_RENDERER;
    if (DEBUG) console.debug('[Renderer] boot', { slug, lane });

    // 2. FETCH PAGE META
    const pageRes = await meltdownEmit('getPageBySlug', {
      moduleName: 'pagesManager',
      moduleType: 'core',
      slug,
      lane
    });
    if (DEBUG) console.debug('[Renderer] pageRes', pageRes);

    const page = pageRes?.data ?? pageRes ?? null;
    if (!page) {
      alert('Page not found');
      return;
    }

    const config = page.meta || {};
    window.CONTENT_ACTION = config.actionButton || null;

    if (lane === 'admin' && page.title) {
      document.title = `${page.title} - Admin`;
    }

    ensureLayout(config.layout || {}, lane);

    // 3. DOM REFERENCES
    const topHeaderEl = document.getElementById('top-header');
    const mainHeaderEl = document.getElementById('main-header');
    const sidebarEl = document.getElementById('sidebar');
    const contentEl = document.getElementById('content');

    if (slug === 'builder') {
      topHeaderEl?.remove();
      mainHeaderEl?.remove();
      document.getElementById('content-header')?.remove();
    }

    if (!contentEl) return;

    // 4. LOAD HEADER PARTIALS
    if (slug !== 'builder') {
      if (topHeaderEl) {
        topHeaderEl.innerHTML = sanitizeHtml(
          await fetchPartialSafe(
            config.layout?.header || 'top-header'
          )
        );
        document.dispatchEvent(new CustomEvent('top-header-loaded'));
      }
        if (mainHeaderEl) {
          if (config.layout?.inheritsLayout === false && !config.layout?.topHeader) {
            mainHeaderEl.innerHTML = '';
          } else {
            mainHeaderEl.innerHTML = sanitizeHtml(
              await fetchPartialSafe(config.layout?.mainHeader || 'main-header')
            );
          }
          if (lane === 'admin' && page.title) {
            const t = mainHeaderEl.querySelector('.site-title');
            if (t) t.textContent = page.title;
          }
        }
      const contentHeaderEl = document.getElementById('content-header');
      if (contentHeaderEl) {
        contentHeaderEl.innerHTML = sanitizeHtml(
          await fetchPartialSafe(
            config.layout?.contentHeader || 'content-header'
          )
        );
        document.dispatchEvent(new CustomEvent('content-header-loaded'));
      }
    }

    // 5. HANDLE BUILDER PAGE SEPARATELY
    if (slug === 'builder') {
      const builderSidebar = config.layout?.sidebar || 'sidebar-builder';
      if (sidebarEl) {
        sidebarEl.innerHTML = sanitizeHtml(
          await fetchPartialSafe(builderSidebar)
        );
      }

      const urlParams = new URLSearchParams(window.location.search);
      // Pass page IDs as strings so MongoDB ObjectIds remain intact. Postgres
      // will cast numeric strings automatically.
      const pageIdParam = urlParams.get('pageId') || null;
      const startLayerParam = parseInt(urlParams.get('layer'), 10);
      const startLayer = Number.isFinite(startLayerParam) ? startLayerParam : 0;

      await initBuilder(sidebarEl, contentEl, pageIdParam, startLayer);

      enableAutoEdit();

      return;
    }

    // 6. LOAD SIDEBAR PARTIAL FOR NON-BUILDER
    const sidebarPartial = (config.layout?.inheritsLayout === false)
      ? 'empty-sidebar'
      : (config.layout?.sidebar || 'default-sidebar');

    if (sidebarEl) {
      if (sidebarPartial !== 'empty-sidebar') {
        sidebarEl.innerHTML = sanitizeHtml(
          await fetchPartialSafe(sidebarPartial)
        );
        sidebarEl.style.display = '';
      } else {
        sidebarEl.innerHTML = '';
        sidebarEl.style.display = 'none';
      }
    }

    // 7. FETCH WIDGET REGISTRY
    let widgetLane = lane === 'admin' ? (config.widgetLane || 'admin') : 'public';
    // Prevent misconfigured pages from requesting admin widgets on the public lane
    if (lane !== 'admin' && widgetLane === 'admin') {
      console.warn('[Renderer] widgetLane="admin" on public page => forcing "public"');
      widgetLane = 'public';
    }

    const widgetRes = await meltdownEmit('widget.registry.request.v1', {
      lane: widgetLane,
      moduleName: 'plainspace',
      moduleType: 'core'
    });
    if (DEBUG) console.debug('[Renderer] widgetRes', widgetRes);

    const allWidgets = Array.isArray(widgetRes?.widgets) ? widgetRes.widgets : [];

    // 8. PUBLIC PAGE: render widgets using stored layout in static grid
    if (lane !== 'admin') {
      const layoutRes = await meltdownEmit('getLayoutForViewport', {
        moduleName: 'plainspace',
        moduleType: 'core',
        pageId: page.id,
        lane,
        viewport: 'desktop'
      });
      if (DEBUG) console.debug('[Renderer] layoutRes', layoutRes);

      const layout = Array.isArray(layoutRes?.layout) ? layoutRes.layout : [];

      // Temporary patch: start widgets larger by default
      const items = layout.length ? layout : (config.widgets || []).map((id, idx) => ({ id: `w${idx}`, widgetId: id, x:0,y:idx*2,w:8,h:4, code:null }));

      if (!items.length) {
        clearContentKeepHeader(contentEl);
        const msg = document.createElement('p');
        msg.className = 'empty-state';
        msg.textContent = 'No widgets configured.';
        contentEl.appendChild(msg);
        return;
      }

      clearContentKeepHeader(contentEl);
      const gridEl = document.createElement('div');
      gridEl.id = 'publicGrid';
      gridEl.className = 'canvas-grid';
      contentEl.appendChild(gridEl);
      // Static mode: public pages should not be directly editable
      const grid = initCanvasGrid({ staticGrid: true, float: true, cellHeight: 5, columnWidth: 5 }, gridEl);

      items.forEach(item => {
        const def = allWidgets.find(w => w.id === item.widgetId);
        if (!def) return;
        if (DEBUG) console.debug('[Renderer] render widget', def.id, item.id);

        // Expanded default size for public widgets
        const [x, y, w, h] = [item.x ?? 0, item.y ?? 0, item.w ?? 8, item.h ?? 4];

        const wrapper = document.createElement('div');
        wrapper.classList.add('canvas-item');
        wrapper.dataset.x = x;
        wrapper.dataset.y = y;
        wrapper.setAttribute('gs-w', w);
        wrapper.setAttribute('gs-h', h);
        wrapper.setAttribute('gs-min-w', 4);
        wrapper.setAttribute('gs-min-h', 4);
        wrapper.dataset.widgetId = def.id;
        wrapper.dataset.instanceId = item.id;
        if (item.global) wrapper.dataset.global = 'true';

        const content = document.createElement('div');
        content.className = 'canvas-item-content';
        wrapper.appendChild(content);

        gridEl.appendChild(wrapper);
        grid.makeWidget(wrapper);

        renderWidget(content, def, item.code || null, lane);

      });
      return;
    }

    // 9. ADMIN PAGE: INIT GRIDSTACK
    const layoutRes = await meltdownEmit('getLayoutForViewport', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'plainspace',
      moduleType: 'core',
      pageId: page.id,
      lane,
      viewport: 'desktop'
    });
    if (DEBUG) console.debug('[Renderer] admin layoutRes', layoutRes);

    let layout = Array.isArray(layoutRes?.layout) ? layoutRes.layout : [];

    clearContentKeepHeader(contentEl);
    const gridEl = document.createElement('div');
    gridEl.id = 'adminGrid';
    gridEl.className = 'canvas-grid';
    contentEl.appendChild(gridEl);
    const grid = initCanvasGrid({ cellHeight: 5, columnWidth: 5 }, gridEl);
    grid.setStatic(true);
    grid.on('change', () => {});
    window.adminGrid = grid;
    window.adminPageContext = { pageId: page.id, lane };
    window.adminCurrentLayout = layout;

    const matchedWidgets = allWidgets.filter(w => (config.widgets || []).includes(w.id));

    matchedWidgets.forEach(def => {
      if (DEBUG) console.debug('[Renderer] admin render widget', def.id);
      const meta = layout.find(l => l.widgetId === def.id) || {};
      // Larger defaults for admin widgets
      const [x, y, w, h] = [meta.x ?? 0, meta.y ?? 0, meta.w ?? 8, meta.h ?? DEFAULT_ADMIN_ROWS];

      const wrapper = document.createElement('div');
      wrapper.classList.add('canvas-item');
      wrapper.dataset.x = x;
      wrapper.dataset.y = y;
      wrapper.setAttribute('gs-w', w);
      wrapper.setAttribute('gs-h', h);
      wrapper.setAttribute('gs-min-w', 4);
      wrapper.setAttribute('gs-min-h', DEFAULT_ADMIN_ROWS);
      wrapper.dataset.widgetId = def.id;
      wrapper.dataset.instanceId = meta.id || `w${Math.random().toString(36).slice(2,8)}`;
      if (meta.global) wrapper.dataset.global = 'true';

      const content = document.createElement('div');
      content.className = 'canvas-item-content';
      wrapper.appendChild(content);

      gridEl.appendChild(wrapper);
      grid.makeWidget(wrapper);

      renderWidget(content, def, meta.code || null, lane);

    });

    grid.on('change', () => {
      const items = Array.from(gridEl.querySelectorAll('.canvas-item'));
      const newLayout = items.map(el => ({
        id: el.dataset.instanceId,
        widgetId: el.dataset.widgetId,
        global: el.dataset.global === 'true',
        x: +el.dataset.x || 0,
        y: +el.dataset.y || 0,
        w: +el.getAttribute('gs-w'),
        h: +el.getAttribute('gs-h'),
        code: layout.find(l => l.id === el.dataset.instanceId)?.code || null
      }));
      window.adminCurrentLayout = newLayout;
    });

    window.saveAdminLayout = async () => {
      if (!window.adminCurrentLayout) return;
      try {
        await meltdownEmit('saveLayoutForViewport', {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'plainspace',
          moduleType: 'core',
          pageId: page.id,
          lane,
          viewport: 'desktop',
          layout: window.adminCurrentLayout
        });
        layout = window.adminCurrentLayout;
      } catch (e) {
        console.error('[Admin] Layout save error:', e);
      }
    };

  } catch (err) {
    console.error('[Renderer] Fatal error:', err);
    alert('Renderer error: ' + err.message);
  }
})();
