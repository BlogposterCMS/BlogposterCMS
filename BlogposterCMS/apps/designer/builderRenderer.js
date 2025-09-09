
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
import { initGrid, getCurrentLayout, getCurrentLayoutForLayer, pushState as pushHistoryState } from './managers/gridManager.js';
import { applyLayout, getItemData } from './managers/layoutManager.js';
import { registerDeselect } from './managers/eventManager.js';
import { attachEditButton, attachRemoveButton, attachLockOnClick, attachOptionsMenu, renderWidget } from './managers/widgetManager.js';
import { designerState } from './managers/designerState.js';
import { deserializeLayout } from './editor/modes/splitMode.js';

import { addHitLayer, applyDesignerTheme, executeJs } from './utils.js';

const historyByDesign = {};

function setDefaultWorkarea(root) {
  if (!root) return;
  if (root.querySelector('.layout-container[data-workarea="true"]')) return;
  const all = Array.from(root.querySelectorAll('.layout-container'));
  const candidates = all.filter(el => el.dataset.split !== 'true');
  const containers = candidates.length ? candidates : all.slice(0, 1);
  let largest = null;
  let maxArea = 0;
  for (const el of containers) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      largest = el;
    }
  }
  if (!largest && containers.length) {
    largest = containers[0];
  }
  if (largest) {
    largest.dataset.workarea = 'true';
  }
}

function getHistory(designId) {
  if (!historyByDesign[designId]) {
    historyByDesign[designId] = { undoStack: [], redoStack: [] };
  }
  return historyByDesign[designId];
}

// Debug helper (enable with window.DEBUG_TEXT_EDITOR = true)
function DBG(...args) {
  try { if (window.DEBUG_TEXT_EDITOR) console.log('[TE/builder]', ...args); } catch (e) {}
}
import { createActionBar } from './renderer/actionBar.js';
import { createSaveManager } from './renderer/saveManager.js';
import { registerBuilderEvents } from './renderer/eventHandlers.js';
import { getWidgetIcon, extractCssProps, makeSelector } from './renderer/renderUtils.js';
import { initPublishPanel } from './renderer/publishPanel.js';
import { initHeaderControls } from './renderer/headerControls.js';
import { capturePreview as captureGridPreview } from './renderer/capturePreview.js';

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

