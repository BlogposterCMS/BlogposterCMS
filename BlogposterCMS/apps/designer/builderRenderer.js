
import {
  editElement,
  initTextEditor,
  showToolbar,
  hideToolbar,
  setActiveElement,
  getRegisteredEditable,
  undoTextCommand,
  redoTextCommand
} from './editor/editor.js';
import { initBackgroundToolbar, showBackgroundToolbar as showBgToolbar, hideBackgroundToolbar as hideBgToolbar, isBackgroundToolbar } from './editor/toolbar/backgroundToolbar.js';
import { initGrid, getCurrentLayout, getCurrentLayoutForLayer, pushState } from './managers/gridManager.js';
import { applyLayout, getItemData } from './managers/layoutManager.js';
import { registerDeselect } from './managers/eventManager.js';
import { attachEditButton, attachRemoveButton, attachLockOnClick, attachOptionsMenu, renderWidget } from './managers/widgetManager.js';

import { addHitLayer, applyDesignerTheme, wrapCss, executeJs } from './utils.js';

// Debug helper (enable with window.DEBUG_TEXT_EDITOR = true)
function DBG(...args) {
  try { if (window.DEBUG_TEXT_EDITOR) console.log('[TE/builder]', ...args); } catch (e) {}
}
import { createActionBar } from './renderer/actionBar.js';
import { scheduleAutosave as scheduleAutosaveFn, startAutosave as startAutosaveFn, saveCurrentLayout as saveLayout } from './renderer/autosave.js';
import { registerBuilderEvents } from './renderer/eventHandlers.js';
import { getWidgetIcon, extractCssProps, makeSelector } from './renderer/renderUtils.js';
import { fetchPartial } from './fetchPartial.js';
import { sanitizeHtml } from '../../public/plainspace/sanitizer.js';

function getAdminUserId() {
  try {
    if (!window.ADMIN_TOKEN) return null;
    const [, payload] = window.ADMIN_TOKEN.split('.');
    const decoded = JSON.parse(atob(payload));
    return decoded.userId || decoded.sub || decoded.id || decoded.user?.id || null;
  } catch (err) {
    console.error('[Designer] token parse failed', err);
    return null;
  }
}

let _toPng;
async function loadToPng() {
  if (_toPng) return _toPng;
  try {
    const mod = await import('html-to-image');
    _toPng = mod.toPng;
  } catch (err) {
    try {
      const mod = await import('/assets/js/html-to-img.js');
      _toPng = mod.toPng;
    } catch (err2) {
      console.warn('[Designer] html-to-image unavailable', err2);
      _toPng = async () => '';
    }
  }
  return _toPng;
}

let pageService;
let sanitizeSlug;
async function loadPageService() {
  if (pageService && sanitizeSlug) return;
  try {
    const mod = await import(
      /* webpackIgnore: true */ '/plainspace/widgets/admin/defaultwidgets/pageList/pageService.js'
    );
    pageService = mod.pageService;
    sanitizeSlug = mod.sanitizeSlug;
  } catch (err) {
    console.warn('[Designer] pageService not available', err);
    sanitizeSlug = str => String(str).toLowerCase().replace(/[^a-z0-9\/-]+/g, '-').replace(/^-+|-+$/g, '');
  }
}

