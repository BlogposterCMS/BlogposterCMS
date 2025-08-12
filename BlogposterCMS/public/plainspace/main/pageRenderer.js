import { fetchPartial } from '../dashboard/fetchPartial.js';
import { init as initCanvasGrid } from './canvasGrid.js';
const { sanitizeHtml } = await import(
  /* webpackIgnore: true */ '/plainspace/editor/core/sanitizer.js'
);
import { executeJs } from './script-utils.js';
import { applyWidgetOptions } from './widgetOptions.js';

// Default rows for admin widgets (~100px with CanvasGrid)
// Temporary patch: double the default height for larger widgets
const DEFAULT_ADMIN_ROWS = 100;


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

function createDebouncedEmitter(delay = 150) {
  let queue = [];
  let timer = null;
  return function(eventName, payload = {}) {
    return new Promise((resolve, reject) => {
      queue.push({ eventName, payload, resolve, reject });
      if (!timer) {
        timer = setTimeout(async () => {
          const batch = queue.slice();
          queue = [];
          timer = null;
          try {
            const results = await window.meltdownEmitBatch(
              batch.map(it => ({ eventName: it.eventName, payload: it.payload }))
            );
            batch.forEach((item, idx) => item.resolve(results[idx]));
          } catch (err) {
            batch.forEach(item => item.reject(err));
          }
        }, delay);
      }
    });
  };
}

const emitDebounced = createDebouncedEmitter(100);

async function registerWidgetEvents(def, lane) {
  const raw = def?.metadata?.apiEvents;
  if (!raw || typeof window.meltdownEmit !== 'function') return;
  const list = Array.isArray(raw) ? raw : [raw];
  const events = list.filter(
    ev => typeof ev === 'string' && /^[\w.:-]{1,64}$/.test(ev)
  );
  if (!events.length) return;
  const jwt = lane === 'admin' ? window.ADMIN_TOKEN : window.PUBLIC_TOKEN;
  if (!jwt) return;
  try {
    await window.meltdownEmit('registerWidgetUsage', { jwt, events });
  } catch (err) {
    console.warn(`[Renderer] registerWidgetUsage failed for ${def.id}`, err);
  }
}

async function renderWidget(wrapper, def, code = null, lane = 'public') {
  const root = wrapper.attachShadow({ mode: 'open' });
  const globalCss = getGlobalCssUrl(lane);

  const style = document.createElement('style');
  style.textContent = `@import url('${globalCss}');`;
  root.appendChild(style);

  const container = document.createElement('div');
  container.className = 'widget-container';
  if (lane === 'admin') {
    container.classList.add('admin-widget');
  }
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
  const handleSlot = document.createElement('slot');
  handleSlot.name = 'resize-handle';
  root.appendChild(handleSlot);

  await registerWidgetEvents(def, lane);

  const handleSheet = new CSSStyleSheet();
  handleSheet.replaceSync(`::slotted(.resize-handle){position:absolute;right:0;bottom:0;width:12px;height:12px;cursor:se-resize;background:var(--user-color, #333);}`);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, handleSheet];

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
      try { executeJs(code.js, wrapper, root, 'Renderer'); } catch (e) { console.error('[Renderer] custom js error', e); }

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
  try {
    const m = await import(def.codeUrl);
    m.render?.(container, ctx);
  } catch (err) {
    console.error(`[Widget ${def.id}] import error:`, err);
  }
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

  if (!document.getElementById('pages-menu')) {
    const menu = document.createElement('aside');
    menu.id = 'pages-menu';
    mainContent.appendChild(menu);
  }

  // Ensure global content header inside the content section
  const contentEl = document.getElementById('content');
  if (contentEl && !document.getElementById('content-header')) {
    const header = document.createElement('div');
    header.id = 'content-header';
    contentEl.prepend(header);
  }
}

