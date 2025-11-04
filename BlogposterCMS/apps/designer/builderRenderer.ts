
import {
  initTextEditor,
  showToolbar,
  hideToolbar,
  setActiveElement,
  getRegisteredEditable,
  undoTextCommand,
  redoTextCommand
} from './editor/editor.js';
import { initBackgroundToolbar, showBackgroundToolbar as showBgToolbar, hideBackgroundToolbar as hideBgToolbar } from './editor/toolbar/backgroundToolbar.js';
import { initGrid, getCurrentLayoutForLayer, pushState as pushHistoryState } from './managers/gridManager.js';
import { applyLayout } from './managers/layoutManager.js';
import { attachEditButton, attachRemoveButton, attachLockOnClick, attachOptionsMenu, renderWidget } from './managers/widgetManager.js';
import { designerState } from './managers/designerState.js';
import { deserializeLayout, serializeLayout } from './renderer/layoutSerialize.js';
import { initLayoutMode, populateWidgetsPanel, startLayoutMode, stopLayoutMode } from './renderer/layoutMode.js';
import { attachContainerBar } from './ux/containerActionBar.js';
import { renderLayoutTreeSidebar } from './renderer/layoutTreeView.js';
import { activateArrange as enableArrange, deactivateArrange as disableArrange } from './managers/layoutArrange.js';
import { applyDesignerTheme } from './utils.js';
import { createLogger } from './utils/logger';
import { createActionBar } from './renderer/actionBar.js';
import { createSaveManager } from './renderer/saveManager.js';
import { registerBuilderEvents } from './renderer/eventHandlers.js';
import { getWidgetIcon } from './renderer/renderUtils.js';
import { capturePreview as captureGridPreview } from './renderer/capturePreview.js';
import { createBuilderHeader } from './renderer/builderHeader';
import { createPreviewHeader } from './renderer/previewHeader.js';
import { buildLayoutBar } from './renderer/layoutBar.js';
import { createLayoutStructureHandlers } from './renderer/layoutStructureHandlers.js';
import {
  setDefaultWorkarea,
  ensureLayoutRootContainer,
  setDynamicHost as setDynamicHostContainer,
  setDesignRef as setContainerDesignRef,
  placeContainer as placeContainerNode,
  deleteContainer as deleteContainerNode,
  moveContainer as moveContainerNode
} from './managers/layoutContainerManager.js';
import {
  pushLayoutSnapshot,
  undoDesign,
  redoDesign,
  resetDesignHistory
} from './managers/historyManager.js';

const builderLogger = createLogger('builder');
const backgroundLogger = builderLogger.child('background');