export async function initBuilder(sidebarEl, contentEl, pageId = null, startLayer = 0, layoutNameParam = null) {
  document.body.classList.add('builder-mode');
  initTextEditor();
  initBackgroundToolbar();
  // Builder widgets load the active theme inside their shadow roots.
  // Inject the theme scoped to the builder grid so the preview matches
  // the active theme without altering the surrounding UI.
  const DEFAULT_PORTS = [
    { id: 'desktop', label: 'Desktop', class: 'preview-desktop' },
    { id: 'tablet', label: 'Tablet', class: 'preview-tablet' },
    { id: 'mobile', label: 'Mobile', class: 'preview-mobile' }
  ];

  const displayPorts = (Array.isArray(window.DISPLAY_PORTS) ? window.DISPLAY_PORTS : [])
    .filter(p => p && p.id && p.label)
    .map(p => ({
      id: String(p.id),
      label: String(p.label),
      class: `preview-${String(p.id).replace(/[^a-z0-9_-]/gi, '')}`
    }));
  if (!displayPorts.length) displayPorts.push(...DEFAULT_PORTS);

  // Temporary patch: larger default widget height
  const DEFAULT_ROWS = 100; // default widget height (~100px)
  const ICON_MAP = {
    systemInfo: 'info',
    activityLog: 'list',
    pageEditor: 'file-text',
    mediaExplorer: 'folder',
    pageList: 'list',
    pageStats: 'bar-chart-2',
    pageEditorWidget: 'file-text',
    contentSummary: 'activity',
    htmlBlock: 'code',
    textBox: 'type'
  };

  let previewHeader;
  let viewportSelect;
  const layoutLayers = [
    { name: 'Global', layout: [] },
    { name: 'Layer 1', layout: [] }
  ];
  const startLayerNum = Number(startLayer);
  let activeLayer = Number.isFinite(startLayerNum)
    ? Math.max(0, Math.min(layoutLayers.length - 1, startLayerNum))
    : 1;
  document.body.dataset.activeLayer = String(activeLayer);
  const footer = document.getElementById('builderFooter');
  let layoutBar;
  let globalLayoutName = null;

  function showPreviewHeader() {
    if (previewHeader) return;
    previewHeader = document.createElement('div');
    previewHeader.id = 'previewHeader';
    previewHeader.className = 'preview-header';
    viewportSelect = document.createElement('select');
    displayPorts.forEach(p => {
      const o = document.createElement('option');
      o.value = p.class;
      o.textContent = p.label;
      viewportSelect.appendChild(o);
    });
    viewportSelect.addEventListener('change', () => {
      document.body.classList.remove('preview-mobile', 'preview-tablet', 'preview-desktop');
      const cls = viewportSelect.value;
      if (cls) document.body.classList.add(cls);
    });
    previewHeader.appendChild(viewportSelect);
    document.body.prepend(previewHeader);
    viewportSelect.dispatchEvent(new Event('change'));
  }

  function hidePreviewHeader() {
    if (previewHeader) {
      previewHeader.remove();
      previewHeader = null;
      viewportSelect = null;
    }
    document.body.classList.remove('preview-mobile', 'preview-tablet', 'preview-desktop');
  }

  // Load the builder header from HTML partial and inject it at the top
  async function loadHeaderPartial() {
    try {
      const res = await fetch('/apps/designer/partials/builder-header.html', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const tpl = document.createElement('template');
      tpl.innerHTML = html.trim();
      const headerEl = tpl.content.firstElementChild;
      const appScope = document.querySelector('.app-scope');
      if (appScope) appScope.prepend(headerEl); else document.body.prepend(headerEl);
      return headerEl;
    } catch (err) {
      console.warn('[Designer] Failed to load builder-header.html, falling back to JS header shell', err);
      const fallback = document.createElement('header');
      fallback.id = 'builder-header';
      fallback.className = 'builder-header';
      const appScope = document.querySelector('.app-scope');
      if (appScope) appScope.prepend(fallback); else document.body.prepend(fallback);
      return fallback;
    }
  }

  let proMode = true;
  let gridEl;
  let codeMap = {};
  // Track when the BG toolbar was just opened to avoid immediate hide by global click
  let bgToolbarOpenedTs = 0;
  // Debug helper for background interactions
  const BGLOG = (...args) => { try { console.log('[BG]', ...args); } catch (_) {} };
  function ensureCodeMap() {
    if (!codeMap || typeof codeMap !== 'object') codeMap = {};
    return codeMap;
  }
  const state = {
    pageId,
    autosaveEnabled: true,
    pendingSave: false,
    saveTimer: null,
    autosaveInterval: null,
    lastSavedLayoutStr: '' ,
    activeWidgetEl: null
  };

  function applyProMode() {
    document.body.classList.toggle('pro-mode', proMode);
    document.querySelectorAll('.widget-edit').forEach(btn => {
      btn.style.display = proMode ? '' : 'none';
    });
    if (!proMode) {
      document.querySelectorAll('.widget-code-editor').forEach(ed => {
        ed.style.display = 'none';
      });
    }
  }
  const genId = () => `w${Math.random().toString(36).slice(2,8)}`;




  let allWidgets = [];
  try {
    const widgetRes = await meltdownEmit('widget.registry.request.v1', {
      lane: 'public',
      moduleName: 'plainspace',
      moduleType: 'core'
    });
    allWidgets = Array.isArray(widgetRes?.widgets) ? widgetRes.widgets : [];
  } catch (err) {
    console.error('[Designer] failed to load widgets', err);
  }

  sidebarEl.querySelector('.drag-icons').innerHTML = allWidgets.map(w => `
    <div class="sidebar-item drag-widget-icon" draggable="true" data-widget-id="${w.id}">
      ${getWidgetIcon(w, ICON_MAP)}
      <span class="label">${w.metadata.label}</span>
    </div>
  `).join('');

  sidebarEl.querySelectorAll('.drag-widget-icon').forEach(icon => {
    icon.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', icon.dataset.widgetId);
    });
  });

  const textIcon = sidebarEl.querySelector('.drag-widget-icon[data-widget-id="textBox"]');
  const builderPanel = sidebarEl.querySelector('#builderPanel');
  const collapseBtn = builderPanel?.querySelector('.collapse-btn');
  if (textIcon && builderPanel && collapseBtn) {
    textIcon.addEventListener('click', () => {
      document.body.classList.toggle('panel-open');
    });
    collapseBtn.addEventListener('click', () => {
      document.body.classList.remove('panel-open');
    });
  }

    // Use a plain builder grid container. CanvasGrid will add its own
  // `canvas-grid` class; avoid `pixel-grid` here so zoom scaling via
  // CSS variable works with the BoundingBoxManager.
  //
  // Wrap the grid in a scrollable viewport so scrollbars live "inside"
  // the designer instead of the page. The inner #builderGrid hosts the
  // actual canvas content.
  contentEl.innerHTML = `
    <div id="builderViewport" class="builder-viewport">
      <div id="builderGrid" class="builder-grid"></div>
    </div>
  `;
  gridEl = document.getElementById('builderGrid');
  const gridViewportEl = document.getElementById('builderViewport');
  const viewportSizeEl = document.createElement('div');
  viewportSizeEl.className = 'viewport-size-display';
  gridViewportEl.appendChild(viewportSizeEl);
  const { updateAllWidgetContents } = registerBuilderEvents(gridEl, ensureCodeMap(), { getRegisteredEditable });
  const saveLayoutCtx = {
    updateAllWidgetContents,
    getCurrentLayout: () => getCurrentLayoutForLayer(gridEl, activeLayer, ensureCodeMap()),
    pushState,
    meltdownEmit,
    pageId,
    codeMap: ensureCodeMap(),
    getLayer: () => activeLayer
  };
  await applyDesignerTheme();
  // Allow overlapping widgets for layered layouts
  const grid = initGrid(gridEl, state, selectWidget, {
    scrollContainer: gridViewportEl,
    enableZoom: true
  });
  const { actionBar, select: baseSelectWidget } = createActionBar(null, grid, state, () => scheduleAutosave());
  function scheduleAutosave() {
    scheduleAutosaveFn(state, opts => saveLayout(opts, { ...saveLayoutCtx, ...state }));
  }
  function selectWidget(el) {
    baseSelectWidget(el);
    if (!el) return;
    // Hide background toolbar when selecting a widget
    hideBgToolbar();
    let editable = getRegisteredEditable(el);
    if (!editable) {
      // Fallback: resolve inner editable inside widget DOM
      editable = el.querySelector('[data-text-editable], .editable');
    }
    setActiveElement(editable);
    showToolbar();
    DBG('selectWidget', { widgetId: el?.id, editableId: editable?.id });
  }
  // When the grid selection changes, either select a widget or show the
  // background toolbar. Previously we only handled the widget case, so
  // clicking on empty space would not reveal the background toolbar. This
  // mirrors the behaviour of the text editor: when nothing is selected we
  // hide the text toolbar and show the background toolbar. Record the
  // opening timestamp so the global click handler does not immediately hide
  // it again.
  grid.on('change', el => {
    if (el) {
      // Selecting a widget hides the background toolbar and shows the text toolbar
      selectWidget(el);
    } else {
      // Deselecting: hide text toolbar and show background toolbar
      hideToolbar();
      showBgToolbar();
      bgToolbarOpenedTs = (window.performance?.now?.() || Date.now());
    }
  });
  grid.on("dragstart", () => {
    grid.bboxManager?.hide?.();
    actionBar.style.display = "none";
  });
  grid.on("resizestart", () => {
    actionBar.style.display = "none";
  });
  grid.on("dragstop", () => {
    grid.bboxManager?.show?.();
    if (state.activeWidgetEl) selectWidget(state.activeWidgetEl);
  });
  grid.on("resizestop", () => {
    if (state.activeWidgetEl) selectWidget(state.activeWidgetEl);
  });


  document.addEventListener('click', e => {
    if (!state.activeWidgetEl) return;
    if (
      e.target.closest('.canvas-item') === state.activeWidgetEl ||
      e.target.closest('.widget-action-bar') ||
      e.target.closest('.text-block-editor-toolbar') ||
      e.target.closest('.bg-editor-toolbar') ||
      e.target.closest('.color-picker')
    ) {
      return;
    }
    actionBar.style.display = 'none';
    state.activeWidgetEl.classList.remove('selected');
    state.activeWidgetEl.dispatchEvent(new Event('deselected'));
    state.activeWidgetEl = null;
    hideToolbar();
  grid.clearSelection();
  });

  // Show background toolbar when clicking on background (content/grid), not on a widget/UI
  const contentClickHandler = e => {
    const inPreview = document.body.classList.contains('preview-mode');
    if (inPreview) { BGLOG('skip: preview-mode contentDown'); return; }
    const isUi = e.target.closest('.canvas-item') ||
                 e.target.closest('.widget-action-bar') ||
                 e.target.closest('.text-block-editor-toolbar') ||
                 e.target.closest('.bg-editor-toolbar') ||
                 e.target.closest('.color-picker') ||
                 e.target.closest('.builder-header') ||
                 e.target.closest('.layout-bar') ||
                 e.target.closest('.builder-sidebar');
    BGLOG('contentDown', { target: e.target, isUi: !!isUi });
    if (isUi) return;
    hideToolbar();
    showBgToolbar();
    bgToolbarOpenedTs = (window.performance?.now?.() || Date.now());
    BGLOG('bgToolbar show via contentDown', { ts: bgToolbarOpenedTs });
  };
  // Prefer pointerdown for consistency and to avoid race with global click hide
  gridEl.addEventListener('pointerdown', contentClickHandler);
  const contentRoot = document.getElementById('content');
  if (contentRoot && contentRoot !== gridEl) contentRoot.addEventListener('pointerdown', contentClickHandler);
  BGLOG('listeners attached: pointerdown on #builderGrid and #content');

  // Capture-phase handler to catch clicks swallowed by other listeners
  const captureBackgroundIntent = e => {
    if (document.body.classList.contains('preview-mode')) { BGLOG('skip: preview-mode capture'); return; }
    let inContent = e.target.closest('#content');
    // If an overlay outside #content captures the event, fall back to hit-testing #builderGrid bounds
    if (!inContent) {
      const gridRect = gridEl?.getBoundingClientRect?.();
      const cx = (e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? -1);
      const cy = (e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? -1);
      if (gridRect && cx >= gridRect.left && cx <= gridRect.right && cy >= gridRect.top && cy <= gridRect.bottom) {
        inContent = true;
      }
      BGLOG('capture hit-test', { cx, cy, gridRect, inContent: !!inContent });
    }
    if (!inContent) return;
    const isUi = e.target.closest('.canvas-item') ||
                 e.target.closest('.widget-action-bar') ||
                 e.target.closest('.text-block-editor-toolbar') ||
                 e.target.closest('.bg-editor-toolbar') ||
                 e.target.closest('.color-picker') ||
                 e.target.closest('.builder-header') ||
                 e.target.closest('.layout-bar') ||
                 e.target.closest('.builder-sidebar');
    BGLOG('capture pointerdown', { target: e.target, isUi: !!isUi });
    if (isUi) return;
    hideToolbar();
    showBgToolbar();
    bgToolbarOpenedTs = (window.performance?.now?.() || Date.now());
    BGLOG('bgToolbar show via capture', { ts: bgToolbarOpenedTs });
  };
  document.addEventListener('pointerdown', captureBackgroundIntent, true);

  // Hide background toolbar when clicking outside of canvas/toolbar
  document.addEventListener('click', e => {
    if (!document.getElementById('builderGrid')) return;
    const insideBgToolbar = e.target.closest('.bg-editor-toolbar');
    const insideGrid = e.target.closest('#builderGrid');
    const insidePicker = e.target.closest('.color-picker');
    const insideTextTb = e.target.closest('.text-block-editor-toolbar');
    if (insideBgToolbar || insidePicker || insideTextTb) { BGLOG('global click inside UI, ignore', { insideBgToolbar: !!insideBgToolbar, insidePicker: !!insidePicker, insideTextTb: !!insideTextTb }); return; }
    // If we just opened the BG toolbar on this interaction, skip the immediate hide
    const now = (window.performance?.now?.() || Date.now());
    const delta = now - bgToolbarOpenedTs;
    if (delta < 250) { BGLOG('global click within suppress window', { delta }); return; }
    const insideViewport = e.target.closest('#builderViewport');
    if (!insideViewport) { BGLOG('global click outside viewport -> hide bgToolbar'); hideBgToolbar(); }
    else { BGLOG('global click inside viewport, keep bgToolbar', { insideGrid: !!insideGrid }); }
  });

  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 50;


  function undo() {
    if (undoTextCommand()) return;
    if (undoStack.length < 2) return;
    const current = undoStack.pop();
    redoStack.push(current);
    const prev = JSON.parse(undoStack[undoStack.length - 1]);
    applyLayout(prev, { gridEl, grid, codeMap: ensureCodeMap(), allWidgets, layerIndex: activeLayer, iconMap: ICON_MAP });
    if (pageId && autosaveEnabled) scheduleAutosave();
  }

  function redo() {
    if (redoTextCommand()) return;
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(next);
    const layout = JSON.parse(next);
    applyLayout(layout, { gridEl, grid, codeMap: ensureCodeMap(), allWidgets, layerIndex: activeLayer, iconMap: ICON_MAP });
    if (pageId && autosaveEnabled) scheduleAutosave();
  }

  function startAutosave() {
    startAutosaveFn(state, opts => saveLayout(opts, saveLayoutCtx));
  }

  async function saveCurrentLayout(opts = {}) {
    await saveLayout(opts, { ...saveLayoutCtx, ...state });
  }

  let initialLayout = [];
  let pageData = null;
  if (pageId) {
    try {
      const layoutRes = await meltdownEmit('getLayoutForViewport', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        moduleType: 'core',
        pageId,
        lane: 'public',
        viewport: 'desktop'
      });
      initialLayout = Array.isArray(layoutRes?.layout) ? layoutRes.layout : [];

      const pageRes = await meltdownEmit('getPageById', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'pagesManager',
        moduleType: 'core',
        pageId
      });
      pageData = pageRes?.data ?? pageRes ?? null;

      try {
        const globalRes = await meltdownEmit('getGlobalLayoutTemplate', {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'plainspace',
          moduleType: 'core'
        });
        layoutLayers[0].layout = Array.isArray(globalRes?.layout) ? globalRes.layout : [];
        globalLayoutName = globalRes?.name || null;
      } catch (err) {
        console.warn('[Designer] failed to load global layout', err);
      }
    } catch (err) {
      console.error('[Designer] load layout or page error', err);
    }
  }
  else {
    if (layoutNameParam) {
      try {
        const tplRes = await meltdownEmit('getLayoutTemplate', {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'plainspace',
          moduleType: 'core',
          name: layoutNameParam
        });
        initialLayout = Array.isArray(tplRes?.layout) ? tplRes.layout : [];
      } catch (err) {
        console.warn('[Designer] failed to load layout template', err);
      }
    }
    try {
      const globalRes = await meltdownEmit('getGlobalLayoutTemplate', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        moduleType: 'core'
      });
      layoutLayers[0].layout = Array.isArray(globalRes?.layout) ? globalRes.layout : [];
      globalLayoutName = globalRes?.name || null;
    } catch (err) {
      console.warn('[Designer] failed to load global layout', err);
    }
  }




  layoutLayers[1].layout = initialLayout;
  applyCompositeLayout(activeLayer);
  markInactiveWidgets();
  pushState(undoStack, redoStack, initialLayout);

  gridEl.addEventListener('dragover',  e => { e.preventDefault(); gridEl.classList.add('drag-over'); });
  gridEl.addEventListener('dragleave', () => gridEl.classList.remove('drag-over'));
  gridEl.addEventListener('drop', async e => {
    e.preventDefault();
    gridEl.classList.remove('drag-over');
    const widgetId = e.dataTransfer.getData('text/plain');
    const widgetDef = allWidgets.find(w => w.id === widgetId);
    if (!widgetDef) return;

    const rect = gridEl.getBoundingClientRect();
    let relX = 0, relY = 0;
    if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
      relX = e.clientX - rect.left;
      relY = e.clientY - rect.top;
    } else if (e.touches && e.touches[0]) {
      relX = e.touches[0].clientX - rect.left;
      relY = e.touches[0].clientY - rect.top;
    } else {
      relX = (e.offsetX || 0) - rect.left;
      relY = (e.offsetY || 0) - rect.top;
    }
    const columnCount = grid.options.columns || 12;
    const [x, y, w, h] = [
      Math.floor((relX / rect.width) * columnCount) || 0,
      Math.floor(relY / grid.options.cellHeight) || 0,
      4,
      DEFAULT_ROWS
    ];

    const instId = genId();

    const wrapper = document.createElement('div');
    wrapper.classList.add('canvas-item');
    wrapper.id = `widget-${instId}`;
    wrapper.dataset.widgetId = widgetDef.id;
    wrapper.dataset.instanceId = instId;
    wrapper.dataset.layer = String(activeLayer);
    wrapper.dataset.x = x;
    wrapper.dataset.y = y;
    wrapper.style.zIndex = String(activeLayer);
    wrapper.setAttribute('gs-w', w);
    wrapper.setAttribute('gs-h', h);
    wrapper.setAttribute('gs-min-w', 1);
    wrapper.setAttribute('gs-min-h', DEFAULT_ROWS);

    const content = document.createElement('div');
    content.className = 'canvas-item-content builder-themed';
    content.innerHTML = `${getWidgetIcon(widgetDef, ICON_MAP)}<span>${widgetDef.metadata?.label || widgetDef.id}</span>`;
    wrapper.appendChild(content);
    attachRemoveButton(wrapper);
    const editBtn2 = attachEditButton(wrapper, widgetDef);
    const localCodeMap = ensureCodeMap(); // reuse existing codeMap
    attachOptionsMenu(wrapper, widgetDef, editBtn2, {
      grid,
      pageId,
      scheduleAutosave,
      activeLayer,
      codeMap: localCodeMap,
      genId,
    });
    attachLockOnClick(wrapper);
    gridEl.appendChild(wrapper);
    grid.makeWidget(wrapper);

    /* --------  Neu: automatisch auswählen  --------------------------- */
    selectWidget(wrapper);          // ruft Action-Bar & widgetSelected

    renderWidget(wrapper, widgetDef, localCodeMap);
    markInactiveWidgets();
    if (pageId) scheduleAutosave();
  });

  const topBar = await loadHeaderPartial();
  const backBtn = topBar.querySelector('.builder-back-btn');
  if (backBtn) backBtn.addEventListener('click', () => history.back());

  const layoutName =
    layoutNameParam ||
    pageData?.meta?.layoutTemplate ||
    pageData?.title ||
    'default';

  const nameInput = topBar.querySelector('#layoutNameInput');
  if (nameInput) {
    try { nameInput.value = layoutName; } catch (_) {}
  }

  const viewportBtn = document.createElement('button');
  viewportBtn.id = 'viewportControlBtn';
  viewportBtn.className = 'builder-viewport-btn';
  viewportBtn.innerHTML = window.featherIcon
    ? window.featherIcon('monitor')
    : '<img src="/assets/icons/monitor.svg" alt="Viewport" />';
  topBar.appendChild(viewportBtn);

  const viewportPanel = document.createElement('div');
  viewportPanel.className = 'viewport-slider';
  viewportPanel.style.display = 'none';
  const viewportRange = document.createElement('input');
  viewportRange.type = 'range';
  viewportRange.min = '320';
  viewportRange.max = '3840';
  viewportRange.step = '10';
  viewportRange.className = 'viewport-range';
  const viewportValue = document.createElement('span');
  viewportValue.className = 'viewport-value';
  viewportPanel.appendChild(viewportRange);
  viewportPanel.appendChild(viewportValue);

  const DEFAULT_VIEWPORT = 1920;
  function setViewportWidth(val) {
    gridEl.style.width = `${val}px`;
    gridEl.style.margin = '0 auto';
    viewportValue.textContent = `${val}px`;
    viewportSizeEl.textContent = `${val}px`;
    if (grid && typeof grid.setScale === 'function') {
      const current = grid.scale || parseFloat(
        getComputedStyle(gridEl).getPropertyValue('--canvas-scale') || '1'
      );
      grid.setScale(current);
    }
  }

  viewportRange.value = String(DEFAULT_VIEWPORT);
  setViewportWidth(DEFAULT_VIEWPORT);

  // Popin handling for viewport slider (similar to header menu)
  function hideViewportPanel() {
    viewportPanel.style.display = 'none';
    document.removeEventListener('click', outsideViewportHandler);
  }

  function outsideViewportHandler(e) {
    if (!viewportPanel.contains(e.target) && e.target !== viewportBtn) hideViewportPanel();
  }

  viewportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (viewportPanel.style.display === 'block') { hideViewportPanel(); return; }

    // Show and position under the icon
    viewportPanel.style.display = 'block';
    viewportPanel.style.visibility = 'hidden';
    const rect = viewportBtn.getBoundingClientRect();
    const top = rect.bottom + 4 + (window.scrollY || document.documentElement.scrollTop || 0);
    viewportPanel.style.top = `${top}px`;
    // Temporarily set left to compute width, then adjust to keep inside viewport
    const scrollX = (window.scrollX || document.documentElement.scrollLeft || 0);
    let left = rect.left + scrollX;
    // Ensure the panel is in the document so offsetWidth is measurable
    // (panel gets appended later in this function's flow)
    const panelWidth = viewportPanel.offsetWidth || 0;
    const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
    if (left > maxLeft) left = maxLeft;
    viewportPanel.style.left = `${left}px`;
    viewportPanel.style.visibility = '';
    document.addEventListener('click', outsideViewportHandler);
  });

  viewportRange.addEventListener('input', () => {
    const val = parseInt(viewportRange.value, 10);
    if (Number.isFinite(val)) setViewportWidth(val);
  });

  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      const width = Math.round(entry.contentRect.width);
      viewportRange.value = String(width);
      viewportValue.textContent = `${width}px`;
      viewportSizeEl.textContent = `${width}px`;
    });
    resizeObserver.observe(gridEl);
  }

  // Reuse buttons from the loaded partial
  const headerActions = topBar.querySelector('.header-actions') || topBar;
  const saveBtn = topBar.querySelector('#saveLayoutBtn');
  const previewBtn = topBar.querySelector('#previewLayoutBtn');
  const publishBtn = topBar.querySelector('#publishLayoutBtn');

  // Wrap save button to attach autosave dropdown like before
  const saveWrapper = document.createElement('div');
  saveWrapper.className = 'builder-save-wrapper';
  if (saveBtn) {
    headerActions.insertBefore(saveWrapper, saveBtn);
    saveWrapper.appendChild(saveBtn);
  } else {
    headerActions.appendChild(saveWrapper);
  }

  const saveMenuBtn = document.createElement('button');
  saveMenuBtn.className = 'builder-save-dropdown-toggle';
  saveMenuBtn.innerHTML = window.featherIcon
    ? window.featherIcon('chevron-down')
    : '<img src="/assets/icons/chevron-down.svg" alt="more" />';
  saveWrapper.appendChild(saveMenuBtn);

  const saveDropdown = document.createElement('div');
  saveDropdown.className = 'builder-save-dropdown';
  saveDropdown.innerHTML = '<label class="autosave-option"><input type="checkbox" class="autosave-toggle" checked /> Autosave</label>';
  saveWrapper.appendChild(saveDropdown);

  const headerMenuBtn = document.createElement('button');
  headerMenuBtn.className = 'builder-menu-btn';
  headerMenuBtn.innerHTML = window.featherIcon
    ? window.featherIcon('more-vertical')
    : '<img src="/assets/icons/ellipsis-vertical.svg" alt="menu" />';
  topBar.appendChild(headerMenuBtn);

  const headerMenu = document.createElement('div');
  headerMenu.className = 'builder-options-menu';
  headerMenu.innerHTML = `
    <button class="menu-undo"><img src="/assets/icons/rotate-ccw.svg" class="icon" alt="undo" /> Undo</button>
    <button class="menu-redo"><img src="/assets/icons/rotate-cw.svg" class="icon" alt="redo" /> Redo</button>
    <label class="menu-pro"><input type="checkbox" class="pro-toggle" checked /> Pro Mode</label>
  `;
  headerMenu.style.display = 'none';
  document.body.appendChild(headerMenu);

  function hideHeaderMenu() {
    headerMenu.style.display = 'none';
    document.removeEventListener('click', outsideHeaderHandler);
  }

  function outsideHeaderHandler(e) {
    if (!headerMenu.contains(e.target) && e.target !== headerMenuBtn) hideHeaderMenu();
  }

  headerMenuBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (headerMenu.style.display === 'block') { hideHeaderMenu(); return; }
    headerMenu.style.display = 'block';
    headerMenu.style.visibility = 'hidden';
    const rect = headerMenuBtn.getBoundingClientRect();
    headerMenu.style.top = `${rect.bottom + 4}px`;
    headerMenu.style.left = `${rect.right - headerMenu.offsetWidth}px`;
    headerMenu.style.visibility = '';
    document.addEventListener('click', outsideHeaderHandler);
  });

  // (no persistent viewport selector in header)

  headerMenu.querySelector('.menu-undo').addEventListener('click', () => { hideHeaderMenu(); undo(); });
  headerMenu.querySelector('.menu-redo').addEventListener('click', () => { hideHeaderMenu(); redo(); });
  const proToggle = headerMenu.querySelector('.pro-toggle');
  proToggle.checked = proMode;
  proToggle.addEventListener('change', () => {
    proMode = proToggle.checked;
    applyProMode();
  });

  saveMenuBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (saveDropdown.style.display === 'block') { hideSaveDropdown(); return; }
    saveDropdown.style.display = 'block';
    document.addEventListener('click', outsideSaveHandler);
  });

  function hideSaveDropdown() {
    saveDropdown.style.display = 'none';
    document.removeEventListener('click', outsideSaveHandler);
  }

  function outsideSaveHandler(e) {
    if (!saveWrapper.contains(e.target)) hideSaveDropdown();
  }

  const autosaveToggle = saveDropdown.querySelector('.autosave-toggle');
  autosaveToggle.checked = state.autosaveEnabled;
  autosaveToggle.addEventListener('change', () => {
    state.autosaveEnabled = autosaveToggle.checked;
    startAutosaveFn(state, saveLayoutCtx);
  });

  // Header already injected by loadHeaderPartial();
  // Attach viewport slider popin to body so it can float above header
  document.body.appendChild(viewportPanel);

  // (no extra style injection)

  startAutosave();
  applyProMode();
  buildLayoutBar();

  async function capturePreview() {
    if (!gridEl) return '';
    try {
      const toPng = await loadToPng();
      return await toPng(gridEl, { cacheBust: true });
    } catch (err) {
      console.error('[Designer] preview capture error', err);
      return '';
    }
  }

  saveBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) { alert('Enter a name'); return; }
    updateAllWidgetContents();
    const layout = getCurrentLayoutForLayer(gridEl, activeLayer, ensureCodeMap());
    const previewPath = await capturePreview();
    try {
      await meltdownEmit('saveLayoutTemplate', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        name,
        lane: 'public',
        viewport: 'desktop',
        layout,
        previewPath
      });

      const targetIds = pageId ? [pageId] : [];

      const events = targetIds.map(id => ({
        eventName: 'saveLayoutForViewport',
        payload: {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'plainspace',
          moduleType: 'core',
          pageId: id,
          lane: 'public',
          viewport: 'desktop',
          layout
        }
      }));

      await meltdownEmitBatch(events);

      alert('Layout template saved');
    } catch (err) {
      console.error('[Designer] saveLayoutTemplate error', err);
      alert('Save failed: ' + err.message);
    }
  });

  previewBtn.addEventListener('click', () => {
    const active = document.body.classList.toggle('preview-mode');
    if (window.featherIcon) {
      previewBtn.innerHTML = window.featherIcon(active ? 'eye-off' : 'eye');
    } else {
      const icon = active ? 'eye-off' : 'eye';
      previewBtn.innerHTML = `<img src="/assets/icons/${icon}.svg" alt="Preview" />`;
    }
    if (active) {
      showPreviewHeader();
    } else {
      hidePreviewHeader();
    }
  });