async function renderStaticGrid(target, layout, allWidgets, lane, opts = {}) {
  if (!target) return { gridEl: null, grid: null };
  let { gridEl, grid, append = false } = opts;
  if (!append || !gridEl || !grid) {
    gridEl = document.createElement('div');
    gridEl.className = 'canvas-grid';
    target.appendChild(gridEl);
    const columnWidth = 1;
    const columns = 12;
    grid = initCanvasGrid({ staticGrid: true, float: true, cellHeight: 1, columnWidth, columns }, gridEl);
  }
  const pending = [];
  for (const item of layout) {
    const def = allWidgets.find(w => w.id === item.widgetId);
    if (!def) continue;
    const [x, y, w, h] = [item.x ?? 0, item.y ?? 0, item.w ?? 8, item.h ?? 4];
    const wrapper = document.createElement('div');
    wrapper.classList.add('canvas-item', 'loading');
    wrapper.dataset.x = x;
    wrapper.dataset.y = y;
    wrapper.setAttribute('gs-w', w);
    wrapper.setAttribute('gs-h', h);
    wrapper.setAttribute('gs-min-w', 4);
    wrapper.setAttribute('gs-min-h', 4);
    wrapper.dataset.widgetId = def.id;
    wrapper.dataset.instanceId = item.id;
    const ph = document.createElement('div');
    ph.className = 'widget-placeholder';
    ph.textContent = def.metadata?.label || def.id;
    wrapper.appendChild(ph);
    gridEl.appendChild(wrapper);
    grid.makeWidget(wrapper);
    pending.push({ wrapper, item, def, placeholder: ph });
  }
  for (const { wrapper, item, def, placeholder } of pending) {
    const content = document.createElement('div');
    content.className = 'canvas-item-content';
    if (placeholder && placeholder.parentNode === wrapper) placeholder.remove();
    wrapper.appendChild(content);
    try {
      const res = await emitDebounced('getWidgetInstance', {
        instanceId: `default.${def.id}`,
        ...(lane === 'admin' ? { jwt: window.ADMIN_TOKEN } : {}) ,
        moduleName: 'plainspace',
        moduleType: 'core'
      });
      const opts = res?.content ? JSON.parse(res.content) : null;
      applyWidgetOptions(wrapper, opts, grid);
    } catch {}
    await renderWidget(content, def, item.code || null, lane);
    wrapper.classList.remove('loading');
  }
  return { gridEl, grid };
}

async function renderAttachedContent(page, lane, allWidgets, container) {
  if (!container) return;
  try {
    const childRes = await meltdownEmit('getChildPages', {
      parentId: page.id,
      moduleName: 'pagesManager',
      moduleType: 'core',
      ...(lane === 'admin' ? { jwt: window.ADMIN_TOKEN } : { jwt: window.PUBLIC_TOKEN })
    });
    const items = Array.isArray(childRes) ? childRes : (childRes?.data ?? []);
    for (const child of items.filter(c => c.is_content)) {
      const childPageRes = await meltdownEmit('getPageById', {
        pageId: child.id,
        lane,
        moduleName: 'pagesManager',
        moduleType: 'core',
        ...(lane === 'admin' ? { jwt: window.ADMIN_TOKEN } : { jwt: window.PUBLIC_TOKEN })
      });
      const childPage = childPageRes?.data ?? childPageRes;
      if (!childPage) continue;
      const section = document.createElement('section');
      section.className = 'attached-content';
      if (childPage.meta?.layoutTemplate) {
        let layoutArr = [];
        try {
          const res = await meltdownEmit('getLayoutTemplate', {
            name: childPage.meta.layoutTemplate,
            moduleName: 'plainspace',
            moduleType: 'core',
            ...(lane === 'admin' ? { jwt: window.ADMIN_TOKEN } : { jwt: window.PUBLIC_TOKEN })
          });
          layoutArr = Array.isArray(res?.layout) ? res.layout : [];
        } catch (err) {
          console.warn('[Renderer] failed to load layout template', err);
        }
        await renderStaticGrid(section, layoutArr, allWidgets, lane);
      } else if (childPage.html) {
        const div = document.createElement('div');
        div.innerHTML = sanitizeHtml(childPage.html);
        section.appendChild(div);
      }
      container.appendChild(section);
    }
  } catch (err) {
    console.warn('[Renderer] failed to load attached content', err);
  }
}