// Enable layout structure features by default unless explicitly disabled
const HAS_LAYOUT_STRUCTURE = window.FEATURE_LAYOUT_STRUCTURE !== false;

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

  const { showPreviewHeader, hidePreviewHeader } = createPreviewHeader(displayPorts);
  const layoutLayers = HAS_LAYOUT_STRUCTURE
    ? [{ name: 'Layout', layout: [] }, { name: 'Design', layout: [] }]
    : [{ name: 'Design', layout: [] }];
  const startLayerNum = Number(startLayer);
  let activeLayer = HAS_LAYOUT_STRUCTURE && Number.isFinite(startLayerNum)
    ? Math.max(0, Math.min(layoutLayers.length - 1, startLayerNum))
    : 0;
  document.body.dataset.activeLayer = String(activeLayer);
  const footer = document.getElementById('builderFooter');
  let layoutBar;

  let layoutRoot;
  let gridEl;
  let codeMap = {};
  let globalLayoutName: string | null = null;
  // Track when the BG toolbar was just opened to avoid immediate hide by global click
  let bgToolbarOpenedTs = 0;
  // Debug helper for background interactions
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
  initLayoutMode(sidebarEl);


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

  // Use a plain builder grid container. CanvasGrid will add its own
  // `canvas-grid` class; avoid `pixel-grid` here so zoom scaling via
  // CSS variable works with the BoundingBoxManager.
  //
  // Wrap the grid in a scrollable viewport so scrollbars live "inside"
  // the designer instead of the page. The #layoutRoot now hosts
  // #workspaceMain directly so additional layout containers appear
  // alongside the main workspace.
  contentEl.innerHTML = `
    <div id="builderViewport" class="builder-viewport">
      <div id="layoutRoot" class="layout-root">
        <div id="workspaceMain" class="builder-grid"></div>
      </div>
    </div>
  `;
  const gridViewportEl = document.getElementById('builderViewport');
  layoutRoot = document.getElementById('layoutRoot');
  gridEl = document.getElementById('workspaceMain');
  gridEl.dataset.workarea = 'true';
  ensureLayoutRootContainer(layoutRoot);
  // Ensure the layout root sits inside the viewport so the workspace remains nested
  if (layoutRoot.parentElement !== gridViewportEl) {
    gridViewportEl.appendChild(layoutRoot);
  }

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
      ensureLayoutRootContainer(layoutRoot);
    }
  } catch (e) {
    console.warn('[Designer] failed to deserialize layout', e);
  }
  const viewportSizeEl = document.createElement('div');
  viewportSizeEl.className = 'viewport-size-display';
  gridViewportEl.appendChild(viewportSizeEl);
  let currentDesignId = null;
  function pushLayoutState(layout) {
    if (!currentDesignId) return;
    pushLayoutSnapshot(currentDesignId, layout, pushHistoryState);
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
  function pushAndSave() {
    const rootContainer = ensureLayoutRootContainer(layoutRoot);
    if (!rootContainer) return;
    const layout = serializeLayout(rootContainer);
    pushLayoutState(layout);
    if (pageId && state.autosaveEnabled) scheduleAutosave();
  }

  let layoutCtx;
  const { refreshContainerBars, refreshLayoutTree, handleContainerChange } = createLayoutStructureHandlers({
    layoutRootRef: () => layoutRoot,
    sidebarEl,
    hasLayoutStructure: HAS_LAYOUT_STRUCTURE,
    attachContainerBar,
    renderLayoutTreeSidebar,
    pushAndSave,
    layoutCtxProvider: () => layoutCtx
  });

  function placeContainer(targetEl, pos) {
    placeContainerNode(targetEl, pos, {
      layoutRoot,
      onAfterChange: handleContainerChange
    });
  }

  function setDynamicHost(el) {
    setDynamicHostContainer(layoutRoot, el);
    handleContainerChange();
  }

  function setDesignRef(el, designId) {
    setContainerDesignRef(el, designId);
    handleContainerChange();
  }

  function deleteContainer(el) {
    deleteContainerNode(el, { onAfterChange: handleContainerChange });
  }

  function moveContainer(srcEl, targetEl, pos) {
    moveContainerNode(srcEl, targetEl, pos, { onAfterChange: handleContainerChange });
  }

  function activateArrange() {
    enableArrange(layoutRoot, { moveContainer });
  }

  function deactivateArrange() {
    disableArrange(layoutRoot);
  }

  function wireArrangeToggle() {
    const toggle = sidebarEl.querySelector('.layout-arrange-toggle');
    if (!toggle) return;
    toggle.addEventListener('change', () => {
      if (toggle.checked) activateArrange();
      else deactivateArrange();
    });
  }

  layoutCtx = {
    sidebarEl,
    gridEl,
    allWidgets,
    ICON_MAP,
    hideToolbar,
    showToolbar,
    saveDesign,
    getCurrentLayoutForLayer,
    getActiveLayer: () => activeLayer,
    ensureCodeMap,
    capturePreview: () => captureGridPreview(gridEl),
    updateAllWidgetContents,
    getAdminUserId,
    pageId,
    layoutRoot,
    switchLayer,
    placeContainer,
    setDynamicHost,
    setDesignRef,
    deleteContainer,
    refreshContainerBars,
    refreshLayoutTree,
    activateArrange,
    deactivateArrange
  };

  populateWidgetsPanel(sidebarEl, allWidgets, ICON_MAP, HAS_LAYOUT_STRUCTURE ? () => switchLayer(0) : null);

  await applyDesignerTheme();
  // Allow overlapping widgets for layered layouts
  const grid = initGrid(gridEl, state, selectWidget, {
    scrollContainer: gridViewportEl,
    enableZoom: true
  });
  const sizer = grid?.sizer;
  if (sizer && layoutRoot) {
    sizer.appendChild(layoutRoot);
    layoutRoot.appendChild(gridEl);
  }
  setDefaultWorkarea(layoutRoot);
  layoutCtx.refreshContainerBars();
  layoutCtx.refreshLayoutTree();
  window.addEventListener('resize', () => {
    setDefaultWorkarea(layoutRoot);
  });
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
    builderLogger.debug('selectWidget', { widgetId: el?.id, editableId: editable?.id });
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
    if (inPreview) { backgroundLogger.debug('skip: preview-mode contentDown'); return; }
    const isUi = e.target.closest('.canvas-item') ||
                 e.target.closest('.widget-action-bar') ||
                 e.target.closest('.text-block-editor-toolbar') ||
                 e.target.closest('.bg-editor-toolbar') ||
                 e.target.closest('.color-picker') ||
                 e.target.closest('.builder-header') ||
                 e.target.closest('.layout-bar') ||
                 e.target.closest('.builder-sidebar');
    backgroundLogger.debug('content pointerdown', { target: e.target, isUi: !!isUi });
    if (isUi) return;
    hideToolbar();
    showBgToolbar();
    bgToolbarOpenedTs = (window.performance?.now?.() || Date.now());
    backgroundLogger.debug('bgToolbar show via contentDown', { timestamp: bgToolbarOpenedTs });
  };
  // Prefer pointerdown for consistency and to avoid race with global click hide
  gridEl.addEventListener('pointerdown', contentClickHandler);
  const contentRoot = document.getElementById('content');
  if (contentRoot && contentRoot !== gridEl) contentRoot.addEventListener('pointerdown', contentClickHandler);
  backgroundLogger.debug('listeners attached: pointerdown on #workspaceMain and #content');

  // Capture-phase handler to catch clicks swallowed by other listeners
  const captureBackgroundIntent = e => {
    if (document.body.classList.contains('preview-mode')) { backgroundLogger.debug('skip: preview-mode capture'); return; }
    let inContent = e.target.closest('#content');
    // If an overlay outside #content captures the event, fall back to hit-testing #workspaceMain bounds
    if (!inContent) {
      const gridRect = gridEl?.getBoundingClientRect?.();
      const cx = (e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? -1);
      const cy = (e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? -1);
      if (gridRect && cx >= gridRect.left && cx <= gridRect.right && cy >= gridRect.top && cy <= gridRect.bottom) {
        inContent = true;
      }
      backgroundLogger.debug('capture hit-test', { cx, cy, gridRect, inContent: !!inContent });
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
    backgroundLogger.debug('capture pointerdown', { target: e.target, isUi: !!isUi });
    if (isUi) return;
    hideToolbar();
    showBgToolbar();
    bgToolbarOpenedTs = (window.performance?.now?.() || Date.now());
    backgroundLogger.debug('bgToolbar show via capture', { timestamp: bgToolbarOpenedTs });
  };
  document.addEventListener('pointerdown', captureBackgroundIntent, true);

  // Hide background toolbar when clicking outside of canvas/toolbar
  document.addEventListener('click', e => {
    if (!document.getElementById('workspaceMain')) return;
    const insideBgToolbar = e.target.closest('.bg-editor-toolbar');
    const insideGrid = e.target.closest('#workspaceMain');
    const insidePicker = e.target.closest('.color-picker');
    const insideTextTb = e.target.closest('.text-block-editor-toolbar');
    if (insideBgToolbar || insidePicker || insideTextTb) { backgroundLogger.debug('global click inside UI, ignore', { insideBgToolbar: !!insideBgToolbar, insidePicker: !!insidePicker, insideTextTb: !!insideTextTb }); return; }
    // If we just opened the BG toolbar on this interaction, skip the immediate hide
    const now = (window.performance?.now?.() || Date.now());
    const delta = now - bgToolbarOpenedTs;
    if (delta < 250) { backgroundLogger.debug('global click within suppress window', { delta }); return; }
    const insideViewport = e.target.closest('#builderViewport');
    if (!insideViewport) { backgroundLogger.debug('global click outside viewport -> hide bgToolbar'); hideBgToolbar(); }
    else { backgroundLogger.debug('global click inside viewport, keep bgToolbar', { insideGrid: !!insideGrid }); }
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

      if (HAS_LAYOUT_STRUCTURE) {
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
    if (HAS_LAYOUT_STRUCTURE) {
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
  }




  if (HAS_LAYOUT_STRUCTURE) {
    layoutLayers[1].layout = initialLayout;
  } else {
    layoutLayers[0].layout = initialLayout;
  }

  if (HAS_LAYOUT_STRUCTURE) {
    if (globalLayoutName) {
      document.body.dataset.globalLayoutName = globalLayoutName;
    } else {
      delete document.body.dataset.globalLayoutName;
    }
  }
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

  layoutName =
    layoutNameParam ||
    pageData?.meta?.layoutTemplate ||
    pageData?.title ||
    'layout-title';

  currentDesignId = state.designId || layoutName;
  resetDesignHistory(currentDesignId);
  pushLayoutState(initialLayout);
  layoutBar = buildLayoutBar({ footer, grid, gridEl });

  if (HAS_LAYOUT_STRUCTURE) {
    if (activeLayer === 0) {
      startLayoutMode(layoutCtx);
      wireArrangeToggle();
    } else {
      stopLayoutMode(layoutCtx);
    }
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
    // No layer tabs to update; footer only hosts zoom controls now.
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

  const applySnapshot = layout => {
    applyLayout(layout, {
      gridEl,
      grid,
      codeMap: ensureCodeMap(),
      allWidgets,
      layerIndex: activeLayer,
      iconMap: ICON_MAP
    });
    markInactiveWidgets();
  };

  const undoCurrentDesign = () => {
    const shouldAutosave = Boolean(pageId && state.autosaveEnabled);
    undoDesign(currentDesignId, {
      applySnapshot,
      undoTextCommand,
      scheduleAutosave,
      shouldAutosave
    });
  };

  const redoCurrentDesign = () => {
    const shouldAutosave = Boolean(pageId && state.autosaveEnabled);
    redoDesign(currentDesignId, {
      applySnapshot,
      redoTextCommand,
      scheduleAutosave,
      shouldAutosave
    });
  };

  const headerController = createBuilderHeader({
    initialLayoutName: layoutName,
    layoutNameParam,
    pageData,
    gridEl,
    viewportSizeEl,
    grid,
    saveDesign,
    getCurrentLayoutForLayer,
    getActiveLayer: () => activeLayer,
    ensureCodeMap,
    capturePreview: () => captureGridPreview(gridEl),
    updateAllWidgetContents,
    getAdminUserId,
    pageId,
    layoutRoot,
    state,
    startAutosave,
    showPreviewHeader,
    hidePreviewHeader,
    undo: undoCurrentDesign,
    redo: redoCurrentDesign
  });

  await headerController.renderHeader();

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

  async function switchLayer(idx) {
    if (idx === activeLayer) return;
    saveActiveLayer();
    activeLayer = idx;
    document.body.dataset.activeLayer = String(activeLayer);
    applyCompositeLayout(idx);
    updateLayoutBar();
    if (HAS_LAYOUT_STRUCTURE) {
      if (activeLayer === 0) {
        await headerController.renderHeader({ reload: true });
        startLayoutMode(layoutCtx);
        wireArrangeToggle();
      } else {
        deactivateArrange();
        stopLayoutMode(layoutCtx);
      }
    }
  }

}