// publish flow handled by popup defined below

const publishPopup = document.getElementById('publishPanel');
publishPopup.classList.add('hidden');
let slugInput;
let suggestionsEl;
let warningEl;
let draftWrap;
let draftCb;
let infoEl;
let draftNote;
let confirmBtn;
let closeBtn;
let selectedPage = null;
let creatingPage = false;
try {
  const html = await fetchPartial('publish-panel', 'builder');
  publishPopup.innerHTML = sanitizeHtml(html);
} catch (err) {
  console.warn('[Designer] Failed to load publish panel:', err);
  publishPopup.innerHTML = `
  <button class="publish-close" type="button" aria-label="Close">&times;</button>
  <label class="publish-slug-label">Subpath
    <input type="text" class="publish-slug-input" />
  </label>
  <div class="publish-suggestions"></div>
  <div class="publish-warning hidden"></div>
  <label class="publish-draft hidden"><input type="checkbox" class="publish-draft-checkbox" /> Create and set page to draft</label>
  <div class="publish-info hidden"></div>
  <div class="publish-actions"><button class="publish-confirm">Publish</button></div>
  <div class="publish-draft-note hidden"></div>
  `;
}
loadPageService();

slugInput = publishPopup.querySelector('.publish-slug-input');
suggestionsEl = publishPopup.querySelector('.publish-suggestions');
warningEl = publishPopup.querySelector('.publish-warning');
draftWrap = publishPopup.querySelector('.publish-draft');
draftCb = publishPopup.querySelector('.publish-draft-checkbox');
infoEl = publishPopup.querySelector('.publish-info');
draftNote = publishPopup.querySelector('.publish-draft-note');
confirmBtn = publishPopup.querySelector('.publish-confirm');
closeBtn = publishPopup.querySelector('.publish-close');