export async function initBuilder(sidebarEl, contentEl, pageId = null, startLayer = 1, layoutNameParam = null) {
  document.body.classList.add('builder-mode');
  document.body.style.setProperty('--widget-opacity', String(designerState.defaultOpacity));
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
    { name: 'Layout', layout: [] },
    { name: 'Design', layout: [] }
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
  let layoutRoot;
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
    activeWidgetEl: null,
    designId: null,
    designVersion: 0
  };

  // Pre-seed design identifier and version from data attributes or globals so
  // existing designs update instead of inserting duplicates on first save.
  try {
    const dset = (contentEl && contentEl.dataset) || {};
    const idAttr = dset.designId || document.body.dataset?.designId;
    if (idAttr) state.designId = String(idAttr);
    const verAttr = dset.designVersion || document.body.dataset?.designVersion;
    if (verAttr !== undefined) {
      const ver = parseInt(verAttr, 10);
      if (!Number.isNaN(ver)) state.designVersion = ver;
    }
    const winDesign = window.DESIGN_DATA || window.INITIAL_DESIGN;
    if (!state.designId && winDesign?.id) state.designId = String(winDesign.id);
    if (state.designVersion === 0 && winDesign?.version !== undefined) {
      const v = parseInt(winDesign.version, 10);
      if (!Number.isNaN(v)) state.designVersion = v;
    }
  } catch (err) {
    console.warn('[Designer] failed to preload design metadata', err);
  }

  const genId = () => `w${Math.random().toString(36).slice(2,8)}`;




  let allWidgets = [];
  let loadedDesign = null;
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

  if (!pageId && state.designId) {
    try {
      loadedDesign = await meltdownEmit('designer.getDesign', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'designer',
        moduleType: 'community',
        id: state.designId
      });
      if (loadedDesign?.design && typeof loadedDesign.design === 'object') {
        window.INITIAL_DESIGN = loadedDesign.design;
        if (!state.designVersion && loadedDesign.design.version !== undefined) {
          const v = parseInt(loadedDesign.design.version, 10);
          if (!Number.isNaN(v)) state.designVersion = v;
        }
        if (!state.designId && loadedDesign.design.id) {
          state.designId = String(loadedDesign.design.id);
        }
      }
    } catch (err) {
      console.error('[Designer] failed to load design', err);
    }
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

    // Use a plain builder grid container. CanvasGrid will add its own
  // `canvas-grid` class; avoid `pixel-grid` here so zoom scaling via
  // CSS variable works with the BoundingBoxManager.
  //
  // Wrap the grid in a scrollable viewport so scrollbars live "inside"
  // the designer instead of the page. The separate #workspaceMain hosts the
  // actual canvas content while #builderGrid tracks layout splits.
  contentEl.innerHTML = `
    <div id="builderViewport" class="builder-viewport">
      <div id="workspaceMain" class="builder-grid"></div>
      <div id="layoutRoot" class="layout-root layout-container">
        <div id="builderGrid" class="builder-grid"></div>
      </div>
    </div>
  `;
  layoutRoot = document.getElementById('layoutRoot');
  gridEl = document.getElementById('workspaceMain');
  gridEl.dataset.workarea = 'true';
  const layoutGridEl = document.getElementById('builderGrid');

  // Apply persisted background settings from the initial design payload so
  // backgrounds survive reloads and future saves reuse the same media object.
  try {
    const initialDesign = window.DESIGN_DATA || window.INITIAL_DESIGN;
    if (initialDesign && typeof initialDesign === 'object') {
      if (initialDesign.bg_color) {
        gridEl.style.backgroundColor = String(initialDesign.bg_color);
      }
      if (initialDesign.bg_media_url) {
        const safeUrl = String(initialDesign.bg_media_url).replace(/"/g, '&quot;');
        gridEl.style.backgroundImage = `url("${safeUrl}")`;
        gridEl.style.backgroundSize = 'cover';
        gridEl.style.backgroundRepeat = 'no-repeat';
        gridEl.style.backgroundPosition = 'center';
        gridEl.dataset.bgImageUrl = initialDesign.bg_media_url;
        if (initialDesign.bg_media_id) {
          gridEl.dataset.bgImageId = initialDesign.bg_media_id;
        }
      }
    }
  } catch (err) {
    console.warn('[Designer] failed to apply initial background', err);
  }
  designerState.bgMediaId = gridEl.dataset.bgImageId || '';
  designerState.bgMediaUrl = gridEl.dataset.bgImageUrl || '';

  try {
    const designData = window.DESIGN_DATA || window.INITIAL_DESIGN;
    const layoutData = designData?.layout || designData?.layout_json;
    if (layoutData) {
      const obj = typeof layoutData === 'string' ? JSON.parse(layoutData) : layoutData;
      deserializeLayout(obj, layoutRoot);
    }
  } catch (e) {
    console.warn('[Designer] failed to deserialize layout', e);
  }
  if (!layoutRoot.querySelector('.layout-container')) {
    const div = document.createElement('div');
    div.className = 'layout-container';
    layoutRoot.appendChild(div);
  }
  setDefaultWorkarea(layoutRoot);
  const workareaEl =
    layoutRoot.querySelector('.layout-container[data-workarea="true"]') || layoutRoot;
  if (layoutGridEl.parentNode !== workareaEl) workareaEl.appendChild(layoutGridEl);
  window.addEventListener('resize', () => {
    const wa = layoutRoot.querySelector('.layout-container[data-workarea="true"]') || layoutRoot;
    if (layoutGridEl.parentNode !== wa) wa.appendChild(layoutGridEl);
  });
  const gridViewportEl = document.getElementById('builderViewport');
  const viewportSizeEl = document.createElement('div');
  viewportSizeEl.className = 'viewport-size-display';
  gridViewportEl.appendChild(viewportSizeEl);
  let currentDesignId = null;
  function pushLayoutState(layout) {
    if (!currentDesignId) return;
    const { undoStack, redoStack } = getHistory(currentDesignId);
    pushHistoryState(undoStack, redoStack, layout);
  }
  const { updateAllWidgetContents } = registerBuilderEvents(gridEl, ensureCodeMap(), { getRegisteredEditable });
  const saveLayoutCtx = {
    updateAllWidgetContents,
    getCurrentLayout: () => getCurrentLayoutForLayer(gridEl, activeLayer, ensureCodeMap()),
    pushState: pushLayoutState,
    meltdownEmit,
    pageId,
    codeMap: ensureCodeMap(),
    getLayer: () => activeLayer
  };
  const { scheduleAutosave, startAutosave, saveDesign } = createSaveManager(state, saveLayoutCtx);

  function undo(designId) {
    const { undoStack, redoStack } = getHistory(designId);
    if (undoTextCommand()) return;
    if (undoStack.length < 2) return;
    const current = undoStack.pop();
    redoStack.push(current);
    const prev = JSON.parse(undoStack[undoStack.length - 1]);
    applyLayout(prev, { gridEl, grid, codeMap: ensureCodeMap(), allWidgets, layerIndex: activeLayer, iconMap: ICON_MAP });
    if (pageId && state.autosaveEnabled) scheduleAutosave();
  }

  function redo(designId) {
    const { undoStack, redoStack } = getHistory(designId);
    if (redoTextCommand()) return;
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(next);
    const layout = JSON.parse(next);
    applyLayout(layout, { gridEl, grid, codeMap: ensureCodeMap(), allWidgets, layerIndex: activeLayer, iconMap: ICON_MAP });
    if (pageId && state.autosaveEnabled) scheduleAutosave();
  }

  await applyDesignerTheme();
  // Allow overlapping widgets for layered layouts
  const grid = initGrid(gridEl, state, selectWidget, {
    scrollContainer: gridViewportEl,
    enableZoom: true
  });
  const sizer = grid?.sizer;
  if (sizer && layoutRoot && layoutRoot.parentElement !== sizer) {
    sizer.appendChild(layoutRoot);
  }
  const { actionBar, select: baseSelectWidget } = createActionBar(null, grid, state, () => scheduleAutosave());
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
    grid.on('change', ({ el, contentOnly } = {}) => {
      if (el) {
        // Selecting a widget hides the background toolbar and shows the text toolbar
        selectWidget(el);
      } else {
        // Deselecting: hide text toolbar and show background toolbar
        hideToolbar();
        showBgToolbar();
        bgToolbarOpenedTs = (window.performance?.now?.() || Date.now());
      }
      if (contentOnly) return;
      const layout = getCurrentLayoutForLayer(gridEl, activeLayer, ensureCodeMap());
      pushLayoutState(layout);
      if (pageId && state.autosaveEnabled) scheduleAutosave();
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
  BGLOG('listeners attached: pointerdown on #workspaceMain and #content');

  // Capture-phase handler to catch clicks swallowed by other listeners
  const captureBackgroundIntent = e => {
    if (document.body.classList.contains('preview-mode')) { BGLOG('skip: preview-mode capture'); return; }
    let inContent = e.target.closest('#content');
    // If an overlay outside #content captures the event, fall back to hit-testing #workspaceMain bounds
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
    if (!document.getElementById('workspaceMain')) return;
    const insideBgToolbar = e.target.closest('.bg-editor-toolbar');
    const insideGrid = e.target.closest('#workspaceMain');
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
  } else if (loadedDesign) {
    // designer.getDesign returns widget rows with snake_case keys; convert
    // them to the builder's expected camelCase layout schema.
    initialLayout = Array.isArray(loadedDesign?.widgets)
      ? loadedDesign.widgets.map(w => ({
          id: w.instance_id || w.instanceId,
          widgetId: w.widget_id || w.widgetId,
          xPercent: w.x_percent ?? w.xPercent,
          yPercent: w.y_percent ?? w.yPercent,
          wPercent: w.w_percent ?? w.wPercent,
          hPercent: w.h_percent ?? w.hPercent,
          code: {
            html: w.html,
            css: w.css,
            js: w.js,
            metadata: w.metadata
          }
        }))
      : [];
    pageData = loadedDesign?.design || null;
  } else {
    if (layoutNameParam) {
      try {
        const tplRes = await meltdownEmit('getLayoutTemplate', {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'plainspace',
          moduleType: 'core',
          name: layoutNameParam
        });
        initialLayout = Array.isArray(tplRes?.layout) ? tplRes.layout : [];
        layoutNameParam = String(tplRes?.name || layoutNameParam).replace(/[\n\r]/g, '');
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

    /* --------  New: auto-select  --------------------------- */
    selectWidget(wrapper);          // triggers action bar & widgetSelected

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

  currentDesignId = state.designId || layoutName;
  historyByDesign[currentDesignId] = { undoStack: [], redoStack: [] };
  pushLayoutState(initialLayout);

  const nameInput = topBar.querySelector('#layoutNameInput');
  if (nameInput) {
    try { nameInput.value = layoutName; } catch (_) {}
  }
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

  initHeaderControls(topBar, gridEl, viewportSizeEl, grid, {
    undo: () => undo(currentDesignId),
    redo: () => redo(currentDesignId)
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
    startAutosave();
  });

  // Header already injected by loadHeaderPartial();
  // (no extra style injection)

  startAutosave();
  buildLayoutBar();

  saveBtn.addEventListener('click', async () => {
    try {
      await saveDesign({
        name: nameInput.value.trim(),
        gridEl,
        layoutRoot,
        getCurrentLayoutForLayer,
        getActiveLayer: () => activeLayer,
        ensureCodeMap,
        capturePreview: () => captureGridPreview(gridEl),
        updateAllWidgetContents,
        ownerId: getAdminUserId(),
        pageId,
        isLayout: activeLayer === 0,
        isGlobal: activeLayer === 0
      });
      alert(activeLayer === 0 ? 'Layout template saved' : 'Design saved');
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  });

  if (previewBtn) {
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
  }

  if (publishBtn) {
    initPublishPanel({
      publishBtn,
      nameInput,
      gridEl,
      layoutRoot,
      updateAllWidgetContents,
      getAdminUserId,
      getCurrentLayoutForLayer,
      getActiveLayer: () => activeLayer,
      ensureCodeMap,
      capturePreview: () => captureGridPreview(gridEl),
      pageId,
      saveDesign
    });
  }

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
      btn.textContent = idx === 0 ? 'Layout' : 'Design';
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