(async () => {
  try {
    // 1. ROUTE BASICS
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const adminIndex = pathParts.indexOf('admin');
    const lane = adminIndex !== -1 ? 'admin' : 'public';
    ensureGlobalStyle(lane);
    let slug;
    if (window.PAGE_SLUG) {
      slug = window.PAGE_SLUG;
    } else {
      const parts = lane === 'admin' ? pathParts.slice(adminIndex + 1) : pathParts;
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
    const mainHeaderEl = document.getElementById('main-header');
    const sidebarEl = document.getElementById('sidebar');
    const contentEl = document.getElementById('content');

    if (slug === 'builder') {
      mainHeaderEl?.remove();
      document.getElementById('content-header')?.remove();
    }

    if (!contentEl) return;

    // 4. LOAD HEADER PARTIALS
    if (slug !== 'builder') {
      if (mainHeaderEl) {
        if (config.layout?.inheritsLayout === false) {
          mainHeaderEl.innerHTML = '';
        } else {
          mainHeaderEl.innerHTML = sanitizeHtml(
            await fetchPartialSafe(
              config.layout?.mainHeader || config.layout?.header || 'main-header'
            )
          );
          document.dispatchEvent(new CustomEvent('main-header-loaded'));
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
        const panelContainer = sidebarEl.querySelector('#builderPanel');
        if (panelContainer) {
          const textHtml = await fetchPartialSafe('text-panel', 'builder');
          panelContainer.innerHTML = sanitizeHtml(textHtml);
        }
      }

      const urlParams = new URLSearchParams(window.location.search);
      // Pass page IDs as strings so MongoDB ObjectIds remain intact. Postgres
      // will cast numeric strings automatically.
      const pageIdParam = urlParams.get('pageId') || null;
      const layoutNameParam = urlParams.get('layout') || null;
      const startLayerParam = parseInt(urlParams.get('layer'), 10);
      const startLayer = Number.isFinite(startLayerParam)
        ? startLayerParam
        : (Number(config.layout?.layer) || (layoutNameParam ? 1 : 0));

      const [{ initBuilder }, { enableAutoEdit }] = await Promise.all([
        import(/* webpackIgnore: true */ '/plainspace/builderRenderer.js'),
        import(/* webpackIgnore: true */ '/plainspace/editor/core/editor.js')
      ]);

      await initBuilder(sidebarEl, contentEl, pageIdParam, startLayer, layoutNameParam);

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

    const pagesMenuEl = document.getElementById('pages-menu');
    if (pagesMenuEl) {
      try {
        pagesMenuEl.innerHTML = sanitizeHtml(
          await fetchPartialSafe('pages-menu')
        );
        document.dispatchEvent(new CustomEvent('pages-menu-loaded'));
      } catch (err) {
        console.warn('[Renderer] failed to load pages-menu', err);
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
      moduleType: 'core',
      ...(lane === 'admin' ? { jwt: window.ADMIN_TOKEN } : {})
    });
    if (DEBUG) console.debug('[Renderer] widgetRes', widgetRes);

    const allWidgets = Array.isArray(widgetRes?.widgets) ? widgetRes.widgets : [];
    window.availableWidgets = allWidgets;

    let globalLayout = [];
    try {
      const glRes = await meltdownEmit('getGlobalLayoutTemplate', {
        moduleName: 'plainspace',
        moduleType: 'core',
        ...(lane === 'admin' ? { jwt: window.ADMIN_TOKEN } : { jwt: window.PUBLIC_TOKEN }),
        lane
      });
      globalLayout = Array.isArray(glRes?.layout)
        ? glRes.layout
        : [];
    } catch (err) {
      console.warn('[Renderer] failed to load global layout', err);
    }

    // 8. PUBLIC PAGE: render widgets using stored layout in static grid
    if (lane !== 'admin') {
      if (config.layoutTemplate) {
        let layoutArr = [];
        try {
          const res = await meltdownEmit('getLayoutTemplate', {
            name: config.layoutTemplate,
            moduleName: 'plainspace',
            moduleType: 'core',
            jwt: window.PUBLIC_TOKEN,
            lane
          });
          layoutArr = Array.isArray(res?.layout) ? res.layout : [];
        } catch (err) {
          console.warn('[Renderer] failed to load layout template', err);
        }
        const combined = [...globalLayout, ...layoutArr];
        clearContentKeepHeader(contentEl);
        await renderStaticGrid(contentEl, combined, allWidgets, lane);
        await renderAttachedContent(page, lane, allWidgets, contentEl);
        return;
      }
      if (page.html) {
        clearContentKeepHeader(contentEl);
        const div = document.createElement('div');
        div.innerHTML = sanitizeHtml(page.html);
        contentEl.appendChild(div);
        await renderAttachedContent(page, lane, allWidgets, contentEl);
        return;
      }

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
      const combined = [...globalLayout, ...items];

      if (!combined.length) {
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
      const grid = initCanvasGrid({ staticGrid: true, float: true, cellHeight: 1, columnWidth: 1 }, gridEl);

      const pending = [];
      for (const item of combined) {
        const def = allWidgets.find(w => w.id === item.widgetId);
        if (!def) continue;
        if (DEBUG) console.debug('[Renderer] render widget placeholder', def.id, item.id);

        const [x, y, w, h] = [item.x ?? 0, item.y ?? 0, item.w ?? 8, item.h ?? 4];

        const wrapper = document.createElement('div');
        wrapper.classList.add('canvas-item', 'loading');
        wrapper.dataset.x = x;
        wrapper.dataset.y = y;
        wrapper.setAttribute('gs-w', w);
        wrapper.setAttribute('gs-h', h);
        wrapper.setAttribute('gs-min-w', 4);
        wrapper.setAttribute('gs-min-h', 4);
        wrapper.dataset.widgetId = def.id;
        wrapper.dataset.instanceId = item.id;

        const ph = document.createElement('div');
        ph.className = 'widget-placeholder';
        ph.textContent = def.metadata?.label || def.id;
        wrapper.appendChild(ph);

        gridEl.appendChild(wrapper);
        grid.makeWidget(wrapper);
        pending.push({ wrapper, item, def, placeholder: ph });
      }

      for (const { wrapper, item, def, placeholder } of pending) {
        const content = document.createElement('div');
        content.className = 'canvas-item-content';
        if (placeholder && placeholder.parentNode === wrapper) {
          placeholder.remove();
        }
        wrapper.appendChild(content);

        try {
          const res = await emitDebounced('getWidgetInstance', {
            moduleName: 'plainspace',
            moduleType: 'core',
            instanceId: `default.${def.id}`
          });
          const opts = res?.content ? JSON.parse(res.content) : null;
          applyWidgetOptions(wrapper, opts, grid);
        } catch {}

        await renderWidget(content, def, item.code || null, lane);
        wrapper.classList.remove('loading');
      }
      await renderAttachedContent(page, lane, allWidgets, contentEl);
      return;
    }

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
    const combinedAdmin = [...globalLayout, ...layout];

    clearContentKeepHeader(contentEl);
    const gridEl = document.createElement('div');
    gridEl.id = 'adminGrid';
    gridEl.className = 'canvas-grid';
    contentEl.appendChild(gridEl);
    const columnWidth = 80;
    const columns = 12;
    const grid = initCanvasGrid({
      cellHeight: 1,
      columnWidth,
      columns,
      percentageMode: true,
      pushOnOverlap: true,
      useBoundingBox: false
    }, gridEl);
    grid.setStatic(true);
    document.body.classList.add('grid-mode');
    grid.on('change', () => {});
    window.adminGrid = grid;
    window.adminPageContext = { pageId: page.id, lane };
    window.adminCurrentLayout = layout;

    const CELL_W = grid.options.columnWidth;
    const CELL_H = grid.options.cellHeight;
    const widgetIdSet = new Set(combinedAdmin.map(l => l.widgetId));
    for (const id of (config.widgets || [])) widgetIdSet.add(id);
    const matchedWidgets = allWidgets.filter(w => widgetIdSet.has(w.id));

    const pendingAdmin = [];
    for (const def of matchedWidgets) {
      if (DEBUG) console.debug('[Renderer] admin render widget placeholder', def.id);
      const meta = combinedAdmin.find(l => l.widgetId === def.id) || {};
      const [x, y, w, h] = [meta.x ?? 0, meta.y ?? 0, meta.w ?? 8, meta.h ?? DEFAULT_ADMIN_ROWS];

      const wrapper = document.createElement('div');
      wrapper.classList.add('canvas-item', 'loading');
      wrapper.dataset.x = x;
      wrapper.dataset.y = y;
      wrapper.setAttribute('gs-w', w);
      wrapper.setAttribute('gs-h', h);
      const minW = 4;
      const minH = DEFAULT_ADMIN_ROWS;
      wrapper.setAttribute('gs-min-w', minW);
      wrapper.setAttribute('gs-min-h', minH);
      wrapper.style.minWidth = `${minW * CELL_W}px`;
      wrapper.style.minHeight = `${minH * CELL_H}px`;
      wrapper.dataset.widgetId = def.id;
      wrapper.dataset.instanceId = meta.id || `w${Math.random().toString(36).slice(2,8)}`;

      const ph = document.createElement('div');
      ph.className = 'widget-placeholder';
      ph.textContent = def.metadata?.label || def.id;
      wrapper.appendChild(ph);

      gridEl.appendChild(wrapper);
      grid.makeWidget(wrapper);
      pendingAdmin.push({ wrapper, def, meta, placeholder: ph });
    }

    for (const { wrapper, def, meta, placeholder } of pendingAdmin) {
      const content = document.createElement('div');
      content.className = 'canvas-item-content';
      if (placeholder && placeholder.parentNode === wrapper) {
        placeholder.remove();
      }
      wrapper.appendChild(content);

      try {
        const res = await emitDebounced('getWidgetInstance', {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'plainspace',
          moduleType: 'core',
          instanceId: `default.${def.id}`
        });
        const opts = res?.content ? JSON.parse(res.content) : null;
        applyWidgetOptions(wrapper, opts, grid);
      } catch {}

      await renderWidget(content, def, meta.code || null, lane);
      wrapper.classList.remove('loading');
    }

    await renderAttachedContent(page, lane, allWidgets, contentEl);

    grid.on('change', () => {
      const items = Array.from(gridEl.querySelectorAll('.canvas-item'));
      const newLayout = items.map(el => ({
        id: el.dataset.instanceId,
        widgetId: el.dataset.widgetId,
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