function positionPublishPopup() {
  const rect = publishBtn.getBoundingClientRect();
  const top = `${rect.bottom}px`;
  const height = `calc(100% - ${rect.bottom}px)`;
  publishPopup.style.top = top;
  publishPopup.style.height = height;
}

function showPublishPopup() {
  positionPublishPopup();
  publishPopup.classList.remove('hidden');
  slugInput.focus();
}

function hidePublishPopup() {
  publishPopup.classList.add('hidden');
}

window.addEventListener('resize', () => {
  if (!publishPopup.classList.contains('hidden')) positionPublishPopup();
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

async function lookupPages(q) {
  try {
    const res = await meltdownEmit('searchPages', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'pagesManager',
      moduleType: 'core',
      query: q,
      lane: 'all',
      limit: 10
    });
    const pages = Array.isArray(res) ? res : (res.pages || res.rows || []);
    return pages;
  } catch (err) {
    console.warn('searchPages failed', err);
    return [];
  }
}

slugInput.addEventListener('input', async () => {
  const qRaw = slugInput.value.trim();
  const q = sanitizeSlug(qRaw);
  selectedPage = null;
  creatingPage = false;
  suggestionsEl.innerHTML = '';
  warningEl.classList.add('hidden');
  infoEl.classList.add('hidden');
  draftWrap.classList.add('hidden');
  draftNote.classList.add('hidden');
  if (!q) return;
  const pages = await lookupPages(q);
  const suggestions = pages.map(p =>
    `<div class="publish-suggestion" data-id="${p.id}" data-slug="${escapeHtml(p.slug)}">/${escapeHtml(p.slug)}</div>`
  ).join('');
  const exists = pages.some(p => p.slug === q);
  suggestionsEl.innerHTML = suggestions + (exists ? '' : '<div class="publish-add">+ Add page</div>');
  if (!exists) {
    creatingPage = true;
    infoEl.textContent = 'Page will be created and design attached.';
    infoEl.classList.remove('hidden');
    draftWrap.classList.remove('hidden');
  }
});

suggestionsEl.addEventListener('click', async e => {
  const el = e.target.closest('.publish-suggestion');
  if (!el) return;
  slugInput.value = el.dataset.slug;
  suggestionsEl.innerHTML = '';
  try {
    const res = await meltdownEmit('getPageById', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'pagesManager',
      moduleType: 'core',
      pageId: Number(el.dataset.id)
    });
    const page = res?.data ?? res;
    selectedPage = page || null;
    creatingPage = false;
    infoEl.classList.add('hidden');
    draftWrap.classList.add('hidden');
    draftNote.classList.add('hidden');
    if (page && page.status !== 'published') {
      warningEl.textContent = 'Selected page is a draft';
      warningEl.classList.remove('hidden');
    } else {
      warningEl.classList.add('hidden');
    }
  } catch (err) {
    console.warn('getPageById failed', err);
  }
});

draftCb.addEventListener('change', () => {
  if (draftCb.checked) {
    draftNote.textContent = 'Page will be created as draft and will not be publicly accessible.';
    draftNote.classList.remove('hidden');
  } else {
    draftNote.classList.add('hidden');
  }
});

  publishBtn.addEventListener('click', () => {
    if (publishPopup.classList.contains('hidden')) {
      showPublishPopup();
    } else {
      hidePublishPopup();
    }
  });
  closeBtn.addEventListener('click', hidePublishPopup);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !publishPopup.classList.contains('hidden')) {
      hidePublishPopup();
    }
  });

async function runPublish(subSlug) {
  const name = nameInput.value.trim();
  if (!name) { alert('Enter a name'); return; }
  updateAllWidgetContents();
  const layout = getCurrentLayoutForLayer(gridEl, activeLayer, ensureCodeMap());
  const previewPath = await capturePreview();
  const safeName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '_');
  const normalizedSubPath = subSlug
    ? (subSlug.startsWith('builder/') ? subSlug : `builder/${subSlug}`)
    : `builder/${safeName}`;

  const gridClone = gridEl ? gridEl.cloneNode(true) : null;
  const externalStyles = [];
  const externalScripts = [];
  let jsContent = '';
  let cssContent = '';
  let bodyHtml = '';
  if (gridClone) {
    gridClone.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
      if (l.href) externalStyles.push(l.href);
      l.remove();
    });
    gridClone.querySelectorAll('script').forEach(s => {
      if (s.src) {
        externalScripts.push(s.src);
      } else {
        jsContent += s.textContent + '\n';
      }
      s.remove();
    });
    gridClone.querySelectorAll('style').forEach(st => {
      cssContent += st.textContent + '\n';
      st.remove();
    });
    bodyHtml = gridClone.innerHTML;
  }

  const theme = window.ACTIVE_THEME || 'default';
  const headLinks = [
    `<link rel="canonical" href="/${subSlug || `p/${safeName}`}">`,
    `<link rel="stylesheet" href="/themes/${theme}/theme.css">`,
    ...externalStyles.map(href => `<link rel="stylesheet" href="${href}">`)
  ];
  if (cssContent.trim()) headLinks.push('<link rel="stylesheet" href="style.css">');

  const tailScripts = [
    `<script src="/themes/${theme}/theme.js"></script>`,
    '<script src="/build/meltdownEmitter.js"></script>',
    '<script type="module" src="/assets/js/faviconLoader.js"></script>',
    '<script type="module" src="/assets/js/fontsLoader.js"></script>',
    '<script type="module" src="/assets/js/customSelect.js"></script>',
    '<script src="/assets/js/openExplorer.js"></script>',
    ...externalScripts.map(src => `<script src="${src}"></script>`),
    '<script type="module" src="/plainspace/main/pageRenderer.js"></script>'
  ];
  if (jsContent.trim()) tailScripts.splice(-1, 0, '<script src="script.js"></script>');

  const safeTitle = name.replace(/[<>\"]/g, c => ({'<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const indexHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${safeTitle}</title>${headLinks.join('')}</head><body><div class="app-scope"><div id="content">${bodyHtml}</div></div>${tailScripts.join('')}</body></html>`;

  const files = [{ fileName: 'index.html', data: indexHtml }];
  if (jsContent.trim()) files.push({ fileName: 'script.js', data: jsContent });
  if (cssContent.trim()) files.push({ fileName: 'style.css', data: cssContent });
  let existingMeta = null;
  try {
    existingMeta = await meltdownEmit('getPublishedDesignMeta', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'plainspace',
      moduleType: 'core',
      name
    });
  } catch (err) {
    console.warn('[Designer] getPublishedDesignMeta', err);
  }
  try {
    await meltdownEmit('deleteLocalItem', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'mediaManager',
      moduleType: 'core',
      currentPath: existingMeta?.path ? existingMeta.path.split('/').slice(0, -1).join('/') : 'builder',
      itemName: existingMeta?.path ? existingMeta.path.split('/').pop() : safeName
    });
  } catch (err) {
    console.warn('[Designer] deleteLocalItem', err);
  }
  await meltdownEmit('saveLayoutTemplate', {
    jwt: window.ADMIN_TOKEN,
    moduleName: 'plainspace',
    name,
    lane: 'public',
    viewport: 'desktop',
    layout,
    previewPath
  });
  for (const f of files) {
    await meltdownEmit('uploadFileToFolder', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'mediaManager',
      moduleType: 'core',
      subPath: normalizedSubPath,
      fileName: f.fileName,
      fileData: btoa(unescape(encodeURIComponent(f.data)))
    });
  }
  const currentUserId = getAdminUserId();
  await meltdownEmit('makeFilePublic', {
    jwt: window.ADMIN_TOKEN,
    moduleName: 'mediaManager',
    moduleType: 'core',
    filePath: normalizedSubPath,
    ...(currentUserId ? { userId: currentUserId } : {})
  });
  await meltdownEmit('savePublishedDesignMeta', {
    jwt: window.ADMIN_TOKEN,
    moduleName: 'plainspace',
    moduleType: 'core',
    name,
    path: normalizedSubPath,
    files: files.map(f => f.fileName)
  });
}

confirmBtn.addEventListener('click', async () => {
  await loadPageService();
  const slug = sanitizeSlug(slugInput.value.trim());
  if (!slug) { alert('Enter a subpath'); return; }
  try {
    const name = nameInput.value.trim();
    if (creatingPage) {
      const newPage = await pageService.create({
        title: name || slug,
        slug,
        status: draftCb.checked ? 'draft' : 'published'
      });
      if (newPage?.id) {
        await pageService.update(newPage, {
          meta: { ...(newPage.meta || {}), layoutTemplate: name }
        });
      }
    } else if (selectedPage) {
      const patch = { meta: { ...(selectedPage.meta || {}), layoutTemplate: name }, status: 'published' };
      await pageService.update(selectedPage, patch);
    }
    await runPublish(slug);
    hidePublishPopup();
  } catch (err) {
    console.error('[Designer] publish flow error', err);
    alert('Publish failed: ' + err.message);
  }
});
  let versionEl = document.getElementById('builderVersion');
  if (!versionEl) {
    versionEl = document.createElement('div');
    versionEl.id = 'builderVersion';
    versionEl.className = 'builder-version';
    document.body.appendChild(versionEl);
  }

  const builderVersion = window.PLAINSPACE_VERSION;

  if (builderVersion) {
    versionEl.textContent = `${builderVersion} builder still in alpha expect breaking changes`;
  } else {
    versionEl.textContent = 'builder still in alpha expect breaking changes';
  }

  function saveActiveLayer() {
    layoutLayers[activeLayer].layout = getCurrentLayoutForLayer(gridEl, activeLayer, ensureCodeMap());
  }

  function updateLayoutBar() {
    if (!layoutBar) return;
    layoutBar.querySelectorAll('button').forEach((btn, idx) => {
      btn.classList.toggle('active', idx === activeLayer);
    });
  }

  function markInactiveWidgets() {
    gridEl.querySelectorAll('.canvas-item').forEach(el => {
      const inactive = String(el.dataset.layer) !== String(activeLayer);
      if (inactive) {
        el.classList.add('inactive-layer');
        el.title = 'Change layer to edit this widget';
      } else {
        el.classList.remove('inactive-layer');
        el.removeAttribute('title');
      }
      if (inactive) {
        el.setAttribute('gs-no-move', 'true');
        el.setAttribute('gs-no-resize', 'true');
        if (el.getAttribute('contenteditable') === 'true') {
          el.dataset.prevContentEditable = 'true';
        }
        el.setAttribute('contenteditable', 'false');
      } else {
        el.removeAttribute('gs-no-move');
        el.removeAttribute('gs-no-resize');
        if (el.dataset.prevContentEditable === 'true') {
          el.setAttribute('contenteditable', 'true');
          delete el.dataset.prevContentEditable;
        } else {
          el.removeAttribute('contenteditable');
        }
      }
    });
  }

  function applyCompositeLayout(idx) {
    if (grid && typeof grid.removeAll === 'function') {
      grid.removeAll();
    } else {
      gridEl.innerHTML = '';
    }
    Object.keys(ensureCodeMap()).forEach(k => delete codeMap[k]);
    for (let i = 0; i <= idx; i++) {
      applyLayout(layoutLayers[i].layout, {
        gridEl,
        grid,
        codeMap: ensureCodeMap(),
        allWidgets,
        append: i !== 0,
        layerIndex: i,
        iconMap: ICON_MAP
      });
    }
    markInactiveWidgets();
  }

  function switchLayer(idx) {
    if (idx === activeLayer) return;
    saveActiveLayer();
    activeLayer = idx;
    document.body.dataset.activeLayer = String(activeLayer);
    applyCompositeLayout(idx);
    updateLayoutBar();
  }

  function buildLayoutBar() {
    if (layoutName === globalLayoutName) return;
    layoutBar = document.createElement('div');
    layoutBar.className = 'layout-bar';

    // Layer buttons
    layoutLayers.forEach((layer, idx) => {
      const btn = document.createElement('button');
      btn.textContent = idx === 0 ? 'Global' : `Layer ${idx}`;
      if (idx === activeLayer) btn.classList.add('active');
      btn.addEventListener('click', () => switchLayer(idx));
      layoutBar.appendChild(btn);
    });

    // Zoom controls (10% � 500%, default 100%)
    const zoomWrap = document.createElement('div');
    zoomWrap.className = 'zoom-controls';
    const zoomOut = document.createElement('button');
    zoomOut.title = 'Zoom out';
    zoomOut.innerHTML = window.featherIcon ? window.featherIcon('minus') : '<img src="/assets/icons/zoom-out.svg" alt="-" />';
    const zoomLevel = document.createElement('span');
    zoomLevel.className = 'zoom-level';
    const zoomSlider = document.createElement('input');
    zoomSlider.type = 'range';
    zoomSlider.min = '10';
    zoomSlider.max = '500';
    zoomSlider.step = '1';
    zoomSlider.value = '100';
    zoomSlider.style.width = '180px';
    const zoomIn = document.createElement('button');
    zoomIn.title = 'Zoom in';
    zoomIn.innerHTML = window.featherIcon ? window.featherIcon('plus') : '<img src="/assets/icons/zoom-in.svg" alt="+" />';

    let zoomPct = 100;
    function applyZoom(pct) {
      zoomPct = Math.max(10, Math.min(500, Math.round(pct)));
      zoomSlider.value = String(zoomPct);
      zoomLevel.textContent = `${zoomPct}%`;
      const scale = zoomPct / 100;
      if (grid && typeof grid.setScale === 'function') {
        // Let CanvasGrid manage transforms and CSS vars
        grid.setScale(scale);
      } else if (gridEl) {
        // Fallback: apply transform directly
        gridEl.style.transformOrigin = 'center center';
        gridEl.style.transform = `scale(${scale})`;
        gridEl.style.setProperty('--canvas-scale', String(scale));
        gridEl.dispatchEvent(new Event('zoom', { bubbles: true }));
      }
    }
    // Initial zoom
    applyZoom(100);

    zoomOut.addEventListener('click', () => applyZoom(zoomPct - 10));
    zoomIn.addEventListener('click', () => applyZoom(zoomPct + 10));
    zoomSlider.addEventListener('input', () => applyZoom(parseInt(zoomSlider.value, 10) || 100));

    // Sync UI when zoom changes via Ctrl+Wheel on the grid
    gridEl.addEventListener('zoom', () => {
      const sc = parseFloat(
        getComputedStyle(gridEl).getPropertyValue('--canvas-scale') || '1'
      );
      const pct = Math.round(sc * 100);
      zoomPct = pct;
      zoomSlider.value = String(pct);
      zoomLevel.textContent = `${pct}%`;
    });

    zoomWrap.appendChild(zoomOut);
    zoomWrap.appendChild(zoomSlider);
    zoomWrap.appendChild(zoomLevel);
    zoomWrap.appendChild(zoomIn);
    layoutBar.appendChild(zoomWrap);

    (footer || document.body).appendChild(layoutBar);
  }

}
