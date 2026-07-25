// @ts-nocheck
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
import { hideBuilderPanel, showBuilderPanel } from './managers/panelManager.js';
import { attachEditButton, attachRemoveButton, attachLockOnClick, attachOptionsMenu, renderWidget } from './managers/widgetManager.js';
import { designerState } from './managers/designerState.js';
import { deserializeLayout, serializeLayout } from './renderer/layoutSerialize.js';
import { initLayoutMode, populateWidgetsPanel, startLayoutMode, stopLayoutMode } from './renderer/layoutMode.js';
import { attachContainerBar } from './ux/containerActionBar.js';
import { renderLayoutTreeSidebar } from './renderer/layoutTreeView.js';
import { activateArrange as enableArrange, deactivateArrange as disableArrange } from './managers/layoutArrange.js';
import { createLogger } from './utils/logger';
import { createActionBar } from './renderer/actionBar.js';
import { createSaveManager } from './renderer/saveManager.js';
import { registerBuilderEvents } from './renderer/eventHandlers.js';
import { emitAdminFacade } from './runtime/runtimeFacade.js';
import { initTextPanel } from './managers/textPanelManager';
import { getWidgetIcon } from './renderer/renderUtils.js';
import { capturePreview as captureGridPreview } from './renderer/capturePreview.js';
import { createBuilderHeader } from './renderer/builderHeader';
import { createPreviewHeader } from './renderer/previewHeader.js';
import {
  buildLivePreviewFrameUrl,
  buildLivePreviewPayload,
  createLivePreviewController
} from './renderer/livePreviewFrame.js';
import { buildLayoutBar } from './renderer/layoutBar.js';
import { normalizeSceneRange, rangeFromPointer } from './renderer/sceneRangeControls';
import { createLayoutStructureHandlers } from './renderer/layoutStructureHandlers.js';
import {
  INSERT_TOOL_ITEMS,
  INSERT_PRESET_PREFIX,
  NATIVE_ELEMENT_PREFIX,
  NATIVE_ELEMENT_TYPES,
  createNativeElementPreset,
  getInsertPreset,
  getInsertToolItem,
  getNativeElementMinSize,
  getNativeElementSize
} from './widgets/nativeElementPresets.js';
import { applyWidgetStyleSources } from './widgets/styleSourceSync.js';
import {
  setDefaultWorkarea,
  ensureLayoutRootContainer,
  setDynamicHost as setDynamicHostContainer,
  setDesignRef as setContainerDesignRef,
  setContainerLayoutMode as setContainerLayoutModeNode,
  setContainerSettings as setContainerSettingsNode,
  toggleContainerStyleSource as toggleContainerStyleSourceNode,
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
import {
  getBuilderViewportState,
  setBuilderViewportPreset,
  setBuilderViewportWidth,
  setBuilderZoom
} from './renderer/viewportState.js';
import { normalizeResponsiveWidthRange } from '/ui/shared/layout/responsivePlacement.js';
import {
  createSitePreset
} from '/ui/shared/presets/sitePresets.js';
import {
  getActiveColorScheme
} from '/ui/shared/colors/colorLibrary.js';
import {
  getActiveFontPackage
} from '/ui/shared/fonts/fontPackages.js';

const builderLogger = createLogger('builder');
const backgroundLogger = builderLogger.child('background');

// Enable layout structure features by default unless explicitly disabled
const HAS_LAYOUT_STRUCTURE = window.FEATURE_LAYOUT_STRUCTURE !== false;

function containerDebugInfo(el, extra = {}) {
  return {
    nodeId: el?.dataset?.nodeId || null,
    mode: el?.dataset?.layoutMode || null,
    split: el?.dataset?.split || null,
    ...extra
  };
}

function warnDesignerContainerError(code, err, detail = {}) {
  console.warn(`[Designer] ${code}`, detail, err);
}

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
    textBox: 'type',
    mediaBlock: 'image',
    buttonLink: 'mouse-pointer-click',
    navigationMenu: 'menu',
    breadcrumb: 'chevrons-right',
    gallery: 'images',
    collectionArchive: 'archive'
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
  let layoutCtx;

  let layoutRoot;
  let gridEl;
  let grid = null;
  let codeMap = {};
  let globalLayoutName: string | null = null;
  // Track when the BG toolbar was just opened to avoid immediate hide by global click
  let bgToolbarOpenedTs = 0;
  // Debug helper for background interactions
  function ensureCodeMap() {
    if (!codeMap || typeof codeMap !== 'object') codeMap = {};
    return codeMap;
  }
  const INSPECTOR_MODES = ['content', 'behavior', 'style'];
  let activeInspectorMode = 'content';
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

  const sceneSections = [
    { id: 'hero-scene', title: 'Hero Scene' },
    { id: 'features', title: 'Features' },
    { id: 'showcase', title: 'Showcase' },
    { id: 'about', title: 'About' },
    { id: 'contact', title: 'Contact' }
  ];
  let activeSceneId = sceneSections[0].id;
  let editingSceneId = null;
  const DEFAULT_SCROLL_RANGE = { start: 10, end: 60 };
  const DEFAULT_SCENE_BACKGROUND = '#ffffff';
  const SCENE_BACKGROUND_PRESETS = ['#ffffff', '#f7f8fb', '#f4f1ff', '#eef8f7', '#fbf7ef'];
  const BEHAVIOR_DEFS = [
    { id: 'scroll', title: 'Scroll', icon: 'scroll' },
    { id: 'sticky', title: 'Sticky', icon: 'pin' },
    { id: 'pinned', title: 'Pin', icon: 'anchor' }
  ];
  const EFFECT_DEFS = [
    { id: 'fadeIn', title: 'Fade In', icon: 'eye', start: 10, end: 30 },
    { id: 'fadeOut', title: 'Fade Out', icon: 'eye-off', start: 40, end: 60 },
    { id: 'moveY', title: 'Move Y', icon: 'move-down', start: 20, end: 80 }
  ];
  const GALLERY_LAYOUTS = [
    { id: 'grid', title: 'Gallery' },
    { id: 'masonry', title: 'Masonry' },
    { id: 'carousel', title: 'Slider' }
  ];
  const GALLERY_FITS = ['cover', 'contain', 'fill', 'none', 'scale-down'];
  const GALLERY_HEIGHT_MODES = [
    { id: 'ratio', title: 'Fixed ratio' },
    { id: 'natural', title: 'Natural images' },
    { id: 'smallest', title: 'Smallest image' },
    { id: 'largest', title: 'Largest image' }
  ];
  const GALLERY_ANIMATIONS = [
    { id: 'slide', title: 'Slide' },
    { id: 'fade', title: 'Fade' },
    { id: 'instant', title: 'Instant' }
  ];
  const sceneInspector = ensureSceneInspector();
  const SIDEBAR_PANEL_NAMES = new Set(['insert', 'layout', 'design']);
  const SIDEBAR_TOOL_NAMES = new Set(['scroll', 'action']);
  const SIDEBAR_PANEL_BY_SELECTOR = [
    { selector: 'layout-panel', panel: 'layout' },
    { selector: 'style-library-panel', panel: 'design' },
    { selector: 'color-scheme-host', panel: 'design' },
    { selector: 'font-packages-host', panel: 'design' },
    { selector: 'element-library', panel: 'insert' },
    { selector: 'scene-insert-group', panel: 'insert' },
    { selector: 'scene-insert-preset', panel: 'insert' },
    { selector: 'drag-widget-icon', panel: 'insert' }
  ];

  function normalizeSidebarPanel(value, fallback = 'insert') {
    const name = String(value || fallback);
    return SIDEBAR_PANEL_NAMES.has(name) ? name : fallback;
  }

  function collapseInsertGroup() {
    sidebarEl.classList.remove('builder-sidebar--insert-expanded');
    sidebarEl.querySelectorAll('[data-insert-group]').forEach(button => {
      button.classList.remove('active');
      button.setAttribute('aria-expanded', 'false');
    });
    sidebarEl.querySelectorAll('[data-insert-group-panel]').forEach(panel => {
      panel.classList.remove('is-active');
      panel.hidden = true;
    });
  }

  function isSidebarFlyoutOpen() {
    return sidebarEl.dataset.sidebarFlyoutOpen === 'true';
  }

  function setSidebarFlyoutOpen(open) {
    const flyout = sidebarEl.querySelector('[data-sidebar-flyout]');
    const shouldOpen = Boolean(open);
    sidebarEl.dataset.sidebarFlyoutOpen = shouldOpen ? 'true' : 'false';
    sidebarEl.classList.toggle('builder-sidebar--flyout-open', shouldOpen);
    if (flyout) {
      flyout.hidden = !shouldOpen;
      flyout.style.display = shouldOpen ? '' : 'none';
      flyout.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    }
  }

  function closeSidebarPanel(options = {}) {
    if (!options.preserveInsertGroup) collapseInsertGroup();
    setSidebarFlyoutOpen(false);
    sidebarEl.querySelectorAll('[data-sidebar-panel]').forEach(panel => {
      panel.classList.remove('is-active');
      panel.hidden = true;
    });
    sidebarEl.querySelectorAll('[data-sidebar-panel-target]').forEach(button => {
      button.classList.remove('active');
      button.setAttribute('aria-selected', 'false');
    });
  }

  function setInsertGroup(groupId) {
    const item = getInsertToolItem(groupId);
    if (!item) {
      collapseInsertGroup();
      return null;
    }
    setSidebarPanel('insert', { preserveInsertGroup: true });
    sidebarEl.classList.add('builder-sidebar--insert-expanded');
    sidebarEl.querySelectorAll('[data-insert-group]').forEach(button => {
      const active = button.dataset.insertGroup === item.id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-expanded', active ? 'true' : 'false');
    });
    sidebarEl.querySelectorAll('[data-insert-group-panel]').forEach(panel => {
      const active = panel.dataset.insertGroupPanel === item.id;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    return item;
  }

  function setSidebarPanel(panelName = 'insert', options = {}) {
    const activePanel = normalizeSidebarPanel(panelName);
    const shell = sidebarEl.querySelector('.scene-panel-shell');
    sidebarEl.dataset.activeSidebarPanel = activePanel;
    setSidebarFlyoutOpen(true);
    sidebarEl.classList.toggle('builder-sidebar--compact', activePanel === 'insert');
    if (activePanel !== 'insert' || !options.preserveInsertGroup) collapseInsertGroup();
    if (shell) shell.dataset.activeSidebarPanel = activePanel;
    sidebarEl.querySelectorAll('[data-sidebar-panel]').forEach(panel => {
      const active = panel.dataset.sidebarPanel === activePanel;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    sidebarEl.querySelectorAll('[data-sidebar-panel-target]').forEach(button => {
      const active = button.dataset.sidebarPanelTarget === activePanel;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    return activePanel;
  }

  function setSidebarToolActive(toolName = '') {
    const activeTool = SIDEBAR_TOOL_NAMES.has(String(toolName)) ? String(toolName) : '';
    sidebarEl.querySelectorAll('[data-designer-tool]').forEach(button => {
      const active = button.dataset.designerTool === activeTool;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  async function activateSidebarPanel(panelName = 'insert') {
    const activePanel = normalizeSidebarPanel(panelName);
    if (!layoutCtx) {
      setSidebarPanel(activePanel);
      return activePanel;
    }
    if (activePanel === 'layout' && HAS_LAYOUT_STRUCTURE) {
      if (activeLayer === 0) {
        await startLayoutMode(layoutCtx);
        wireArrangeToggle();
      } else {
        await switchLayer(0);
      }
      setSidebarPanel('layout');
      return activePanel;
    }
    if (HAS_LAYOUT_STRUCTURE && activeLayer === 0) {
      await ensureDesignLayerForTool();
    }
    setSidebarPanel(activePanel);
    return activePanel;
  }

  function sidebarPanelForSelector(selector = '') {
    const rawSelector = String(selector);
    const match = SIDEBAR_PANEL_BY_SELECTOR.find(item => rawSelector.includes(item.selector));
    return match?.panel || null;
  }

  function clampPercent(value, fallback) {
    const parsed = typeof value === 'string'
      ? parseFloat(value.replace('%', '').trim())
      : Number(value);
    const num = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(0, Math.min(100, Math.round(num)));
  }

  function normalizeRange(startValue, endValue) {
    return normalizeSceneRange(
      startValue ?? DEFAULT_SCROLL_RANGE.start,
      endValue ?? DEFAULT_SCROLL_RANGE.end
    );
  }

  function getElementRange(el) {
    if (!el) return { ...DEFAULT_SCROLL_RANGE };
    return normalizeRange(el.dataset.scrollStart, el.dataset.scrollEnd);
  }

  function normalizeBehavior(value) {
    const candidate = String(value || 'scroll')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return BEHAVIOR_DEFS.some(def => def.id === candidate) ? candidate : 'scroll';
  }

  function normalizeSceneColor(value, fallback = DEFAULT_SCENE_BACKGROUND) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
    }
    return fallback;
  }

  function getSceneBackground(scene = getActiveScene()) {
    return normalizeSceneColor(scene?.background, DEFAULT_SCENE_BACKGROUND);
  }

  function nextSceneBackground(scene = getActiveScene()) {
    const current = getSceneBackground(scene);
    const index = SCENE_BACKGROUND_PRESETS.indexOf(current);
    return SCENE_BACKGROUND_PRESETS[(index + 1) % SCENE_BACKGROUND_PRESETS.length] || SCENE_BACKGROUND_PRESETS[1];
  }

  function applyActiveSceneStyle() {
    const scene = getActiveScene();
    const background = getSceneBackground(scene);
    if (gridEl) {
      gridEl.dataset.sceneBackground = background;
      gridEl.style.backgroundColor = background;
      if (scene?.id) {
        gridEl.querySelectorAll(`.canvas-item[data-scene-id="${cssEscape(scene.id)}"]`).forEach(el => {
          el.dataset.sceneBackground = background;
        });
      }
    }
    if (layoutRoot) {
      layoutRoot.dataset.sceneBackground = background;
      layoutRoot.style.backgroundColor = background;
    }
  }

  function syncSceneTitleDom(scene) {
    if (!scene) return;
    document.body.dataset.activeScene = scene.id;
    document.body.dataset.activeSceneTitle = scene.title;
    document.querySelectorAll(`.scene-section-item[data-scene-id="${cssEscape(scene.id)}"] .scene-section-title`).forEach(titleNode => {
      titleNode.textContent = scene.title;
    });
    document.querySelectorAll(`.scene-section-title-input[data-scene-id="${cssEscape(scene.id)}"]`).forEach(inputNode => {
      if (inputNode instanceof HTMLInputElement && inputNode.value !== scene.title) inputNode.value = scene.title;
    });
    const stageLabel = document.querySelector('.scene-stage-title');
    if (stageLabel) stageLabel.textContent = scene.title;
    if (gridEl) {
      gridEl.dataset.workareaLabel = scene.title;
      gridEl.dataset.sceneTitle = scene.title;
    }
  }

  function getBehaviorDef(value) {
    const behavior = normalizeBehavior(value);
    return BEHAVIOR_DEFS.find(def => def.id === behavior) || BEHAVIOR_DEFS[0];
  }

  function setRangeVars(target, range) {
    if (!target?.style) return;
    target.style.setProperty('--scene-range-start', `${range.start}%`);
    target.style.setProperty('--scene-range-end', `${range.end}%`);
    target.style.setProperty('--scene-range-mid', `${Math.round((range.start + range.end) / 2)}%`);
  }

  function syncInspectorBehaviorPreview(behaviorValue = 'scroll', rangeValue = DEFAULT_SCROLL_RANGE, effectsValue = []) {
    if (!sceneInspector) return;
    const preview = sceneInspector.querySelector('.scene-behavior-preview');
    if (!preview) return;
    const behaviorDef = getBehaviorDef(behaviorValue);
    const range = normalizeRange(rangeValue.start, rangeValue.end);
    const enabledEffects = compactEffects(normalizeEffects(effectsValue));
    const effectSummary = enabledEffects.length
      ? `${enabledEffects.length} effect${enabledEffects.length === 1 ? '' : 's'}`
      : 'No effects';
    const title = preview.querySelector('.scene-behavior-preview-title');
    const detail = preview.querySelector('.scene-behavior-preview-detail');
    const element = preview.querySelector('.scene-behavior-preview-element');
    const effects = preview.querySelector('.scene-behavior-preview-effects');
    preview.dataset.behavior = behaviorDef.id;
    preview.dataset.effects = String(enabledEffects.length);
    setRangeVars(preview, range);
    if (title) title.textContent = behaviorDef.title;
    if (detail) detail.textContent = `${range.start}% - ${range.end}% / ${effectSummary}`;
    if (element) element.textContent = behaviorDef.title;
    if (effects) {
      effects.innerHTML = enabledEffects.length
        ? enabledEffects
            .slice(0, 3)
            .map(effect => `<span>${escapeHtml(effectLabel(effect))}<small>${effect.start}% - ${effect.end}%</small></span>`)
            .join('')
        : '<span class="is-empty">No effects</span>';
    }
  }

  function ensureBehaviorRangeCue(el) {
    if (!el) return null;
    let cue = el.querySelector(':scope > .scene-behavior-range-cue');
    if (!cue) {
      cue = document.createElement('div');
      cue.className = 'scene-behavior-range-cue';
      cue.setAttribute('aria-hidden', 'true');
      el.appendChild(cue);
    }
    return cue;
  }

  function hasEnabledEffects(effects) {
    return compactEffects(effects || []).length > 0;
  }

  function shouldShowBehaviorCue(el, effects = null) {
    if (!el) return false;
    const behavior = normalizeBehavior(el.dataset.behavior);
    if (behavior !== 'scroll') return true;
    return hasEnabledEffects(effects || getElementEffects(el));
  }

  function renderBehaviorBadge(el, behaviorDef, range, effects = null) {
    if (!el) return;
    const enabledEffects = compactEffects(effects || getElementEffects(el));
    const behavior = behaviorDef.id;
    let badge = el.querySelector(':scope > .scene-behavior-badge');
    if (behavior === 'scroll' && !enabledEffects.length) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'scene-behavior-badge';
      badge.setAttribute('aria-hidden', 'true');
      el.appendChild(badge);
    }
    badge.dataset.behavior = behavior;
    badge.dataset.effects = enabledEffects.map(effect => effect.id).join(',');
    const effectText = enabledEffects
      .slice(0, 2)
      .map(effect => effectLabel(effect))
      .join(' + ');
    const effectSuffix = enabledEffects.length > 2 ? ` +${enabledEffects.length - 2}` : '';
    const behaviorMarkup = behavior !== 'scroll'
      ? `<span><strong>${escapeHtml(behaviorDef.title)}</strong><small>${range.start}% - ${range.end}%</small></span>`
      : '';
    const effectMarkup = enabledEffects.length
      ? `<span><strong>Effects</strong><small>${escapeHtml(effectText)}${effectSuffix}</small></span>`
      : '';
    badge.innerHTML = `${behaviorMarkup}${effectMarkup}`;
  }

  function removeStageBehaviorHuds(exceptEl = null) {
    const exceptId = exceptEl?.dataset?.instanceId || exceptEl?.id || '';
    document.querySelectorAll('.scene-stage-hud').forEach(hud => {
      if (exceptId && hud.dataset.instanceId === exceptId) return;
      hud.remove();
    });
  }

  function renderStageBehaviorHud(el, behaviorDef, range, effects = null) {
    if (!el || el !== state.activeWidgetEl) return;
    removeStageBehaviorHuds(el);
    const enabledEffects = compactEffects(effects || getElementEffects(el));
    const effectSummary = enabledEffects.length
      ? `${enabledEffects.length} effect${enabledEffects.length === 1 ? '' : 's'}`
      : 'No effects';
    let hud = actionBar.querySelector(':scope > .scene-stage-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.className = 'scene-stage-hud';
      // Behavior controls share the established selection toolbar instead of
      // creating a second floating surface over the same canvas element.
      actionBar.prepend(hud);
    }
    hud.dataset.instanceId = el.dataset.instanceId || el.id || '';
    hud.dataset.behavior = behaviorDef.id;
    hud.dataset.effects = String(enabledEffects.length);
    hud.setAttribute('aria-label', `${behaviorDef.title}, ${range.start}% to ${range.end}%, ${effectSummary}`);
    setRangeVars(hud, range);
    hud.innerHTML = `
      <span class="scene-stage-hud__summary">
        <img src="/assets/icons/${escapeAttribute(behaviorDef.icon)}.svg" alt="" class="icon" />
        <strong>${escapeHtml(behaviorDef.title)}</strong>
        <small>${range.start}% - ${range.end}%</small>
        <i aria-hidden="true"></i>
        <em>${escapeHtml(effectSummary)}</em>
      </span>
      <span class="scene-stage-hud__actions" role="group" aria-label="Set behavior">
        ${BEHAVIOR_DEFS.map(def => `
          <button type="button" class="${def.id === behaviorDef.id ? 'active' : ''}" data-stage-behavior="${escapeAttribute(def.id)}" aria-label="Set ${escapeAttribute(def.title)} behavior" title="${escapeAttribute(def.title)}">
            <img src="/assets/icons/${escapeAttribute(def.icon)}.svg" alt="" class="icon" />
          </button>
        `).join('')}
      </span>
    `;
  }

  function updateBehaviorPresentation(el, effects = null) {
    if (!el) return;
    const behaviorDef = getBehaviorDef(el.dataset.behavior);
    const behavior = behaviorDef.id;
    const range = getElementRange(el);
    el.dataset.behavior = behavior;
    el.classList.toggle('scene-behavior--scroll', behavior === 'scroll');
    el.classList.toggle('scene-behavior--sticky', behavior === 'sticky');
    el.classList.toggle('scene-behavior--pinned', behavior === 'pinned');
    renderBehaviorBadge(el, behaviorDef, range, effects);
    renderStageBehaviorHud(el, behaviorDef, range, effects);
    if (!shouldShowBehaviorCue(el, effects)) {
      el.querySelector(':scope > .scene-behavior-range-cue')?.remove();
      return;
    }
    const cue = ensureBehaviorRangeCue(el);
    if (!cue) return;
    setRangeVars(cue, range);
    cue.dataset.behavior = behavior;
    cue.innerHTML = `
      <strong>${escapeHtml(behaviorDef.title)}</strong>
      <button type="button" class="scene-behavior-range-cue__point scene-behavior-range-cue__start" data-range-handle="start" aria-label="Adjust scroll range start">Start</button>
      <i></i>
      <button type="button" class="scene-behavior-range-cue__point scene-behavior-range-cue__end" data-range-handle="end" aria-label="Adjust scroll range end">End</button>
    `;
  }

  function applyBehaviorRange(el, startValue, endValue) {
    if (!el) return { ...DEFAULT_SCROLL_RANGE };
    const range = normalizeRange(startValue, endValue);
    el.dataset.scrollStart = String(range.start);
    el.dataset.scrollEnd = String(range.end);
    setRangeVars(el, range);
    updateBehaviorPresentation(el);
    return range;
  }

  function applyElementRangeFromUi(el, range, persist = true) {
    if (!el) return { ...DEFAULT_SCROLL_RANGE };
    const nextRange = applyBehaviorRange(el, range.start, range.end);
    syncInspectorRange(nextRange);
    updateSceneInspector(el, allWidgets.find(w => w.id === el.dataset.widgetId));
    if (persist) gridEl?.__grid?.emitChange?.(el, { contentOnly: true });
    if (persist && pageId && state.autosaveEnabled) scheduleAutosave();
    return nextRange;
  }

  function beginRangeHandleDrag(event, handleEl, targetEl) {
    const handle = handleEl?.dataset?.rangeHandle === 'end' ? 'end' : 'start';
    const trackEl = handleEl?.closest?.('.scene-range-visual, .scene-behavior-range-cue');
    if (!trackEl || !targetEl) return;
    event.preventDefault();
    event.stopPropagation();
    targetEl.classList.add('scene-range-dragging');
    document.body.classList.add('scene-range-dragging');

    const update = moveEvent => {
      const rect = trackEl.getBoundingClientRect();
      const nextRange = rangeFromPointer(
        moveEvent.clientX,
        rect,
        handle,
        getElementRange(targetEl)
      );
      applyElementRangeFromUi(targetEl, nextRange, false);
    };
    const stop = upEvent => {
      update(upEvent);
      applyElementRangeFromUi(targetEl, getElementRange(targetEl), true);
      targetEl.classList.remove('scene-range-dragging');
      document.body.classList.remove('scene-range-dragging');
      document.removeEventListener('pointermove', update);
      document.removeEventListener('pointerup', stop);
      document.removeEventListener('pointercancel', stop);
    };

    handleEl.setPointerCapture?.(event.pointerId);
    update(event);
    document.addEventListener('pointermove', update);
    document.addEventListener('pointerup', stop);
    document.addEventListener('pointercancel', stop);
  }

  function syncInspectorRange(range) {
    if (!sceneInspector) return;
    const startEl = sceneInspector.querySelector('.scene-range-start');
    const endEl = sceneInspector.querySelector('.scene-range-end');
    const visual = sceneInspector.querySelector('.scene-range-visual');
    if (startEl) startEl.value = String(range.start);
    if (endEl) endEl.value = String(range.end);
    setRangeVars(visual, range);
    const viewport = document.getElementById('builderViewport');
    setRangeVars(viewport, range);
    syncInspectorBehaviorPreview(
      state.activeWidgetEl?.dataset?.behavior || 'scroll',
      range,
      state.activeWidgetEl ? getElementEffects(state.activeWidgetEl) : readEffectsFromInspector()
    );
  }

  function parseEffects(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function normalizeEffects(value) {
    const raw = parseEffects(value);
    return EFFECT_DEFS.map(def => {
      const existing = raw.find(item => item?.id === def.id) || {};
      const range = normalizeRange(existing.start ?? def.start, existing.end ?? def.end);
      return {
        id: def.id,
        title: def.title,
        enabled: existing.enabled === true,
        start: range.start,
        end: range.end
      };
    });
  }

  function getElementEffects(el) {
    if (!el) return normalizeEffects([]);
    return normalizeEffects(el.dataset.effects);
  }

  function normalizeOpacity(value) {
    if (value === null || value === undefined || value === '') return 100;
    const raw = typeof value === 'string' && Number.parseFloat(value) <= 1
      ? Number.parseFloat(value) * 100
      : Number.parseFloat(String(value));
    const num = Number.isFinite(raw) ? raw : 100;
    return Math.max(0, Math.min(100, Math.round(num)));
  }

  function normalizeRadius(value) {
    const raw = Number.parseFloat(String(value ?? ''));
    const num = Number.isFinite(raw) ? raw : 8;
    return Math.max(0, Math.min(48, Math.round(num)));
  }

  function getElementAppearance(el) {
    if (!el) return { opacity: 100, radius: 8, name: '' };
    const opacity = normalizeOpacity(el.dataset.opacity || el.style.opacity || 100);
    const content = el.querySelector(':scope > .canvas-item-content');
    const radius = normalizeRadius(el.dataset.radius || content?.style?.borderRadius || 8);
    return {
      opacity,
      radius,
      name: el.dataset.elementName || ''
    };
  }

  function syncWidgetStyleFollowers(sourceEl) {
    return applyWidgetStyleSources(gridEl, sourceEl, {
      onFollower: follower => {
        gridEl?.__grid?.update?.(follower, {}, { silent: true });
        renderEffectCue(follower, getElementEffects(follower));
        renderStageEffectGuides(follower, getElementEffects(follower));
        updateBehaviorPresentation(follower, getElementEffects(follower));
        gridEl?.__grid?.emitChange?.(follower, { contentOnly: true });
      }
    });
  }

  function applyElementAppearance(el, appearance = {}, persist = true) {
    if (!el) return;
    const opacity = normalizeOpacity(appearance.opacity ?? el.dataset.opacity ?? el.style.opacity ?? 100);
    const radius = normalizeRadius(appearance.radius ?? el.dataset.radius ?? 8);
    const name = String(appearance.name ?? el.dataset.elementName ?? '').trim();
    el.dataset.opacity = String(Number((opacity / 100).toFixed(2)));
    el.dataset.radius = String(radius);
    if (name) el.dataset.elementName = name;
    else delete el.dataset.elementName;
    el.style.opacity = String(opacity / 100);
    const content = el.querySelector(':scope > .canvas-item-content');
    if (content) content.style.borderRadius = `${radius}px`;
    if (persist) {
      gridEl?.__grid?.emitChange?.(el, { contentOnly: true });
      syncWidgetStyleFollowers(el);
      if (pageId && state.autosaveEnabled) scheduleAutosave();
    }
  }

  function getNativeElementCode(el) {
    const instanceId = el?.dataset?.instanceId;
    const localCodeMap = ensureCodeMap();
    return instanceId && localCodeMap[instanceId] && typeof localCodeMap[instanceId] === 'object'
      ? localCodeMap[instanceId]
      : null;
  }

  function isNativeButtonElement(el) {
    if (!el) return false;
    const code = getNativeElementCode(el);
    if (code?.meta?.kind === 'button') return true;
    return Boolean(el.querySelector('.scene-native-button'));
  }

  function normalizeButtonHref(value) {
    const href = String(value || '').trim();
    if (!href) return '#';
    const scheme = href.match(/^([a-z][a-z0-9+.-]*):/i);
    if (scheme) {
      const allowed = ['http', 'https', 'mailto', 'tel'];
      return allowed.includes(scheme[1].toLowerCase()) ? href : '#';
    }
    return href;
  }

  function getNativeButtonData(el) {
    const code = getNativeElementCode(el);
    const meta = code?.meta && typeof code.meta === 'object' ? code.meta : {};
    const button = el?.querySelector?.('.scene-native-button');
    const label = String(meta.label || button?.textContent || 'Start now').trim() || 'Start now';
    const href = normalizeButtonHref(meta.href || button?.getAttribute?.('href') || '#');
    return { label, href };
  }

  function buildNativeButtonHtml(label, href) {
    return `<a class="scene-native-button" href="${escapeAttribute(href)}" role="button">${escapeHtml(label)}</a>`;
  }

  function applyNativeButtonContent(el, data = {}, persist = true) {
    if (!el || !isNativeButtonElement(el)) return;
    const current = getNativeButtonData(el);
    const label = String(data.label ?? current.label).trim() || 'Start now';
    const href = normalizeButtonHref(data.href ?? current.href);
    const button = el.querySelector('.scene-native-button');
    if (button) {
      button.textContent = label;
      button.setAttribute('href', href);
    }
    const instanceId = el.dataset.instanceId;
    if (instanceId) {
      const localCodeMap = ensureCodeMap();
      if (!localCodeMap[instanceId] || typeof localCodeMap[instanceId] !== 'object') {
        localCodeMap[instanceId] = {};
      }
      const code = localCodeMap[instanceId];
      const meta = code.meta && typeof code.meta === 'object' ? { ...code.meta } : {};
      if (el.dataset.widgetId === 'htmlBlock' || code.html) {
        code.html = buildNativeButtonHtml(label, href);
      }
      code.meta = {
        ...meta,
        kind: 'button',
        label,
        href
      };
    }
    if (!button && el.dataset.widgetId === 'buttonLink') {
      const widgetDef = allWidgets.find(w => w.id === el.dataset.widgetId);
      if (widgetDef) void renderWidget(el, widgetDef, ensureCodeMap());
    }
    if (!el.dataset.elementName) el.dataset.elementName = 'Button';
    if (persist) {
      gridEl?.__grid?.emitChange?.(el, { contentOnly: true });
      if (pageId && state.autosaveEnabled) scheduleAutosave();
    }
  }

  function getWidgetInstanceCode(el, create = false) {
    const instanceId = el?.dataset?.instanceId;
    if (!instanceId) return null;
    const localCodeMap = ensureCodeMap();
    if (create && (!localCodeMap[instanceId] || typeof localCodeMap[instanceId] !== 'object')) {
      localCodeMap[instanceId] = {};
    }
    return localCodeMap[instanceId] && typeof localCodeMap[instanceId] === 'object'
      ? localCodeMap[instanceId]
      : null;
  }

  function getGalleryMeta(el) {
    const code = getWidgetInstanceCode(el);
    return code?.meta && typeof code.meta === 'object' ? code.meta : {};
  }

  function getCollectionArchiveMeta(el) {
    const code = getWidgetInstanceCode(el);
    return code?.meta && typeof code.meta === 'object' ? code.meta : {};
  }

  function parseGalleryNumber(value, min, max, fallback) {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
    const num = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(min, Math.min(max, Math.round(num)));
  }

  function parseGalleryBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
  }

  function normalizeGalleryChoice(value, allowed, fallback) {
    const normalized = String(value || '').trim().toLowerCase();
    return allowed.includes(normalized) ? normalized : fallback;
  }

  function collectionArchiveDefaults(widgetDef = null) {
    const defaults = widgetDef?.metadata?.defaults && typeof widgetDef.metadata.defaults === 'object'
      ? widgetDef.metadata.defaults
      : {};
    return {
      collectionId: String(defaults.collectionId || defaults.parentId || ''),
      columns: parseGalleryNumber(defaults.columns, 1, 6, 3),
      buttonLabel: String(defaults.buttonLabel || 'Read more')
    };
  }

  function collectionArchiveSettings(el, widgetDef = null) {
    const defaults = collectionArchiveDefaults(widgetDef);
    const meta = getCollectionArchiveMeta(el);
    const nested = meta.settings && typeof meta.settings === 'object' ? meta.settings : {};
    const raw = { ...defaults, ...nested, ...meta };
    return {
      collectionId: String(raw.collectionId || raw.parentId || raw.pageId || defaults.collectionId || ''),
      columns: parseGalleryNumber(raw.columns, 1, 6, defaults.columns),
      buttonLabel: String(raw.buttonLabel || raw.ctaLabel || defaults.buttonLabel || 'Read more')
    };
  }

  function isCollectionArchiveWidget(el, widgetDef = null) {
    return Boolean(el && (el.dataset.widgetId === 'collectionArchive' || widgetDef?.id === 'collectionArchive'));
  }

  function applyCollectionArchiveSettings(el, widgetDef, patch = {}, persist = true) {
    if (!isCollectionArchiveWidget(el, widgetDef)) return;
    const next = {
      ...collectionArchiveSettings(el, widgetDef),
      ...patch
    };
    const code = getWidgetInstanceCode(el, true);
    if (!code) return;
    const existingMeta = code.meta && typeof code.meta === 'object' ? code.meta : {};
    code.meta = {
      ...existingMeta,
      ...next
    };
    void renderWidget(el, widgetDef, ensureCodeMap());
    gridEl?.__grid?.emitChange?.(el, { contentOnly: true });
    if (persist && pageId && state.autosaveEnabled) scheduleAutosave();
  }

  function collectionArchiveFieldValue(target) {
    if (target.type === 'number') return Number.parseFloat(target.value);
    return target.value;
  }

  function updateCollectionArchiveField(target) {
    if (!state.activeWidgetEl) return;
    const widgetDef = allWidgets.find(w => w.id === state.activeWidgetEl.dataset.widgetId);
    if (!isCollectionArchiveWidget(state.activeWidgetEl, widgetDef)) return;
    const field = target.dataset.collectionArchiveField;
    if (!field) return;
    applyCollectionArchiveSettings(state.activeWidgetEl, widgetDef, { [field]: collectionArchiveFieldValue(target) });
    syncInspectorCollectionArchive(state.activeWidgetEl, widgetDef);
  }

  function setCollectionArchiveFieldValue(name, value) {
    const field = sceneInspector?.querySelector(`[data-collection-archive-field="${name}"]`);
    if (!field) return;
    field.value = String(value);
  }

  function normalizeGalleryItem(raw = {}, defaults = {}) {
    const item = typeof raw === 'string' ? { src: raw } : (raw && typeof raw === 'object' ? raw : {});
    return {
      src: String(item.src || item.url || item.mediaUrl || item.image || '').trim(),
      alt: String(item.alt || item.altText || item.title || '').trim(),
      caption: String(item.caption || item.description || '').trim(),
      href: String(item.href || item.link || item.urlTarget || '').trim(),
      fit: normalizeGalleryChoice(item.fit || item.objectFit || defaults.fit, GALLERY_FITS, defaults.fit || 'cover'),
      focalX: parseGalleryNumber(item.focalX ?? item.objectX ?? item.positionX, 0, 100, defaults.focalX ?? 50),
      focalY: parseGalleryNumber(item.focalY ?? item.objectY ?? item.positionY, 0, 100, defaults.focalY ?? 50)
    };
  }

  function normalizeGalleryItems(value, defaults = {}) {
    return Array.isArray(value)
      ? value.map(item => normalizeGalleryItem(item, defaults))
      : [];
  }

  function galleryDefaults(widgetDef = null) {
    const defaults = widgetDef?.metadata?.defaults && typeof widgetDef.metadata.defaults === 'object'
      ? widgetDef.metadata.defaults
      : {};
    const mode = String(defaults.mode || defaults.layout || 'grid').toLowerCase();
    return {
      mode: mode === 'slider' ? 'carousel' : normalizeGalleryChoice(mode, GALLERY_LAYOUTS.map(item => item.id), 'grid'),
      columns: parseGalleryNumber(defaults.columns, 1, 8, 3),
      rows: parseGalleryNumber(defaults.rows ?? defaults.rowCount, 0, 12, 0),
      aspectRatio: String(defaults.aspectRatio || defaults.ratio || 'square'),
      heightMode: normalizeGalleryChoice(defaults.heightMode || defaults.heightStrategy, GALLERY_HEIGHT_MODES.map(item => item.id), 'ratio'),
      fit: normalizeGalleryChoice(defaults.fit || defaults.objectFit, GALLERY_FITS, 'cover'),
      focalX: parseGalleryNumber(defaults.focalX ?? defaults.objectX ?? defaults.positionX, 0, 100, 50),
      focalY: parseGalleryNumber(defaults.focalY ?? defaults.objectY ?? defaults.positionY, 0, 100, 50),
      sliderAnimation: normalizeGalleryChoice(defaults.sliderAnimation || defaults.animation || defaults.effect, GALLERY_ANIMATIONS.map(item => item.id), 'slide'),
      animationSpeed: parseGalleryNumber(defaults.animationSpeed ?? defaults.duration ?? defaults.speed, 0, 5000, 360),
      autoplay: parseGalleryBoolean(defaults.autoplay, false),
      autoplayDelay: parseGalleryNumber(defaults.autoplayDelay ?? defaults.autoplaySpeed, 500, 30000, 4000),
      loop: parseGalleryBoolean(defaults.loop, true),
      showControls: parseGalleryBoolean(defaults.showControls ?? defaults.controls, true),
      showDots: parseGalleryBoolean(defaults.showDots ?? defaults.dots, true),
      pauseOnHover: parseGalleryBoolean(defaults.pauseOnHover, true),
      slidesToShow: parseGalleryNumber(defaults.slidesToShow ?? defaults.slidesPerView, 1, 4, 1),
      slidesToScroll: parseGalleryNumber(defaults.slidesToScroll, 1, 4, 1),
      items: normalizeGalleryItems(defaults.items || defaults.images || defaults.media, defaults)
    };
  }

  function gallerySettings(el, widgetDef = null) {
    const defaults = galleryDefaults(widgetDef);
    const meta = getGalleryMeta(el);
    const nested = meta.settings && typeof meta.settings === 'object' ? meta.settings : {};
    const raw = { ...defaults, ...nested, ...meta };
    const mode = String(raw.mode || raw.layout || defaults.mode).toLowerCase();
    const normalized = {
      ...defaults,
      mode: mode === 'slider' ? 'carousel' : normalizeGalleryChoice(mode, GALLERY_LAYOUTS.map(item => item.id), defaults.mode),
      columns: parseGalleryNumber(raw.columns, 1, 8, defaults.columns),
      rows: parseGalleryNumber(raw.rows ?? raw.rowCount, 0, 12, defaults.rows),
      aspectRatio: String(raw.aspectRatio || raw.ratio || defaults.aspectRatio),
      heightMode: normalizeGalleryChoice(raw.heightMode || raw.heightStrategy, GALLERY_HEIGHT_MODES.map(item => item.id), defaults.heightMode),
      fit: normalizeGalleryChoice(raw.fit || raw.objectFit, GALLERY_FITS, defaults.fit),
      focalX: parseGalleryNumber(raw.focalX ?? raw.objectX ?? raw.positionX, 0, 100, defaults.focalX),
      focalY: parseGalleryNumber(raw.focalY ?? raw.objectY ?? raw.positionY, 0, 100, defaults.focalY),
      sliderAnimation: normalizeGalleryChoice(raw.sliderAnimation || raw.animation || raw.effect, GALLERY_ANIMATIONS.map(item => item.id), defaults.sliderAnimation),
      animationSpeed: parseGalleryNumber(raw.animationSpeed ?? raw.duration ?? raw.speed, 0, 5000, defaults.animationSpeed),
      autoplay: parseGalleryBoolean(raw.autoplay, defaults.autoplay),
      autoplayDelay: parseGalleryNumber(raw.autoplayDelay ?? raw.autoplaySpeed, 500, 30000, defaults.autoplayDelay),
      loop: parseGalleryBoolean(raw.loop, defaults.loop),
      showControls: parseGalleryBoolean(raw.showControls ?? raw.controls, defaults.showControls),
      showDots: parseGalleryBoolean(raw.showDots ?? raw.dots, defaults.showDots),
      pauseOnHover: parseGalleryBoolean(raw.pauseOnHover, defaults.pauseOnHover),
      slidesToShow: parseGalleryNumber(raw.slidesToShow ?? raw.slidesPerView, 1, 4, defaults.slidesToShow),
      slidesToScroll: parseGalleryNumber(raw.slidesToScroll, 1, 4, defaults.slidesToScroll)
    };
    normalized.items = normalizeGalleryItems(raw.items || raw.images || raw.media, normalized);
    return normalized;
  }

  function isGalleryWidget(el, widgetDef = null) {
    return Boolean(el && (el.dataset.widgetId === 'gallery' || widgetDef?.id === 'gallery'));
  }

  function applyGallerySettings(el, widgetDef, patch = {}, persist = true) {
    if (!isGalleryWidget(el, widgetDef)) return;
    const next = gallerySettings(el, widgetDef);
    Object.assign(next, patch);
    next.items = normalizeGalleryItems(next.items, next);
    const code = getWidgetInstanceCode(el, true);
    if (!code) return;
    const existingMeta = code.meta && typeof code.meta === 'object' ? code.meta : {};
    code.meta = {
      ...existingMeta,
      ...next
    };
    void renderWidget(el, widgetDef, ensureCodeMap());
    gridEl?.__grid?.emitChange?.(el, { contentOnly: true });
    if (persist && pageId && state.autosaveEnabled) scheduleAutosave();
  }

  function galleryFieldValue(target) {
    if (target.type === 'checkbox') return target.checked;
    if (target.type === 'number' || target.type === 'range') return Number.parseFloat(target.value);
    return target.value;
  }

  function updateGalleryField(target) {
    if (!state.activeWidgetEl) return;
    const widgetDef = allWidgets.find(w => w.id === state.activeWidgetEl.dataset.widgetId);
    if (!isGalleryWidget(state.activeWidgetEl, widgetDef)) return;
    const field = target.dataset.galleryField;
    if (!field) return;
    applyGallerySettings(state.activeWidgetEl, widgetDef, { [field]: galleryFieldValue(target) });
    syncInspectorGallery(state.activeWidgetEl, widgetDef, { keepItems: true });
  }

  function updateGalleryItemField(target) {
    if (!state.activeWidgetEl) return;
    const widgetDef = allWidgets.find(w => w.id === state.activeWidgetEl.dataset.widgetId);
    if (!isGalleryWidget(state.activeWidgetEl, widgetDef)) return;
    const index = Number.parseInt(target.dataset.galleryItemIndex || '-1', 10);
    const field = target.dataset.galleryItemField;
    if (!field || index < 0) return;
    const settings = gallerySettings(state.activeWidgetEl, widgetDef);
    const items = settings.items.slice();
    const item = { ...(items[index] || normalizeGalleryItem({}, settings)) };
    item[field] = galleryFieldValue(target);
    items[index] = normalizeGalleryItem(item, settings);
    applyGallerySettings(state.activeWidgetEl, widgetDef, { items });
  }

  function addGalleryItem() {
    if (!state.activeWidgetEl) return;
    const widgetDef = allWidgets.find(w => w.id === state.activeWidgetEl.dataset.widgetId);
    if (!isGalleryWidget(state.activeWidgetEl, widgetDef)) return;
    const settings = gallerySettings(state.activeWidgetEl, widgetDef);
    const items = settings.items.concat(normalizeGalleryItem({}, settings));
    applyGallerySettings(state.activeWidgetEl, widgetDef, { items });
    syncInspectorGallery(state.activeWidgetEl, widgetDef);
  }

  function removeGalleryItem(index) {
    if (!state.activeWidgetEl) return;
    const widgetDef = allWidgets.find(w => w.id === state.activeWidgetEl.dataset.widgetId);
    if (!isGalleryWidget(state.activeWidgetEl, widgetDef)) return;
    const settings = gallerySettings(state.activeWidgetEl, widgetDef);
    const items = settings.items.filter((_, itemIndex) => itemIndex !== index);
    applyGallerySettings(state.activeWidgetEl, widgetDef, { items });
    syncInspectorGallery(state.activeWidgetEl, widgetDef);
  }

  function setGalleryFieldValue(name, value) {
    const field = sceneInspector?.querySelector(`[data-gallery-field="${name}"]`);
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = String(value);
  }

  function renderGalleryItems(items) {
    const list = sceneInspector?.querySelector('.scene-gallery-items');
    if (!list) return;
    list.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'scene-gallery-empty';
      empty.textContent = 'No images';
      list.appendChild(empty);
      return;
    }
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'scene-gallery-item';
      row.innerHTML = `
        <div class="scene-gallery-item-head">
          <strong>Image ${index + 1}</strong>
          <button type="button" data-gallery-remove-image="${index}" aria-label="Remove image ${index + 1}">
            <img src="/assets/icons/trash-2.svg" alt="" class="icon" />
          </button>
        </div>
        <label class="scene-select-field"><span>URL</span><input data-gallery-item-index="${index}" data-gallery-item-field="src" value="${escapeAttribute(item.src)}" inputmode="url" /></label>
        <label class="scene-select-field"><span>Alt</span><input data-gallery-item-index="${index}" data-gallery-item-field="alt" value="${escapeAttribute(item.alt)}" /></label>
        <label class="scene-select-field"><span>Caption</span><input data-gallery-item-index="${index}" data-gallery-item-field="caption" value="${escapeAttribute(item.caption)}" /></label>
        <label class="scene-select-field"><span>Link</span><input data-gallery-item-index="${index}" data-gallery-item-field="href" value="${escapeAttribute(item.href)}" inputmode="url" /></label>
        <label class="scene-select-field">
          <span>Fit</span>
          <select data-gallery-item-index="${index}" data-gallery-item-field="fit">
            ${GALLERY_FITS.map(fit => `<option value="${fit}"${fit === item.fit ? ' selected' : ''}>${fit}</option>`).join('')}
          </select>
        </label>
        <div class="scene-field-grid">
          <label><span>X</span><input data-gallery-item-index="${index}" data-gallery-item-field="focalX" type="number" min="0" max="100" step="1" value="${escapeAttribute(item.focalX)}" inputmode="numeric" /></label>
          <label><span>Y</span><input data-gallery-item-index="${index}" data-gallery-item-field="focalY" type="number" min="0" max="100" step="1" value="${escapeAttribute(item.focalY)}" inputmode="numeric" /></label>
        </div>
      `;
      list.appendChild(row);
    });
  }

  function syncInspectorGallery(el, widgetDef = null, options = {}) {
    if (!sceneInspector) return;
    const group = sceneInspector.querySelector('.scene-gallery-settings');
    const sliderGroup = sceneInspector.querySelector('.scene-gallery-slider-settings');
    const isGallery = isGalleryWidget(el, widgetDef);
    if (group) group.hidden = !isGallery;
    if (!isGallery) {
      const list = sceneInspector.querySelector('.scene-gallery-items');
      if (list) list.innerHTML = '';
      return;
    }
    const settings = gallerySettings(el, widgetDef);
    setGalleryFieldValue('mode', settings.mode);
    setGalleryFieldValue('columns', settings.columns);
    setGalleryFieldValue('rows', settings.rows);
    setGalleryFieldValue('aspectRatio', settings.aspectRatio);
    setGalleryFieldValue('heightMode', settings.heightMode);
    setGalleryFieldValue('fit', settings.fit);
    setGalleryFieldValue('focalX', settings.focalX);
    setGalleryFieldValue('focalY', settings.focalY);
    setGalleryFieldValue('sliderAnimation', settings.sliderAnimation);
    setGalleryFieldValue('animationSpeed', settings.animationSpeed);
    setGalleryFieldValue('autoplay', settings.autoplay);
    setGalleryFieldValue('autoplayDelay', settings.autoplayDelay);
    setGalleryFieldValue('loop', settings.loop);
    setGalleryFieldValue('showControls', settings.showControls);
    setGalleryFieldValue('showDots', settings.showDots);
    setGalleryFieldValue('pauseOnHover', settings.pauseOnHover);
    setGalleryFieldValue('slidesToShow', settings.slidesToShow);
    setGalleryFieldValue('slidesToScroll', settings.slidesToScroll);
    if (sliderGroup) sliderGroup.hidden = settings.mode !== 'carousel';
    if (!options.keepItems) renderGalleryItems(settings.items);
  }

  function syncInspectorCollectionArchive(el, widgetDef = null) {
    if (!sceneInspector) return;
    const group = sceneInspector.querySelector('.scene-collection-archive-settings');
    const isArchive = isCollectionArchiveWidget(el, widgetDef);
    if (group) group.hidden = !isArchive;
    if (!isArchive) return;
    const settings = collectionArchiveSettings(el, widgetDef);
    setCollectionArchiveFieldValue('collectionId', settings.collectionId);
    setCollectionArchiveFieldValue('columns', settings.columns);
    setCollectionArchiveFieldValue('buttonLabel', settings.buttonLabel);
  }

  function syncInspectorAppearance(el, widgetDef = null) {
    if (!sceneInspector) return;
    const nameInput = sceneInspector.querySelector('.scene-element-name');
    const typeInput = sceneInspector.querySelector('.scene-element-type');
    const opacityRange = sceneInspector.querySelector('.scene-opacity-range');
    const opacityValue = sceneInspector.querySelector('.scene-opacity-value');
    const radiusRange = sceneInspector.querySelector('.scene-radius-range');
    const radiusValue = sceneInspector.querySelector('.scene-radius-value');
    const appearance = getElementAppearance(el);
    const label = el
      ? appearance.name || widgetDef?.metadata?.label || el.dataset.widgetId || 'Element'
      : getActiveScene()?.title || 'Section';
    if (nameInput) {
      nameInput.value = label;
      nameInput.disabled = !el;
    }
    if (typeInput) typeInput.value = el ? (widgetDef?.metadata?.label || el.dataset.widgetId || 'Element') : 'Section';
    if (opacityRange) opacityRange.value = String(appearance.opacity);
    if (opacityValue) opacityValue.value = String(appearance.opacity);
    if (radiusRange) radiusRange.value = String(appearance.radius);
    if (radiusValue) radiusValue.value = String(appearance.radius);
  }

  function syncInspectorButton(el) {
    if (!sceneInspector) return;
    const group = sceneInspector.querySelector('.scene-button-settings');
    const labelInput = sceneInspector.querySelector('.scene-button-label');
    const hrefInput = sceneInspector.querySelector('.scene-button-href');
    const isButton = isNativeButtonElement(el);
    if (group) group.hidden = !isButton;
    if (labelInput) labelInput.disabled = !isButton;
    if (hrefInput) hrefInput.disabled = !isButton;
    if (!isButton) {
      if (labelInput) labelInput.value = '';
      if (hrefInput) hrefInput.value = '';
      return;
    }
    const data = getNativeButtonData(el);
    if (labelInput) labelInput.value = data.label;
    if (hrefInput) hrefInput.value = data.href;
  }

  function syncInspectorScene(scene = getActiveScene()) {
    if (!sceneInspector || !scene) return;
    const sceneName = sceneInspector.querySelector('.scene-layer-scene-name');
    if (sceneName) sceneName.textContent = scene.title;
  }

  function applySceneBackground(scene, value) {
    if (!scene) return DEFAULT_SCENE_BACKGROUND;
    const background = normalizeSceneColor(value, getSceneBackground(scene));
    scene.background = background;
    updateSceneBackgroundReferences(scene.id, background);
    syncInspectorScene(scene);
    applyActiveSceneStyle();
    return background;
  }

  function compactEffects(effects) {
    return effects
      .filter(effect => effect.enabled)
      .map(effect => ({
        id: effect.id,
        enabled: true,
        start: effect.start,
        end: effect.end
      }));
  }

  function effectLabel(effect) {
    const def = EFFECT_DEFS.find(item => item.id === effect.id);
    return def?.title || effect.title || effect.id;
  }

  function renderEffectCue(el, effects) {
    if (!el) return;
    const enabled = compactEffects(effects);
    let cue = el.querySelector(':scope > .scene-effect-cue');
    if (!enabled.length) {
      cue?.remove();
      return;
    }
    if (!cue) {
      cue = document.createElement('div');
      cue.className = 'scene-effect-cue';
      cue.setAttribute('aria-hidden', 'true');
      el.appendChild(cue);
    }
    cue.innerHTML = enabled
      .map(effect => `<span>${escapeHtml(effectLabel(effect))}<small>${effect.start}% - ${effect.end}%</small></span>`)
      .join('');
  }

  function renderStageEffectGuides(el, effects) {
    if (!el) return;
    const enabled = compactEffects(effects);
    const moveEffect = enabled.find(effect => effect.id === 'moveY');
    const fadeEffects = enabled.filter(effect => effect.id === 'fadeIn' || effect.id === 'fadeOut');
    let guide = el.querySelector(':scope > .scene-stage-effect-guide');
    if (!moveEffect && !fadeEffects.length) {
      guide?.remove();
      return;
    }
    if (!guide) {
      guide = document.createElement('div');
      guide.className = 'scene-stage-effect-guide';
      guide.setAttribute('aria-hidden', 'true');
      el.appendChild(guide);
    }
    const moveMarkup = moveEffect
      ? `<span class="scene-stage-effect-guide__motion">
          <small>Move</small>
          <i></i>
          <b class="scene-stage-effect-guide__start">${moveEffect.start}%</b>
          <b class="scene-stage-effect-guide__end">${moveEffect.end}%</b>
        </span>`
      : '';
    const fadeMarkup = fadeEffects.length
      ? `<span class="scene-stage-effect-guide__visibility">
          ${fadeEffects.map(effect => `<em>${escapeHtml(effectLabel(effect))}<small>${effect.start}% - ${effect.end}%</small></em>`).join('')}
        </span>`
      : '';
    guide.innerHTML = `${moveMarkup}${fadeMarkup}`;
  }

  function applyEffectsToElement(el, effects) {
    if (!el) return;
    const normalized = normalizeEffects(effects);
    const enabled = compactEffects(normalized);
    if (enabled.length) {
      el.dataset.effects = JSON.stringify(enabled);
    } else {
      delete el.dataset.effects;
    }
    renderEffectCue(el, normalized);
    renderStageEffectGuides(el, normalized);
    updateBehaviorPresentation(el, normalized);
  }

  function syncInspectorEffects(effects) {
    if (!sceneInspector) return;
    const normalized = normalizeEffects(effects);
    sceneInspector.querySelectorAll('.scene-effect-item').forEach(item => {
      const effectId = item.dataset.effectId;
      const effect = normalized.find(entry => entry.id === effectId);
      if (!effect) return;
      const toggle = item.querySelector('[data-effect-toggle]');
      const start = item.querySelector('[data-effect-start]');
      const end = item.querySelector('[data-effect-end]');
      const range = item.querySelector('.scene-effect-range');
      if (toggle) toggle.checked = Boolean(effect.enabled);
      if (start) start.value = String(effect.start);
      if (end) end.value = String(effect.end);
      setRangeVars(range, effect);
      item.classList.toggle('active', Boolean(effect.enabled));
    });
    syncInspectorBehaviorPreview(
      state.activeWidgetEl?.dataset?.behavior || 'scroll',
      state.activeWidgetEl ? getElementRange(state.activeWidgetEl) : normalizeRange(
        sceneInspector.querySelector('.scene-range-start')?.value,
        sceneInspector.querySelector('.scene-range-end')?.value
      ),
      normalized
    );
  }

  function getEffectItemRange(item) {
    const startEl = item?.querySelector?.('[data-effect-start]');
    const endEl = item?.querySelector?.('[data-effect-end]');
    return normalizeRange(startEl?.value, endEl?.value);
  }

  function applyEffectItemRange(item, range, enable = true) {
    if (!item) return;
    const nextRange = normalizeRange(range.start, range.end);
    const startEl = item.querySelector('[data-effect-start]');
    const endEl = item.querySelector('[data-effect-end]');
    const toggle = item.querySelector('[data-effect-toggle]');
    const visual = item.querySelector('.scene-effect-range');
    if (startEl) startEl.value = String(nextRange.start);
    if (endEl) endEl.value = String(nextRange.end);
    if (enable && toggle) toggle.checked = true;
    setRangeVars(visual, nextRange);
    item.classList.toggle('active', Boolean(toggle?.checked));
  }

  function beginEffectRangeDrag(event, handleEl) {
    const handle = handleEl?.dataset?.effectRangeHandle === 'end' ? 'end' : 'start';
    const item = handleEl?.closest?.('.scene-effect-item');
    const trackEl = handleEl?.closest?.('.scene-effect-range');
    if (!item || !trackEl) return;
    event.preventDefault();
    event.stopPropagation();
    item.classList.add('scene-effect-item--dragging');
    document.body.classList.add('scene-range-dragging');

    const update = (moveEvent, persist = false) => {
      const rect = trackEl.getBoundingClientRect();
      const nextRange = rangeFromPointer(
        moveEvent.clientX,
        rect,
        handle,
        getEffectItemRange(item)
      );
      applyEffectItemRange(item, nextRange, true);
      updateEffectsFromInspector(persist);
    };
    const stop = upEvent => {
      update(upEvent, true);
      item.classList.remove('scene-effect-item--dragging');
      document.body.classList.remove('scene-range-dragging');
      document.removeEventListener('pointermove', update);
      document.removeEventListener('pointerup', stop);
      document.removeEventListener('pointercancel', stop);
    };

    handleEl.setPointerCapture?.(event.pointerId);
    update(event, false);
    document.addEventListener('pointermove', update);
    document.addEventListener('pointerup', stop);
    document.addEventListener('pointercancel', stop);
  }

  function readEffectsFromInspector() {
    const effects = [];
    sceneInspector?.querySelectorAll('.scene-effect-item').forEach(item => {
      const effectId = item.dataset.effectId;
      const def = EFFECT_DEFS.find(entry => entry.id === effectId);
      if (!def) return;
      const toggle = item.querySelector('[data-effect-toggle]');
      const startEl = item.querySelector('[data-effect-start]');
      const endEl = item.querySelector('[data-effect-end]');
      const range = normalizeRange(startEl?.value ?? def.start, endEl?.value ?? def.end);
      effects.push({
        id: def.id,
        title: def.title,
        enabled: Boolean(toggle?.checked),
        start: range.start,
        end: range.end
      });
    });
    return effects;
  }

  function updateEffectsFromInspector(persist = true) {
    const effects = readEffectsFromInspector();
    syncInspectorEffects(effects);
    if (state.activeWidgetEl) {
      applyEffectsToElement(state.activeWidgetEl, effects);
      if (persist) {
        gridEl?.__grid?.emitChange?.(state.activeWidgetEl, { contentOnly: true });
        syncWidgetStyleFollowers(state.activeWidgetEl);
      }
      if (persist && pageId && state.autosaveEnabled) scheduleAutosave();
    }
  }

  function normalizeInspectorMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return INSPECTOR_MODES.includes(mode) ? mode : 'content';
  }

  function setInspectorMode(mode, inspectorEl = sceneInspector) {
    if (!inspectorEl) return;
    activeInspectorMode = normalizeInspectorMode(mode);
    inspectorEl.dataset.activeMode = activeInspectorMode;
    inspectorEl.querySelectorAll('[data-inspector-mode]').forEach(btn => {
      const active = btn.dataset.inspectorMode === activeInspectorMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function ensureSceneInspector() {
    let inspector = document.getElementById('sceneInspector');
    const row = document.getElementById('builderRow');
    if (!inspector && row) {
      inspector = document.createElement('aside');
      inspector.id = 'sceneInspector';
      inspector.className = 'scene-inspector';
      inspector.setAttribute('aria-label', 'Scene inspector');
      row.insertBefore(inspector, document.getElementById('publishPanel'));
    }
    if (!inspector) return null;
    inspector.innerHTML = `
      <div class="scene-inspector-header">
        <div>
          <p class="scene-inspector-kicker">Selected</p>
          <h2 class="scene-inspector-title">Section</h2>
        </div>
        <button type="button" class="scene-inspector-icon" aria-label="More options">
          <img src="/assets/icons/ellipsis.svg" alt="" class="icon" />
        </button>
      </div>

      <div class="scene-inspector-modebar" role="tablist" aria-label="Inspector mode">
        <button type="button" class="active" data-inspector-mode="content" role="tab" aria-selected="true">Content</button>
        <button type="button" data-inspector-mode="behavior" role="tab" aria-selected="false">Behavior</button>
        <button type="button" data-inspector-mode="style" role="tab" aria-selected="false">Style</button>
      </div>

      <section class="scene-inspector-group scene-layer-settings" data-inspector-panel="content">
        <div class="scene-group-title-row">
          <h3>Layers</h3>
          <small class="scene-layer-scene-name"></small>
        </div>
        <div class="scene-inspector-layer-list" role="list" aria-label="Layers in active scene"></div>
      </section>

      <section class="scene-inspector-group" data-inspector-panel="content">
        <h3>Element</h3>
        <label class="scene-select-field"><span>Name</span><input class="scene-element-name" value="" /></label>
        <label class="scene-select-field"><span>Type</span><input class="scene-element-type" value="Section" readonly /></label>
      </section>

      <section class="scene-inspector-group scene-button-settings" data-inspector-panel="content" hidden>
        <h3>Button</h3>
        <label class="scene-select-field"><span>Label</span><input class="scene-button-label" value="" /></label>
        <label class="scene-select-field"><span>Link</span><input class="scene-button-href" value="#" inputmode="url" /></label>
      </section>

      <section class="scene-inspector-group scene-collection-archive-settings" data-inspector-panel="content" hidden>
        <h3>Collection Archive</h3>
        <label class="scene-select-field"><span>Collection ID</span><input data-collection-archive-field="collectionId" value="" /></label>
        <div class="scene-field-grid">
          <label><span>Columns</span><input data-collection-archive-field="columns" type="number" min="1" max="6" step="1" value="3" inputmode="numeric" /></label>
        </div>
        <label class="scene-select-field"><span>Button label</span><input data-collection-archive-field="buttonLabel" value="Read more" /></label>
      </section>

      <section class="scene-inspector-group scene-gallery-settings" data-inspector-panel="content" hidden>
        <h3>Gallery</h3>
        <label class="scene-select-field">
          <span>Layout</span>
          <select data-gallery-field="mode">
            ${GALLERY_LAYOUTS.map(layout => `<option value="${layout.id}">${layout.title}</option>`).join('')}
          </select>
        </label>
        <div class="scene-field-grid">
          <label><span>Columns</span><input data-gallery-field="columns" type="number" min="1" max="8" step="1" value="3" inputmode="numeric" /></label>
          <label><span>Rows</span><input data-gallery-field="rows" type="number" min="0" max="12" step="1" value="0" inputmode="numeric" /></label>
        </div>
        <label class="scene-select-field">
          <span>Ratio</span>
          <select data-gallery-field="aspectRatio">
            <option value="square">Square</option>
            <option value="video">Video</option>
            <option value="portrait">Portrait</option>
            <option value="">Natural</option>
          </select>
        </label>
        <label class="scene-select-field">
          <span>Height</span>
          <select data-gallery-field="heightMode">
            ${GALLERY_HEIGHT_MODES.map(mode => `<option value="${mode.id}">${mode.title}</option>`).join('')}
          </select>
        </label>
        <label class="scene-select-field">
          <span>Default fit</span>
          <select data-gallery-field="fit">
            ${GALLERY_FITS.map(fit => `<option value="${fit}">${fit}</option>`).join('')}
          </select>
        </label>
        <div class="scene-field-grid">
          <label><span>Focus X</span><input data-gallery-field="focalX" type="number" min="0" max="100" step="1" value="50" inputmode="numeric" /></label>
          <label><span>Focus Y</span><input data-gallery-field="focalY" type="number" min="0" max="100" step="1" value="50" inputmode="numeric" /></label>
        </div>

        <div class="scene-gallery-slider-settings">
          <h4>Slider</h4>
          <label class="scene-select-field">
            <span>Animation</span>
            <select data-gallery-field="sliderAnimation">
              ${GALLERY_ANIMATIONS.map(animation => `<option value="${animation.id}">${animation.title}</option>`).join('')}
            </select>
          </label>
          <div class="scene-field-grid">
            <label><span>Speed</span><input data-gallery-field="animationSpeed" type="number" min="0" max="5000" step="50" value="360" inputmode="numeric" /></label>
            <label><span>Delay</span><input data-gallery-field="autoplayDelay" type="number" min="500" max="30000" step="100" value="4000" inputmode="numeric" /></label>
            <label><span>Show</span><input data-gallery-field="slidesToShow" type="number" min="1" max="4" step="1" value="1" inputmode="numeric" /></label>
            <label><span>Scroll</span><input data-gallery-field="slidesToScroll" type="number" min="1" max="4" step="1" value="1" inputmode="numeric" /></label>
          </div>
          <div class="scene-toggle-grid">
            <label class="scene-toggle-field"><input data-gallery-field="autoplay" type="checkbox" /><span>Autoplay</span></label>
            <label class="scene-toggle-field"><input data-gallery-field="loop" type="checkbox" /><span>Loop</span></label>
            <label class="scene-toggle-field"><input data-gallery-field="showControls" type="checkbox" /><span>Arrows</span></label>
            <label class="scene-toggle-field"><input data-gallery-field="showDots" type="checkbox" /><span>Dots</span></label>
            <label class="scene-toggle-field"><input data-gallery-field="pauseOnHover" type="checkbox" /><span>Pause</span></label>
          </div>
        </div>

        <div class="scene-gallery-items-head">
          <h4>Images</h4>
          <button type="button" data-gallery-add-image aria-label="Add image">
            <img src="/assets/icons/plus.svg" alt="" class="icon" />
          </button>
        </div>
        <div class="scene-gallery-items"></div>
      </section>

      <section class="scene-inspector-group" data-inspector-panel="behavior">
        <div class="scene-behavior-preview" data-behavior="scroll" data-effects="0" style="--scene-range-start:10%;--scene-range-end:60%;--scene-range-mid:35%">
          <div class="scene-behavior-preview-head">
            <span>
              <strong class="scene-behavior-preview-title">Scroll</strong>
              <small class="scene-behavior-preview-detail">10% - 60% / No effects</small>
            </span>
            <img src="/assets/icons/sparkles.svg" alt="" class="icon" />
          </div>
          <div class="scene-behavior-preview-stage" aria-hidden="true">
            <i class="scene-behavior-preview-window"></i>
            <i class="scene-behavior-preview-range"></i>
            <span class="scene-behavior-preview-marker scene-behavior-preview-marker--start">Start</span>
            <span class="scene-behavior-preview-element">Scroll</span>
            <span class="scene-behavior-preview-marker scene-behavior-preview-marker--end">End</span>
          </div>
          <div class="scene-behavior-preview-effects" aria-label="Active effects">
            <span class="is-empty">No effects</span>
          </div>
        </div>
      </section>

      <section class="scene-inspector-group" data-inspector-panel="behavior">
        <h3>Behavior</h3>
        <div class="scene-segmented-control" role="group" aria-label="Behavior">
          ${BEHAVIOR_DEFS.map((behavior, index) => `
            <button type="button" class="${index === 0 ? 'active' : ''}" data-behavior-value="${behavior.id}">
              <img src="/assets/icons/${behavior.icon}.svg" alt="" class="icon" />
              <span>${behavior.title}</span>
            </button>
          `).join('')}
        </div>
      </section>

      <section class="scene-inspector-group" data-inspector-panel="behavior">
        <h3>Scroll range</h3>
        <div class="scene-field-grid">
          <label><span>Start</span><input class="scene-range-start" type="number" min="0" max="100" step="1" value="10" inputmode="numeric" /></label>
          <label><span>End</span><input class="scene-range-end" type="number" min="0" max="100" step="1" value="60" inputmode="numeric" /></label>
        </div>
        <div class="scene-range-visual" data-range-track aria-label="Scroll range handles">
          <button type="button" class="scene-range-handle scene-range-handle--start" data-range-handle="start" aria-label="Adjust scroll range start"></button>
          <button type="button" class="scene-range-handle scene-range-handle--end" data-range-handle="end" aria-label="Adjust scroll range end"></button>
        </div>
      </section>

      <section class="scene-inspector-group" data-inspector-panel="behavior">
        <div class="scene-group-title-row">
          <h3>Effects</h3>
          <button type="button" class="scene-inspector-icon" aria-label="Add effect">
            <img src="/assets/icons/plus.svg" alt="" class="icon" />
          </button>
        </div>
        <div class="scene-effect-list">
          ${EFFECT_DEFS.map(effect => `
            <div class="scene-effect-item" data-effect-id="${effect.id}">
              <label class="scene-effect-toggle">
                <input type="checkbox" data-effect-toggle data-effect-id="${effect.id}" />
                <span></span>
              </label>
              <span class="scene-effect-copy">
                <strong>${effect.title}</strong>
                <small><input data-effect-start data-effect-id="${effect.id}" type="number" min="0" max="100" step="1" value="${effect.start}" /> - <input data-effect-end data-effect-id="${effect.id}" type="number" min="0" max="100" step="1" value="${effect.end}" />%</small>
                <span class="scene-effect-range" data-effect-range data-effect-id="${effect.id}" style="--scene-range-start:${effect.start}%;--scene-range-end:${effect.end}%">
                  <button type="button" class="scene-effect-range-handle scene-effect-range-handle--start" data-effect-range-handle="start" data-effect-id="${effect.id}" aria-label="Adjust ${effect.title} start"></button>
                  <button type="button" class="scene-effect-range-handle scene-effect-range-handle--end" data-effect-range-handle="end" data-effect-id="${effect.id}" aria-label="Adjust ${effect.title} end"></button>
                </span>
              </span>
              <img src="/assets/icons/${effect.icon}.svg" alt="" class="icon" />
            </div>
          `).join('')}
        </div>
      </section>

      <section class="scene-inspector-group" data-inspector-panel="style">
        <h3>Position</h3>
        <div class="scene-field-grid">
          <label><span>X</span><input class="scene-pos-x" value="50 %" readonly /></label>
          <label><span>Y</span><input class="scene-pos-y" value="40 %" readonly /></label>
        </div>
      </section>

      <section class="scene-inspector-group" data-inspector-panel="style">
        <h3>Appearance</h3>
        <label class="scene-slider-field">
          <span>Opacity</span>
          <input class="scene-opacity-range" type="range" min="0" max="100" step="1" value="100" />
          <input class="scene-opacity-value" type="number" min="0" max="100" step="1" value="100" inputmode="numeric" />
        </label>
        <label class="scene-slider-field">
          <span>Radius</span>
          <input class="scene-radius-range" type="range" min="0" max="48" step="1" value="8" />
          <input class="scene-radius-value" type="number" min="0" max="48" step="1" value="8" inputmode="numeric" />
        </label>
      </section>
    `;
    inspector.addEventListener('click', event => {
      const modeBtn = event.target.closest('[data-inspector-mode]');
      if (modeBtn) {
        setInspectorMode(modeBtn.dataset.inspectorMode);
        inspector.querySelectorAll('[data-inspector-mode]').forEach(btn => {
          btn.setAttribute('aria-selected', btn.dataset.inspectorMode === activeInspectorMode ? 'true' : 'false');
        });
        return;
      }
      const galleryAddBtn = event.target.closest('[data-gallery-add-image]');
      if (galleryAddBtn) {
        addGalleryItem();
        return;
      }
      const galleryRemoveBtn = event.target.closest('[data-gallery-remove-image]');
      if (galleryRemoveBtn) {
        removeGalleryItem(Number.parseInt(galleryRemoveBtn.dataset.galleryRemoveImage || '-1', 10));
        return;
      }
      const behaviorBtn = event.target.closest('[data-behavior-value]');
      if (!behaviorBtn) return;
      inspector.querySelectorAll('[data-behavior-value]').forEach(btn => btn.classList.remove('active'));
      behaviorBtn.classList.add('active');
      if (state.activeWidgetEl) {
        state.activeWidgetEl.dataset.behavior = normalizeBehavior(behaviorBtn.dataset.behaviorValue);
        applyBehaviorRange(
          state.activeWidgetEl,
          state.activeWidgetEl.dataset.scrollStart,
          state.activeWidgetEl.dataset.scrollEnd
        );
        syncInspectorBehaviorPreview(
          state.activeWidgetEl.dataset.behavior,
          getElementRange(state.activeWidgetEl),
          getElementEffects(state.activeWidgetEl)
        );
        renderSceneLayers();
        if (pageId && state.autosaveEnabled) scheduleAutosave();
      }
    });
    inspector.addEventListener('input', event => {
      const nameInput = event.target.closest?.('.scene-element-name');
      if (nameInput) {
        if (state.activeWidgetEl) {
          const appearance = getElementAppearance(state.activeWidgetEl);
          applyElementAppearance(state.activeWidgetEl, { ...appearance, name: nameInput.value });
          renderSceneLayers();
        }
        return;
      }
      const buttonInput = event.target.closest?.('.scene-button-label, .scene-button-href');
      if (buttonInput) {
        if (state.activeWidgetEl && isNativeButtonElement(state.activeWidgetEl)) {
          const labelEl = inspector.querySelector('.scene-button-label');
          const hrefEl = inspector.querySelector('.scene-button-href');
          applyNativeButtonContent(state.activeWidgetEl, {
            label: labelEl?.value,
            href: hrefEl?.value
          });
          syncInspectorButton(state.activeWidgetEl);
          renderSceneLayers();
        }
        return;
      }
      const galleryField = event.target.closest?.('[data-gallery-field]');
      if (galleryField) {
        updateGalleryField(galleryField);
        return;
      }
      const collectionArchiveField = event.target.closest?.('[data-collection-archive-field]');
      if (collectionArchiveField) {
        updateCollectionArchiveField(collectionArchiveField);
        return;
      }
      const galleryItemField = event.target.closest?.('[data-gallery-item-field]');
      if (galleryItemField) {
        updateGalleryItemField(galleryItemField);
        return;
      }
      const opacityInput = event.target.closest?.('.scene-opacity-range, .scene-opacity-value');
      if (opacityInput) {
        const opacity = normalizeOpacity(opacityInput.value);
        const range = inspector.querySelector('.scene-opacity-range');
        const value = inspector.querySelector('.scene-opacity-value');
        if (range) range.value = String(opacity);
        if (value) value.value = String(opacity);
        if (state.activeWidgetEl) {
          applyElementAppearance(state.activeWidgetEl, { ...getElementAppearance(state.activeWidgetEl), opacity });
        }
        return;
      }
      const radiusInput = event.target.closest?.('.scene-radius-range, .scene-radius-value');
      if (radiusInput) {
        const radius = normalizeRadius(radiusInput.value);
        const range = inspector.querySelector('.scene-radius-range');
        const value = inspector.querySelector('.scene-radius-value');
        if (range) range.value = String(radius);
        if (value) value.value = String(radius);
        if (state.activeWidgetEl) {
          applyElementAppearance(state.activeWidgetEl, { ...getElementAppearance(state.activeWidgetEl), radius });
        }
        return;
      }
      const target = event.target.closest?.('.scene-range-start, .scene-range-end');
      if (target) {
        const startEl = inspector.querySelector('.scene-range-start');
        const endEl = inspector.querySelector('.scene-range-end');
        const range = normalizeRange(startEl?.value, endEl?.value);
        syncInspectorRange(range);
        if (state.activeWidgetEl) {
          applyElementRangeFromUi(state.activeWidgetEl, range);
        }
        return;
      }
      const effectInput = event.target.closest?.('[data-effect-start], [data-effect-end]');
      if (effectInput) updateEffectsFromInspector();
    });
    inspector.addEventListener('pointerdown', event => {
      const effectHandle = event.target.closest?.('.scene-effect-range [data-effect-range-handle]');
      if (effectHandle) {
        beginEffectRangeDrag(event, effectHandle);
        return;
      }
      const handle = event.target.closest?.('.scene-range-visual [data-range-handle]');
      if (!handle || !state.activeWidgetEl) return;
      beginRangeHandleDrag(event, handle, state.activeWidgetEl);
    });
    inspector.addEventListener('change', event => {
      const galleryField = event.target.closest?.('[data-gallery-field]');
      if (galleryField) {
        updateGalleryField(galleryField);
        return;
      }
      const collectionArchiveField = event.target.closest?.('[data-collection-archive-field]');
      if (collectionArchiveField) {
        updateCollectionArchiveField(collectionArchiveField);
        return;
      }
      const galleryItemField = event.target.closest?.('[data-gallery-item-field]');
      if (galleryItemField) {
        updateGalleryItemField(galleryItemField);
        return;
      }
      const effectToggle = event.target.closest?.('[data-effect-toggle]');
      if (effectToggle) updateEffectsFromInspector();
    });
    setInspectorMode(activeInspectorMode, inspector);
    return inspector;
  }

  function updateSceneInspector(el = null, widgetDef = null) {
    if (!sceneInspector) return;
    if (!el) setInspectorMode('content');
    sceneInspector.dataset.hasSelection = el ? 'true' : 'false';
    sceneInspector.querySelectorAll('[data-inspector-mode="behavior"], [data-inspector-mode="style"]').forEach(btn => {
      btn.disabled = !el;
      btn.setAttribute('aria-disabled', el ? 'false' : 'true');
    });
    sceneInspector.querySelectorAll('[data-inspector-panel="behavior"], [data-inspector-panel="style"]').forEach(panel => {
      panel.setAttribute('aria-disabled', el ? 'false' : 'true');
      panel.querySelectorAll('button, input, select, textarea').forEach(control => {
        control.disabled = !el;
      });
    });
    sceneInspector.querySelectorAll('[data-inspector-panel="content"]:not(.scene-layer-settings)').forEach(panel => {
      panel.setAttribute('aria-disabled', el ? 'false' : 'true');
      panel.querySelectorAll('button, input, select, textarea').forEach(control => {
        control.disabled = !el;
      });
    });
    const activeScene = sceneSections.find(section => section.id === activeSceneId) || sceneSections[0];
    const titleEl = sceneInspector.querySelector('.scene-inspector-title');
    const kickerEl = sceneInspector.querySelector('.scene-inspector-kicker');
    const xEl = sceneInspector.querySelector('.scene-pos-x');
    const yEl = sceneInspector.querySelector('.scene-pos-y');
    const behavior = normalizeBehavior(el?.dataset?.behavior);
    const range = el ? getElementRange(el) : { ...DEFAULT_SCROLL_RANGE };
    const effects = el ? getElementEffects(el) : normalizeEffects([]);
    syncInspectorScene(activeScene);
    applyActiveSceneStyle();
    sceneInspector.querySelectorAll('[data-behavior-value]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.behaviorValue === behavior);
    });
    syncInspectorRange(range);
    syncInspectorEffects(effects);
    syncInspectorBehaviorPreview(behavior, range, effects);
    syncInspectorAppearance(el, widgetDef);
    syncInspectorButton(el);
    syncInspectorCollectionArchive(el, widgetDef);
    syncInspectorGallery(el, widgetDef);
    if (el) {
      const label = el.dataset.elementName || widgetDef?.metadata?.label || el.dataset.widgetId || 'Element';
      applyBehaviorRange(el, range.start, range.end);
      applyEffectsToElement(el, effects);
      applyElementAppearance(el, getElementAppearance(el), false);
      if (titleEl) titleEl.textContent = label;
      if (kickerEl) kickerEl.textContent = activeScene.title;
      if (xEl) xEl.value = `${Math.round(Number(el.dataset.xPercent || 50))} %`;
      if (yEl) yEl.value = `${Math.round(Number(el.dataset.yPercent || 40))} %`;
    } else {
      if (titleEl) titleEl.textContent = activeScene.title;
      if (kickerEl) kickerEl.textContent = 'Section';
      if (xEl) xEl.value = '50 %';
      if (yEl) yEl.value = '40 %';
    }
    document.dispatchEvent(new CustomEvent('designerSelectionChanged', {
      detail: {
        selected: Boolean(el),
        id: el?.dataset?.instanceId || el?.id || null,
        textEditable: Boolean(el && getRegisteredEditable(el))
      }
    }));
  }

  function getActiveScene() {
    return sceneSections.find(section => section.id === activeSceneId) || sceneSections[0] || null;
  }

  function ensureSceneSection(id, title, meta = {}) {
    if (!id) return;
    const normalizedTitle = title || id
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
    const existing = sceneSections.find(section => section.id === id);
    if (existing) {
      if (normalizedTitle && existing.title !== normalizedTitle) existing.title = normalizedTitle;
      if (meta.background) existing.background = normalizeSceneColor(meta.background);
      return;
    }
    const next = { id, title: normalizedTitle };
    if (meta.background) next.background = normalizeSceneColor(meta.background);
    sceneSections.push(next);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cssEscape(value) {
    const raw = String(value || '');
    return window.CSS?.escape
      ? window.CSS.escape(raw)
      : raw.replace(/["\\]/g, '\\$&');
  }

  function slugifySceneTitle(title, fallback = 'section') {
    const slug = String(title || fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || fallback;
  }

  function uniqueSceneId(title) {
    const base = slugifySceneTitle(title, `section-${sceneSections.length + 1}`);
    let candidate = base;
    let idx = 2;
    while (sceneSections.some(section => section.id === candidate)) {
      candidate = `${base}-${idx}`;
      idx += 1;
    }
    return candidate;
  }

  function requestSceneChangePersist() {
    document.dispatchEvent(new CustomEvent('designerContentChanged'));
    if (pageId && state.autosaveEnabled) scheduleAutosave();
  }

  function createSceneFromUi({ edit = true } = {}) {
    const next = sceneSections.length + 1;
    const title = `Scene ${next}`;
    const section = { id: uniqueSceneId(title), title };
    sceneSections.push(section);
    activeSceneId = section.id;
    editingSceneId = edit ? section.id : null;
    renderSceneNavigation();
    requestSceneChangePersist();
    return section;
  }

  function normalizeNativeElementType(value) {
    const type = String(value || '').replace(NATIVE_ELEMENT_PREFIX, '').trim().toLowerCase();
    return NATIVE_ELEMENT_TYPES.includes(type) ? type : '';
  }

  function nativeElementSize(type, variant = '') {
    const nativeType = normalizeNativeElementType(type);
    const size = getNativeElementSize(nativeType, DEFAULT_ROWS, variant);
    const minSize = getNativeElementMinSize(nativeType, variant);
    return { ...size, minW: minSize.w, minH: minSize.h };
  }

  function normalizeInsertPresetId(value) {
    const preset = getInsertPreset(String(value || '').replace(INSERT_PRESET_PREFIX, ''));
    return preset?.id || '';
  }

  function setNativeDragData(event, type) {
    const nativeType = normalizeNativeElementType(type);
    if (!nativeType || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', `${NATIVE_ELEMENT_PREFIX}${nativeType}`);
    event.dataTransfer.effectAllowed = 'copy';
  }

  function setPresetDragData(event, presetId) {
    const normalized = normalizeInsertPresetId(presetId);
    if (!normalized || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', `${INSERT_PRESET_PREFIX}${normalized}`);
    event.dataTransfer.effectAllowed = 'copy';
  }

  function updateSceneTitleReferences(sceneId, title) {
    if (!gridEl) return;
    gridEl.querySelectorAll(`.canvas-item[data-scene-id="${cssEscape(sceneId)}"]`).forEach(el => {
      el.dataset.sceneTitle = title;
    });
  }

  function updateSceneBackgroundReferences(sceneId, background) {
    if (!gridEl) return;
    gridEl.querySelectorAll(`.canvas-item[data-scene-id="${cssEscape(sceneId)}"]`).forEach(el => {
      el.dataset.sceneBackground = background;
    });
  }

  function getActiveSceneWidgets(sceneId = activeSceneId) {
    return gridEl
      ? Array.from(gridEl.querySelectorAll('.canvas-item')).filter(widget => {
          return !widget.dataset.sceneId || widget.dataset.sceneId === sceneId;
        })
      : [];
  }

  function layerStackIndex(widget) {
    return Number.parseInt(widget?.style?.zIndex || widget?.dataset?.layerOrder || widget?.dataset?.layer || '0', 10) || 0;
  }

  function domStackIndex(widget) {
    return gridEl ? Array.from(gridEl.children).indexOf(widget) : -1;
  }

  function getSceneLayerStack(sceneId = activeSceneId) {
    return getActiveSceneWidgets(sceneId).sort((left, right) => {
      const zIndexDiff = layerStackIndex(left) - layerStackIndex(right);
      if (zIndexDiff !== 0) return zIndexDiff;
      return domStackIndex(left) - domStackIndex(right);
    });
  }

  function writeSceneLayerStack(stack) {
    if (!gridEl || !Array.isArray(stack)) return;
    stack.forEach((widget, index) => {
      const order = String(index + 1);
      widget.dataset.layerOrder = order;
      widget.style.zIndex = order;
      gridEl.appendChild(widget);
    });
  }

  function arrangeSceneWidget(widget, direction = 'forward') {
    if (!widget || !gridEl) return false;
    const stack = getSceneLayerStack(widget.dataset.sceneId || activeSceneId);
    const currentIndex = stack.indexOf(widget);
    const offset = direction === 'backward' ? -1 : 1;
    const nextIndex = currentIndex + offset;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= stack.length) return false;
    [stack[currentIndex], stack[nextIndex]] = [stack[nextIndex], stack[currentIndex]];
    writeSceneLayerStack(stack);
    selectWidgetFromLayer(widget, { scroll: false });
    renderSceneLayers();
    requestSceneChangePersist();
    return true;
  }

  function widgetIsInsideStageViewport(widget) {
    if (!widget?.getBoundingClientRect) return true;
    const viewport = document.getElementById('builderViewport') || document.getElementById('content');
    const rect = widget.getBoundingClientRect();
    const frame = viewport?.getBoundingClientRect?.();
    if (!frame) {
      return rect.top >= 0
        && rect.left >= 0
        && rect.bottom <= window.innerHeight
        && rect.right <= window.innerWidth;
    }
    const padding = 24;
    return rect.top >= frame.top + padding
      && rect.left >= frame.left + padding
      && rect.bottom <= frame.bottom - padding
      && rect.right <= frame.right - padding;
  }

  function scrollWidgetIntoStageViewport(widget) {
    if (!widget?.scrollIntoView || widgetIsInsideStageViewport(widget)) return false;
    widget.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    return true;
  }

  function selectWidgetFromLayer(widget, options = {}) {
    if (!widget) return;
    selectWidget(widget);
    if (options.scroll !== false) scrollWidgetIntoStageViewport(widget);
    pulseElement(widget);
  }

  function getSceneOverview(scene) {
    const widgets = getActiveSceneWidgets(scene.id);
    const behaviorCount = widgets.filter(el => {
      return normalizeBehavior(el.dataset.behavior) !== 'scroll' || hasEnabledEffects(getElementEffects(el));
    }).length;
    return {
      elements: widgets.length,
      behaviorCount,
      background: getSceneBackground(scene)
    };
  }

  function renderSceneOverviewMeta(overview) {
    const elementLabel = `${overview.elements} element${overview.elements === 1 ? '' : 's'}`;
    const behaviorLabel = `${overview.behaviorCount} behavior${overview.behaviorCount === 1 ? '' : 's'}`;
    return `
      <span class="scene-section-meta" aria-label="${escapeAttribute(`${elementLabel}, ${behaviorLabel}`)}">
        <i class="scene-section-bg-dot" style="--scene-section-bg:${escapeAttribute(overview.background)}" aria-hidden="true"></i>
        <span class="scene-section-count" title="${escapeAttribute(elementLabel)}">
          <img src="/assets/icons/layers.svg" alt="" class="icon" />
          <small>${overview.elements}</small>
        </span>
        ${overview.behaviorCount
          ? `<span class="scene-section-count scene-section-count--behavior" title="${escapeAttribute(behaviorLabel)}">
              <img src="/assets/icons/scroll.svg" alt="" class="icon" />
              <small>${overview.behaviorCount}</small>
            </span>`
          : ''}
      </span>
    `;
  }

  function renderLayerBehaviorMeta(widget) {
    const behaviorDef = getBehaviorDef(widget?.dataset?.behavior);
    const behavior = behaviorDef.id;
    const behaviorRange = getElementRange(widget);
    const enabledEffects = compactEffects(getElementEffects(widget));
    const hasBehavior = behavior !== 'scroll';
    const firstEffect = enabledEffects[0] || null;
    const visualRange = hasBehavior
      ? behaviorRange
      : (firstEffect ? normalizeRange(firstEffect.start, firstEffect.end) : behaviorRange);
    const behaviorDetail = hasBehavior
      ? `${behaviorRange.start}-${behaviorRange.end}%`
      : 'Normal';
    const effectNames = enabledEffects
      .slice(0, 2)
      .map(effect => effectLabel(effect))
      .join(' + ');
    const effectSuffix = enabledEffects.length > 2 ? ` +${enabledEffects.length - 2}` : '';
    const effectTitleText = enabledEffects.length
      ? `${effectNames}${effectSuffix}`
      : '';
    const effectLabelText = enabledEffects.length
      ? `${enabledEffects.length} effect${enabledEffects.length === 1 ? '' : 's'}`
      : '';
    const rangeMarkup = (hasBehavior || enabledEffects.length)
      ? `<span class="scene-layer-range" style="--scene-range-start:${visualRange.start}%;--scene-range-end:${visualRange.end}%;" aria-hidden="true"><i></i></span>`
      : '';
    return `
      <span class="scene-layer-meta">
        <span class="scene-layer-behavior" data-layer-behavior="${escapeAttribute(behavior)}">
          <img src="/assets/icons/${escapeAttribute(behaviorDef.icon)}.svg" alt="" class="icon" />
          <span>${escapeHtml(behaviorDef.title)}</span>
          <small>${escapeHtml(behaviorDetail)}</small>
        </span>
        ${enabledEffects.length
          ? `<span class="scene-layer-effect" title="${escapeAttribute(effectTitleText)}">
              <img src="/assets/icons/sparkles.svg" alt="" class="icon" />
              <span>${escapeHtml(effectLabelText)}</span>
            </span>`
          : ''}
        ${rangeMarkup}
      </span>
    `;
  }

  function startSceneRename(sceneId) {
    editingSceneId = sceneId;
    activeSceneId = sceneId;
    renderSceneNavigation();
    requestAnimationFrame(() => {
      const input = document.querySelector(`.scene-section-title-input[data-scene-id="${cssEscape(sceneId)}"]`);
      input?.focus();
      input?.select?.();
    });
  }

  function finishSceneRename(input, commit = true) {
    if (!input || input.dataset.sceneId !== editingSceneId) return;
    const scene = sceneSections.find(section => section.id === editingSceneId);
    if (scene && commit) {
      const nextTitle = String(input.value || '').trim();
      if (nextTitle) {
        scene.title = nextTitle;
        updateSceneTitleReferences(scene.id, nextTitle);
        requestSceneChangePersist();
      }
    }
    editingSceneId = null;
    renderSceneNavigation();
  }

  function moveScene(sceneId, delta) {
    const current = sceneSections.findIndex(section => section.id === sceneId);
    const next = current + delta;
    if (current < 0 || next < 0 || next >= sceneSections.length) return;
    const [section] = sceneSections.splice(current, 1);
    sceneSections.splice(next, 0, section);
    activeSceneId = sceneId;
    renderSceneNavigation();
    requestSceneChangePersist();
  }

  function removeScene(sceneId) {
    if (sceneSections.length <= 1) return;
    const index = sceneSections.findIndex(section => section.id === sceneId);
    if (index < 0) return;
    const fallback = sceneSections[index + 1] || sceneSections[index - 1];
    if (!fallback) return;
    const removed = sceneSections.splice(index, 1)[0];
    if (gridEl) {
      gridEl.querySelectorAll(`.canvas-item[data-scene-id="${cssEscape(removed.id)}"]`).forEach(el => {
        el.dataset.sceneId = fallback.id;
        el.dataset.sceneTitle = fallback.title;
        el.dataset.sceneBackground = getSceneBackground(fallback);
      });
    }
    if (activeSceneId === removed.id) activeSceneId = fallback.id;
    if (editingSceneId === removed.id) editingSceneId = null;
    renderSceneNavigation();
    requestSceneChangePersist();
  }

  function getSceneSectionsSnapshot() {
    return sceneSections
      .filter(section => section?.id)
      .map(section => {
        const snapshot = {
          id: String(section.id),
          title: String(section.title || section.id)
        };
        const background = getSceneBackground(section);
        if (background !== DEFAULT_SCENE_BACKGROUND) {
          snapshot.background = background;
        }
        return snapshot;
      });
  }

  function hydrateSceneSectionsFromSceneList(scenes) {
    if (!Array.isArray(scenes)) return;
    scenes.forEach(section => {
      if (!section || typeof section !== 'object') return;
      ensureSceneSection(section.id || section.sceneId, section.title || section.sceneTitle, {
        background: section.background || section.bgColor || section.bg_color
      });
    });
  }

  function hydrateSceneSectionsFromLayoutTree(layoutData) {
    if (!layoutData) return;
    try {
      const layoutObj = typeof layoutData === 'string' ? JSON.parse(layoutData) : layoutData;
      hydrateSceneSectionsFromSceneList(layoutObj?.scenes);
    } catch (err) {
      console.warn('[Designer] failed to hydrate scene sections from layout metadata', err);
    }
  }

  function hydrateSceneSectionsFromLayouts(layouts) {
    const list = Array.isArray(layouts) ? layouts : [];
    list.flat().forEach(item => {
      if (!item || typeof item !== 'object') return;
      const meta = item.code?.meta && typeof item.code.meta === 'object'
        ? item.code.meta
        : {};
      const sceneId = item.sceneId || meta.sceneId;
      const sceneTitle = item.sceneTitle || meta.sceneTitle;
      ensureSceneSection(sceneId, sceneTitle, {
        background: item.sceneBackground || meta.sceneBackground || meta.background || meta.bgColor || meta.bg_color
      });
    });
    if (!sceneSections.find(section => section.id === activeSceneId)) {
      activeSceneId = sceneSections[0]?.id || 'hero-scene';
    }
  }

  function renderSceneNavigationItems() {
    return sceneSections.map((section, index) => {
      const overview = getSceneOverview(section);
      return `
        <div class="scene-section-item scene-storyboard__item${section.id === activeSceneId ? ' active' : ''}${editingSceneId === section.id ? ' scene-section-item--editing' : ''}" data-scene-id="${escapeHtml(section.id)}" data-scene-storyboard-item>
          <div class="scene-section-main" data-section-select="true" role="button" tabindex="0" aria-label="${escapeHtml(section.title)}">
            <span class="scene-section-number">${String(index + 1).padStart(2, '0')}</span>
            ${editingSceneId === section.id
              ? `<input class="scene-section-title-input" data-scene-id="${escapeHtml(section.id)}" value="${escapeHtml(section.title)}" aria-label="Scene name" />`
              : `<span class="scene-section-title">${escapeHtml(section.title)}</span>`}
            ${editingSceneId === section.id ? '' : renderSceneOverviewMeta(overview)}
          </div>
          <span class="scene-section-actions" aria-hidden="${editingSceneId === section.id ? 'true' : 'false'}">
            <button type="button" class="scene-section-action" data-section-action="rename" aria-label="Rename scene">
              <img src="/assets/icons/pencil.svg" alt="" class="icon" />
            </button>
            <button type="button" class="scene-section-action" data-section-action="up" aria-label="Move scene left" ${index === 0 ? 'disabled' : ''}>
              <img src="/assets/icons/arrow-left.svg" alt="" class="icon" />
            </button>
            <button type="button" class="scene-section-action" data-section-action="down" aria-label="Move scene right" ${index === sceneSections.length - 1 ? 'disabled' : ''}>
              <img src="/assets/icons/arrow-right.svg" alt="" class="icon" />
            </button>
            <button type="button" class="scene-section-action" data-section-action="delete" aria-label="Delete scene" ${sceneSections.length <= 1 ? 'disabled' : ''}>
              <img src="/assets/icons/trash-2.svg" alt="" class="icon" />
            </button>
          </span>
        </div>
      `;
    }).join('');
  }

  function renderStageSceneControls(activeScene = getActiveScene(), itemsMarkup = renderSceneNavigationItems()) {
    const controls = document.querySelector('.scene-stage-nav');
    if (!controls || !activeScene) return;
    const activeIndex = Math.max(0, sceneSections.findIndex(section => section.id === activeScene.id));
    controls.innerHTML = `
      <span class="scene-stage-nav__label">Scenes</span>
      <button type="button" class="scene-stage-nav__button" data-stage-scene-action="prev" aria-label="Previous scene" ${activeIndex <= 0 ? 'disabled' : ''}>
        <img src="/assets/icons/arrow-left.svg" alt="" class="icon" />
      </button>
      <div class="scene-storyboard__track scene-section-list" role="listbox" aria-label="Scene storyboard" aria-live="polite">
        ${itemsMarkup}
      </div>
      <button type="button" class="scene-stage-nav__button" data-stage-scene-action="next" aria-label="Next scene" ${activeIndex >= sceneSections.length - 1 ? 'disabled' : ''}>
        <img src="/assets/icons/arrow-right.svg" alt="" class="icon" />
      </button>
      <button type="button" class="scene-stage-nav__button scene-stage-nav__button--add" data-stage-scene-action="add" aria-label="Add scene">
        <img src="/assets/icons/plus.svg" alt="" class="icon" />
      </button>
    `;
  }

  function renderSceneNavigation() {
    const activeScene = sceneSections.find(section => section.id === activeSceneId) || sceneSections[0];
    const itemsMarkup = renderSceneNavigationItems();
    sidebarEl.querySelectorAll('.scene-section-list').forEach(list => {
      list.innerHTML = itemsMarkup;
    });
    renderStageSceneControls(activeScene, itemsMarkup);
    syncSceneTitleDom(activeScene);
    applyActiveSceneStyle();
    syncInspectorScene(activeScene);
    updateSceneVisibility();
    updateSceneInspector(state.activeWidgetEl);
    renderSceneLayers();
  }

  function renderSceneEmptyState(widgets = null) {
    const emptyState = document.querySelector('.scene-empty-state');
    if (!emptyState) return;
    const scene = getActiveScene();
    const sceneWidgets = widgets || getActiveSceneWidgets();
    const isEmpty = sceneWidgets.length === 0;
    emptyState.hidden = !isEmpty;
    emptyState.dataset.sceneId = scene?.id || '';
    const title = emptyState.querySelector('.scene-empty-title');
    if (title) title.textContent = scene?.title || 'Scene';
  }

  function updateSceneVisibility() {
    if (!gridEl) return;
    gridEl.querySelectorAll('.canvas-item').forEach(el => {
      const inactiveScene = Boolean(el.dataset.sceneId && el.dataset.sceneId !== activeSceneId);
      el.classList.toggle('inactive-scene', inactiveScene);
      if (inactiveScene && el === state.activeWidgetEl) {
        el.classList.remove('selected');
        state.activeWidgetEl = null;
        gridEl.__grid?.clearSelection?.();
        hideToolbar();
        updateSceneInspector(null);
      }
    });
  }

  function renderSceneLayers() {
    const layerPanel = sceneInspector?.querySelector('.scene-inspector-layer-list');
    if (!layerPanel) return;
    layerPanel.replaceChildren();
    const widgets = getSceneLayerStack().slice().reverse();
    renderSceneEmptyState(widgets);
    if (!widgets.length) {
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'scene-layer-item scene-layer-item--empty';
      empty.disabled = true;
      empty.innerHTML = '<img src="/assets/icons/layers.svg" alt="" class="icon" /><span>No elements</span>';
      layerPanel.appendChild(empty);
      return;
    }
    widgets.forEach(widget => {
      const stack = getSceneLayerStack(widget.dataset.sceneId || activeSceneId);
      const stackIndex = stack.indexOf(widget);
      const canSendBackward = stackIndex > 0;
      const canBringForward = stackIndex >= 0 && stackIndex < stack.length - 1;
      const widgetDef = allWidgets.find(w => w.id === widget.dataset.widgetId);
      const label = widget.dataset.elementName || widgetDef?.metadata?.label || widget.dataset.widgetId || 'Element';
      const item = document.createElement('div');
      item.className = `scene-layer-item${widget === state.activeWidgetEl ? ' scene-layer-item--active' : ''}`;
      item.dataset.widgetInstanceId = widget.dataset.instanceId || '';
      item.dataset.widgetId = widget.dataset.widgetId || '';
      item.dataset.sceneId = widget.dataset.sceneId || activeSceneId;
      item.dataset.layer = widget.dataset.layer || String(activeLayer);
      item.dataset.zIndex = widget.style.zIndex || '';
      item.setAttribute('role', 'listitem');
      item.innerHTML = `
        <button type="button" class="scene-layer-select" data-layer-select aria-label="Select ${escapeAttribute(label)}">
          ${getWidgetIcon(widgetDef || { id: widget.dataset.widgetId || 'box', metadata: { icon: 'box' } }, ICON_MAP)}
          <span class="scene-layer-copy">
            <span class="scene-layer-title">${escapeHtml(label)}</span>
            ${renderLayerBehaviorMeta(widget)}
          </span>
        </button>
        <span class="scene-layer-actions" aria-label="Layer order">
          <button type="button" class="scene-layer-action" data-layer-action="forward" aria-label="Bring layer forward" ${canBringForward ? '' : 'disabled'}>
            <img src="/assets/icons/arrow-up.svg" alt="" class="icon" />
          </button>
          <button type="button" class="scene-layer-action" data-layer-action="backward" aria-label="Send layer backward" ${canSendBackward ? '' : 'disabled'}>
            <img src="/assets/icons/arrow-down.svg" alt="" class="icon" />
          </button>
        </span>
      `;
      item.addEventListener('click', event => {
        const actionButton = event.target.closest?.('[data-layer-action]');
        if (actionButton) {
          event.preventDefault();
          event.stopPropagation();
          arrangeSceneWidget(widget, actionButton.dataset.layerAction);
          return;
        }
        // Layer rows are a selection surface. Keep this click out of the
        // document-level canvas deselection handler so the chosen item remains
        // active after selecting it from the right inspector.
        event.preventDefault();
        event.stopPropagation();
        selectWidgetFromLayer(widget);
      });
      layerPanel.appendChild(item);
    });
  }

  function handleSceneNavigationClick(event) {
    if (event.target.closest?.('.scene-section-title-input')) return false;
    const addButton = event.target.closest?.('.scene-add-section');
    if (addButton) {
      event.preventDefault();
      event.stopPropagation();
      createSceneFromUi({ edit: true });
      return true;
    }
    const actionButton = event.target.closest?.('[data-section-action]');
    if (actionButton) {
      event.preventDefault();
      event.stopPropagation();
      const sectionItem = actionButton.closest('.scene-section-item');
      const sceneId = sectionItem?.dataset?.sceneId;
      if (!sceneId) return true;
      const action = actionButton.dataset.sectionAction;
      if (action === 'rename') startSceneRename(sceneId);
      if (action === 'up') moveScene(sceneId, -1);
      if (action === 'down') moveScene(sceneId, 1);
      if (action === 'delete') removeScene(sceneId);
      return true;
    }
    const item = event.target.closest?.('.scene-section-item');
    if (item?.dataset?.sceneId) {
      event.preventDefault();
      event.stopPropagation();
      activeSceneId = item.dataset.sceneId;
      editingSceneId = null;
      renderSceneNavigation();
      return true;
    }
    return false;
  }

  function handleSceneNavigationKeydown(event) {
    const input = event.target.closest?.('.scene-section-title-input');
    if (input) {
      if (event.key === 'Enter') {
        event.preventDefault();
        finishSceneRename(input, true);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        finishSceneRename(input, false);
      }
      return true;
    }
    const main = event.target.closest?.('.scene-section-main');
    if (main && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const sceneId = main.closest('.scene-section-item')?.dataset?.sceneId;
      if (sceneId) {
        activeSceneId = sceneId;
        editingSceneId = null;
        renderSceneNavigation();
      }
      return true;
    }
    return false;
  }

  function handleSceneNavigationFocusout(event) {
    const input = event.target.closest?.('.scene-section-title-input');
    if (!input) return false;
    setTimeout(() => {
      if (document.activeElement !== input) finishSceneRename(input, true);
    }, 0);
    return true;
  }

  sidebarEl.addEventListener('click', event => {
    const panelButton = event.target.closest?.('[data-sidebar-panel-target]');
    if (panelButton) {
      event.preventDefault();
      event.stopPropagation();
      const panelName = normalizeSidebarPanel(panelButton.dataset.sidebarPanelTarget);
      if (isSidebarFlyoutOpen() && sidebarEl.dataset.activeSidebarPanel === panelName) {
        closeSidebarPanel();
        return;
      }
      void activateSidebarPanel(panelName);
      return;
    }
    const designerToolButton = event.target.closest?.('[data-designer-tool]');
    if (designerToolButton) {
      event.preventDefault();
      event.stopPropagation();
      const tool = designerToolButton.dataset.designerTool;
      if (!SIDEBAR_TOOL_NAMES.has(tool)) return;
      setSidebarToolActive(tool);
      document.dispatchEvent(new CustomEvent('designerToolSelected', {
        detail: { tool, source: 'sidebar' }
      }));
      return;
    }
    const insertGroupButton = event.target.closest?.('[data-insert-group]');
    if (insertGroupButton) {
      event.preventDefault();
      setInsertGroup(insertGroupButton.dataset.insertGroup);
      return;
    }
    const insertPresetButton = event.target.closest?.('[data-insert-preset]');
    if (insertPresetButton) {
      event.preventDefault();
      void insertPresetElement(insertPresetButton.dataset.insertPreset);
      return;
    }
    const nativeElementButton = event.target.closest?.('[data-native-element]');
    if (nativeElementButton) {
      event.preventDefault();
      void insertNativeElement(nativeElementButton.dataset.nativeElement);
      return;
    }
    handleSceneNavigationClick(event);
  });

  document.addEventListener('click', event => {
    const target = event.target;
    if (!isSidebarFlyoutOpen() || !(target instanceof Node) || sidebarEl.contains(target)) return;
    if (
      target instanceof Element
      && target.closest('.builder-header, .designer-live-preview')
    ) {
      return;
    }
    closeSidebarPanel();
  }, true);

  sidebarEl.addEventListener('keydown', event => {
    handleSceneNavigationKeydown(event);
  });

  sidebarEl.addEventListener('dragstart', event => {
    const insertPreset = event.target.closest?.('[data-insert-preset]');
    if (insertPreset) {
      setPresetDragData(event, insertPreset.dataset.insertPreset);
      return;
    }
    const nativeElement = event.target.closest?.('[data-native-element]');
    if (nativeElement) {
      setNativeDragData(event, nativeElement.dataset.nativeElement);
    }
  });

  sidebarEl.addEventListener('focusout', event => {
    handleSceneNavigationFocusout(event);
  });

  let layoutName = layoutNameParam ? String(layoutNameParam) : '';
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
      if (!layoutName && winDesign?.title) {
        layoutName = String(winDesign.title).trim();
      }
  } catch (err) {
    console.warn('[Designer] failed to preload design metadata', err);
  }

  const genId = () => `w${Math.random().toString(36).slice(2,8)}`;
  const parseWidgetMeta = value => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };
  initLayoutMode(sidebarEl);


  let allWidgets = [];
  let loadedDesign = null;
  try {
    const widgetRes = await emitAdminFacade(meltdownEmit, 'plainSpace', 'widgetRegistry', {
      lane: 'public'
    });
    allWidgets = Array.isArray(widgetRes?.widgets) ? widgetRes.widgets : [];
  } catch (err) {
    console.error('[Designer] failed to load widgets', err);
  }

  if (!pageId && state.designId) {
    try {
      loadedDesign = await emitAdminFacade(meltdownEmit, 'designer', 'get', {
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
        if (!layoutName && loadedDesign.design.title) {
          layoutName = String(loadedDesign.design.title).trim();
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
      <div class="scene-stage-nav" aria-label="Scene storyboard"></div>
      <div class="scene-viewport-guides" aria-hidden="true">
        <div class="scene-stage-title">Hero Scene</div>
        <div class="scene-scroll-axis scene-scroll-axis--center">
          <span>Scroll</span>
        </div>
        <div class="scene-scroll-axis scene-scroll-axis--left">
          <b>Start</b>
        </div>
        <div class="scene-scroll-axis scene-scroll-axis--right">
          <b>End</b>
        </div>
        <div class="scene-preview-marker" data-preview-progress="50">
          <span>50%</span>
        </div>
        <div class="scene-viewport-label">Viewport</div>
      </div>
      <div id="layoutRoot" class="layout-root">
        <div id="workspaceMain" class="builder-grid"></div>
        <div class="scene-empty-state" hidden>
          <span class="scene-empty-title">Hero Scene</span>
          <span class="scene-empty-actions" role="group" aria-label="Quick add to empty scene">
            <button type="button" data-empty-insert="text" aria-label="Add text">
              <img src="/assets/icons/type.svg" alt="" class="icon" />
              <span>Text</span>
            </button>
            <button type="button" data-empty-insert="media" aria-label="Add media">
              <img src="/assets/icons/image.svg" alt="" class="icon" />
              <span>Media</span>
            </button>
            <button type="button" data-empty-insert="shape" aria-label="Add shape">
              <img src="/assets/icons/shapes.svg" alt="" class="icon" />
              <span>Shape</span>
            </button>
            <button type="button" data-empty-insert="button" aria-label="Add button">
              <img src="/assets/icons/mouse-pointer-click.svg" alt="" class="icon" />
              <span>Button</span>
            </button>
            <button type="button" data-empty-insert="background" aria-label="Change background">
              <img src="/assets/icons/wallpaper.svg" alt="" class="icon" />
              <span>Background</span>
            </button>
          </span>
        </div>
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
  gridViewportEl?.addEventListener('click', event => {
    const sceneActionButton = event.target.closest?.('[data-stage-scene-action]');
    if (sceneActionButton) {
      event.preventDefault();
      event.stopPropagation();
      const action = sceneActionButton.dataset.stageSceneAction;
      const activeIndex = sceneSections.findIndex(section => section.id === activeSceneId);
      if (action === 'add') {
        createSceneFromUi({ edit: true });
        return;
      }
      if (action === 'prev' && activeIndex > 0) {
        activeSceneId = sceneSections[activeIndex - 1].id;
        editingSceneId = null;
        renderSceneNavigation();
        return;
      }
      if (action === 'next' && activeIndex >= 0 && activeIndex < sceneSections.length - 1) {
        activeSceneId = sceneSections[activeIndex + 1].id;
        editingSceneId = null;
        renderSceneNavigation();
        return;
      }
    }
    if (handleSceneNavigationClick(event)) return;
    const insertButton = event.target.closest?.('[data-empty-insert]');
    if (!insertButton) return;
    event.preventDefault();
    event.stopPropagation();
    void insertNativeElement(insertButton.dataset.emptyInsert);
  });
  gridViewportEl?.addEventListener('keydown', event => {
    handleSceneNavigationKeydown(event);
  });
  gridViewportEl?.addEventListener('focusout', event => {
    handleSceneNavigationFocusout(event);
  });

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

  let persistedLayoutData = null;
  try {
    const designData = window.DESIGN_DATA || window.INITIAL_DESIGN;
    const layoutData = designData?.layout || designData?.layout_json;
    if (layoutData) {
      const obj = typeof layoutData === 'string' ? JSON.parse(layoutData) : layoutData;
      persistedLayoutData = obj;
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
    getSceneSections: getSceneSectionsSnapshot,
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

  function getActiveWorkareaContainer() {
    const rootContainer = ensureLayoutRootContainer(layoutRoot);
    if (!rootContainer) return null;
    return layoutRoot.querySelector('.layout-container[data-workarea="true"]')
      || (rootContainer.dataset.workarea === 'true' ? rootContainer : null)
      || rootContainer;
  }

  function syncWorkspaceToWorkarea() {
    try {
      const workarea = getActiveWorkareaContainer();
      if (!workarea || !gridEl) return;
      if (gridEl.parentElement !== workarea) {
        workarea.appendChild(gridEl);
      }
      grid?.refreshMetrics?.();
      grid?.widgets?.forEach?.(widget => {
        try {
          grid.update?.(widget, {}, { silent: true });
        } catch (err) {
          warnDesignerContainerError('DESIGNER_WORKAREA_WIDGET_SYNC_FAILED', err, {
            widgetId: widget?.id || widget?.dataset?.widgetId || null
          });
        }
      });
    } catch (err) {
      warnDesignerContainerError('DESIGNER_WORKAREA_SYNC_FAILED', err);
    }
  }

  const { refreshContainerBars, refreshLayoutTree, handleContainerChange } = createLayoutStructureHandlers({
    layoutRootRef: () => layoutRoot,
    sidebarEl,
    hasLayoutStructure: HAS_LAYOUT_STRUCTURE,
    attachContainerBar,
    renderLayoutTreeSidebar,
    pushAndSave,
    layoutCtxProvider: () => layoutCtx
  });

  function handleContainerMutation() {
    try {
      handleContainerChange();
    } catch (err) {
      warnDesignerContainerError('DESIGNER_CONTAINER_MUTATION_FAILED', err);
    }
    syncWorkspaceToWorkarea();
  }

  function placeContainer(targetEl, pos) {
    try {
      placeContainerNode(targetEl, pos, {
        layoutRoot,
        onAfterChange: handleContainerMutation
      });
    } catch (err) {
      warnDesignerContainerError('DESIGNER_CONTAINER_PLACE_FAILED', err, containerDebugInfo(targetEl, { position: pos }));
    }
  }

  function setDynamicHost(el) {
    try {
      setDynamicHostContainer(layoutRoot, el);
      handleContainerMutation();
    } catch (err) {
      warnDesignerContainerError('DESIGNER_CONTAINER_WORKAREA_FAILED', err, containerDebugInfo(el));
    }
  }

  function setDesignRef(el, designId) {
    try {
      setContainerDesignRef(el, designId);
      handleContainerMutation();
    } catch (err) {
      warnDesignerContainerError('DESIGNER_CONTAINER_DESIGN_REF_FAILED', err, containerDebugInfo(el));
    }
  }

  function setContainerLayoutMode(el, mode) {
    try {
      setContainerLayoutModeNode(el, mode);
      handleContainerMutation();
    } catch (err) {
      warnDesignerContainerError('DESIGNER_CONTAINER_MODE_FAILED', err, containerDebugInfo(el, { mode }));
    }
  }

  function setContainerSettings(el, settings) {
    try {
      setContainerSettingsNode(el, settings);
      handleContainerMutation();
    } catch (err) {
      warnDesignerContainerError('DESIGNER_CONTAINER_SETTINGS_FAILED', err, containerDebugInfo(el, {
        keys: settings && typeof settings === 'object' ? Object.keys(settings) : []
      }));
    }
  }

  function toggleContainerStyleSource(el) {
    try {
      toggleContainerStyleSourceNode(layoutRoot, el);
      handleContainerMutation();
    } catch (err) {
      warnDesignerContainerError('DESIGNER_CONTAINER_STYLE_SOURCE_FAILED', err, containerDebugInfo(el));
    }
  }

  function deleteContainer(el) {
    try {
      deleteContainerNode(el, { onAfterChange: handleContainerMutation });
    } catch (err) {
      warnDesignerContainerError('DESIGNER_CONTAINER_DELETE_FAILED', err, containerDebugInfo(el));
    }
  }

  function moveContainer(srcEl, targetEl, pos) {
    try {
      moveContainerNode(srcEl, targetEl, pos, { onAfterChange: handleContainerMutation });
    } catch (err) {
      warnDesignerContainerError('DESIGNER_CONTAINER_MOVE_FAILED', err, {
        from: containerDebugInfo(srcEl),
        to: containerDebugInfo(targetEl),
        position: pos
      });
    }
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
    syncToolbarForSelection: () => {
      const editable = state.activeWidgetEl
        ? getRegisteredEditable(state.activeWidgetEl)
        : null;
      if (editable) showToolbar();
      else hideToolbar();
    },
    saveDesign,
    getCurrentLayoutForLayer,
    getActiveLayer: () => activeLayer,
    ensureCodeMap,
    capturePreview: options => captureGridPreview(gridEl, options),
    updateAllWidgetContents,
    getAdminUserId,
    pageId,
    layoutRoot,
    switchLayer,
    placeContainer,
    setDynamicHost,
    setDesignRef,
    setContainerLayoutMode,
    setContainerSettings,
    toggleContainerStyleSource,
    deleteContainer,
    refreshContainerBars,
    refreshLayoutTree,
    activateArrange,
    deactivateArrange,
    setSidebarPanel,
    INSERT_TOOL_ITEMS
  };

  populateWidgetsPanel(sidebarEl, allWidgets, ICON_MAP, HAS_LAYOUT_STRUCTURE ? () => switchLayer(0) : null, INSERT_TOOL_ITEMS);
  setSidebarPanel(sidebarEl.dataset.activeSidebarPanel || 'insert');
  renderSceneNavigation();

  // Allow overlapping widgets for layered layouts
  grid = initGrid(gridEl, state, selectWidget, {
    scrollContainer: gridViewportEl,
    zoomTarget: layoutRoot,
    enableZoom: true
  });
  setDefaultWorkarea(layoutRoot);
  syncWorkspaceToWorkarea();
  layoutCtx.refreshContainerBars();
  layoutCtx.refreshLayoutTree();
  window.addEventListener('resize', () => {
    setDefaultWorkarea(layoutRoot);
    syncWorkspaceToWorkarea();
  });
  const {
    actionBar,
    select: baseSelectWidget,
    refreshPosition: refreshActionBarPosition
  } = createActionBar(null, grid, state, () => scheduleAutosave());
  function selectWidget(el) {
    baseSelectWidget(el);
    if (!el) {
      removeStageBehaviorHuds();
      updateSceneInspector(null);
      setActiveElement(null);
      hideToolbar();
      return;
    }
    if (!el.dataset.behavior) el.dataset.behavior = 'scroll';
    if (!el.dataset.sceneId) el.dataset.sceneId = activeSceneId;
    if (!el.dataset.sceneTitle) {
      const activeScene = getActiveScene();
      if (activeScene?.title) el.dataset.sceneTitle = activeScene.title;
    }
    if (!el.dataset.sceneBackground) {
      el.dataset.sceneBackground = getSceneBackground(getActiveScene());
    }
    const selectedWidgetDef = allWidgets.find(w => w.id === el.dataset.widgetId);
    updateSceneInspector(el, selectedWidgetDef);
    refreshActionBarPosition(el);
    renderSceneLayers();
    // Hide background toolbar when selecting a widget
    hideBgToolbar();
    let editable = getRegisteredEditable(el);
    if (!editable) {
      // Fallback: resolve inner editable inside widget DOM
      editable = el.querySelector('[data-text-editable], .editable');
    }
    setActiveElement(editable);
    if (editable) showToolbar();
    else hideToolbar();
    // The text formatting toolbar is fixed below the header. Reposition once
    // it is visible so the merged selection bar never renders on top of it.
    refreshActionBarPosition(el);
    builderLogger.debug('selectWidget', { widgetId: el?.id, editableId: editable?.id });
  }
  const shouldAutosaveNow = () => Boolean(pageId && state.autosaveEnabled);

  initTextPanel({
    grid,
    gridEl,
    allWidgets,
    genId,
    ensureCodeMap,
    getActiveLayer: () => activeLayer,
    getActiveScene,
    selectWidget,
    markInactiveWidgets,
    scheduleAutosave,
    shouldAutosave: shouldAutosaveNow,
    pageId,
    defaultRows: DEFAULT_ROWS,
    iconMap: ICON_MAP,
    getWidgetIcon
  });

  gridEl.addEventListener('pointerdown', event => {
    const handle = event.target.closest?.('.scene-behavior-range-cue [data-range-handle]');
    if (!handle) return;
    const widget = handle.closest('.canvas-item');
    if (!widget) return;
    if (widget !== state.activeWidgetEl) selectWidget(widget);
    beginRangeHandleDrag(event, handle, widget);
  });

  const handleStageBehaviorClick = event => {
    const behaviorButton = event.target.closest?.('[data-stage-behavior]');
    if (!behaviorButton) return;
    const hud = behaviorButton.closest('.scene-stage-hud');
    const activeId = state.activeWidgetEl?.dataset?.instanceId || state.activeWidgetEl?.id || '';
    const widget = behaviorButton.closest('.canvas-item')
      || (hud?.dataset?.instanceId === activeId ? state.activeWidgetEl : null);
    if (!widget) return;
    event.preventDefault();
    event.stopPropagation();
    if (widget !== state.activeWidgetEl) selectWidget(widget);
    if (!state.activeWidgetEl) return;
    state.activeWidgetEl.dataset.behavior = normalizeBehavior(behaviorButton.dataset.stageBehavior);
    applyBehaviorRange(
      state.activeWidgetEl,
      state.activeWidgetEl.dataset.scrollStart,
      state.activeWidgetEl.dataset.scrollEnd
    );
    updateSceneInspector(state.activeWidgetEl, allWidgets.find(w => w.id === state.activeWidgetEl.dataset.widgetId));
    refreshActionBarPosition(state.activeWidgetEl);
    renderSceneLayers();
    if (pageId && state.autosaveEnabled) scheduleAutosave();
  };
  gridEl.addEventListener('click', handleStageBehaviorClick);
  actionBar.addEventListener('click', handleStageBehaviorClick);

  function pulseElement(el) {
    if (!el?.classList) return;
    el.classList.add('scene-focus-pulse');
    window.setTimeout(() => el.classList.remove('scene-focus-pulse'), 850);
  }

  function focusSidebarSection(selector) {
    const panelName = sidebarPanelForSelector(selector);
    if (panelName) {
      setSidebarPanel(panelName, {
        preserveInsertGroup: panelName === 'insert' && sidebarEl.classList.contains('builder-sidebar--insert-expanded')
      });
    }
    const section = sidebarEl.querySelector(selector);
    if (!section) return null;
    sidebarEl.querySelectorAll('.scene-sidebar-section--focus').forEach(item => {
      item.classList.remove('scene-sidebar-section--focus');
    });
    section.classList.add('scene-sidebar-section--focus');
    section.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    const focusable = section.querySelector('button:not([disabled]), [tabindex], .drag-widget-icon');
    focusable?.focus?.();
    pulseElement(section);
    window.setTimeout(() => section.classList.remove('scene-sidebar-section--focus'), 1200);
    return section;
  }

  function focusWidgetIcon(keywords = []) {
    setSidebarPanel('insert');
    const normalized = keywords.map(item => String(item || '').toLowerCase());
    const icons = Array.from(sidebarEl.querySelectorAll('.drag-widget-icon'));
    const match = icons.find(icon => {
      const haystack = `${icon.dataset.widgetId || ''} ${icon.textContent || ''}`.toLowerCase();
      return normalized.some(keyword => haystack.includes(keyword));
    });
    if (match) {
      match.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      match.focus?.();
      pulseElement(match);
      return match;
    }
    const group = INSERT_TOOL_ITEMS.find(item => {
      const haystack = `${item.id || ''} ${item.title || ''} ${item.description || ''} ${(item.presets || []).map(preset => `${preset.id} ${preset.title} ${preset.widgetId || ''}`).join(' ')}`.toLowerCase();
      return normalized.some(keyword => haystack.includes(keyword));
    });
    if (group) {
      setInsertGroup(group.id);
      return focusSidebarSection(`[data-insert-group-panel="${cssEscape(group.id)}"]`);
    }
    return focusSidebarSection('.element-library');
  }

  function findWidgetForQuickInsert(preferredIds = [], keywords = []) {
    const byId = preferredIds
      .map(id => allWidgets.find(widget => widget.id === id))
      .find(Boolean);
    if (byId) return byId;
    const normalized = keywords.map(item => String(item || '').toLowerCase());
    return allWidgets.find(widget => {
      const haystack = `${widget.id || ''} ${widget.metadata?.label || ''} ${widget.metadata?.icon || ''}`.toLowerCase();
      return normalized.some(keyword => haystack.includes(keyword));
    }) || allWidgets[0] || null;
  }

  function escapeAttribute(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function nextSceneInsertPosition(width = 4, height = DEFAULT_ROWS) {
    const sceneWidgets = Array.from(gridEl.querySelectorAll(`.canvas-item[data-layer="${activeLayer}"]`))
      .filter(widget => !widget.dataset.sceneId || widget.dataset.sceneId === activeSceneId);
    if (!sceneWidgets.length) {
      const columns = grid.options.columns || 12;
      return {
        x: Math.max(0, Math.floor((columns - width) / 2)),
        y: Math.max(0, Math.floor(DEFAULT_ROWS / 2))
      };
    }
    const maxY = sceneWidgets.reduce((max, widget) => {
      const y = Number.parseInt(widget.dataset.y || '0', 10) || 0;
      const h = Number.parseInt(widget.getAttribute('gs-h') || `${height}`, 10) || height;
      return Math.max(max, y + h);
    }, 0);
    return { x: 1, y: maxY + 8 };
  }

  function dropSceneInsertPosition(event, width = 4, height = DEFAULT_ROWS) {
    if (!gridEl || !grid) return nextSceneInsertPosition(width, height);
    const rect = gridEl.getBoundingClientRect();
    let relX = 0;
    let relY = 0;
    if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
      relX = event.clientX - rect.left;
      relY = event.clientY - rect.top;
    } else if (event.touches && event.touches[0]) {
      relX = event.touches[0].clientX - rect.left;
      relY = event.touches[0].clientY - rect.top;
    } else {
      relX = (event.offsetX || 0) - rect.left;
      relY = (event.offsetY || 0) - rect.top;
    }
    const columns = grid.options.columns || 12;
    const cellHeight = grid.options.cellHeight || 1;
    const x = Math.max(0, Math.min(columns - width, Math.floor((relX / Math.max(1, rect.width)) * columns) || 0));
    const y = Math.max(0, Math.floor(relY / cellHeight) || 0);
    return { x, y };
  }

  function normalizeSceneWidgetDimensions({ w, h, minW, minH }) {
    const canvasWidth = Math.max(
      1,
      Number(grid?.options?.columns) || Number(gridEl?.clientWidth) || 1040
    );
    const width = Math.min(canvasWidth, Math.max(1, Math.round(Number(w) || 480)));
    const height = Math.max(1, Math.round(Number(h) || 240));
    return {
      w: width,
      h: height,
      minW: Math.min(width, Math.max(1, Math.round(Number(minW) || 240))),
      minH: Math.min(height, Math.max(1, Math.round(Number(minH) || 120)))
    };
  }

  function defaultWidgetDimensions() {
    return { w: 480, h: 240, minW: 240, minH: 120 };
  }

  async function createSceneWidget(widgetDef, {
    x = 0,
    y = 0,
    w = 480,
    h = 240,
    minW = 240,
    minH = 120,
    code = null,
    behavior = 'scroll',
    label = '',
    elementName = ''
  } = {}) {
    if (!widgetDef || !gridEl || !grid) return null;
    const dimensions = normalizeSceneWidgetDimensions({ w, h, minW, minH });
    w = dimensions.w;
    h = dimensions.h;
    minW = dimensions.minW;
    minH = dimensions.minH;
    const instId = genId();
    const activeScene = getActiveScene();
    const wrapper = document.createElement('div');
    wrapper.classList.add('canvas-item');
    wrapper.id = `widget-${instId}`;
    wrapper.dataset.widgetId = widgetDef.id;
    wrapper.dataset.instanceId = instId;
    wrapper.dataset.layer = String(activeLayer);
    wrapper.dataset.behavior = normalizeBehavior(behavior);
    wrapper.dataset.scrollStart = String(DEFAULT_SCROLL_RANGE.start);
    wrapper.dataset.scrollEnd = String(DEFAULT_SCROLL_RANGE.end);
    wrapper.dataset.sceneId = activeSceneId;
    if (activeScene?.title) wrapper.dataset.sceneTitle = activeScene.title;
    wrapper.dataset.sceneBackground = getSceneBackground(activeScene);
    if (elementName) wrapper.dataset.elementName = String(elementName).trim();
    wrapper.dataset.x = String(x);
    wrapper.dataset.y = String(y);
    wrapper.style.zIndex = String(activeLayer);
    wrapper.setAttribute('gs-w', String(w));
    wrapper.setAttribute('gs-h', String(h));
    wrapper.setAttribute('gs-min-w', String(minW));
    wrapper.setAttribute('gs-min-h', String(minH));

    const content = document.createElement('div');
    content.className = 'canvas-item-content builder-themed';
    content.innerHTML = `${getWidgetIcon(widgetDef, ICON_MAP)}<span>${label || widgetDef.metadata?.label || widgetDef.id}</span>`;
    wrapper.appendChild(content);

    const localCodeMap = ensureCodeMap();
    if (code && typeof code === 'object') {
      localCodeMap[instId] = code;
    }
    attachRemoveButton(wrapper, grid, pageId, scheduleAutosave);
    const editBtn = attachEditButton(wrapper, widgetDef, localCodeMap, pageId, scheduleAutosave);
    attachOptionsMenu(wrapper, widgetDef, editBtn, {
      grid: gridEl,
      pageId,
      scheduleAutosave,
      activeLayer,
      codeMap: localCodeMap,
      genId
    });
    attachLockOnClick(wrapper, selectWidget);
    gridEl.appendChild(wrapper);
    grid.makeWidget(wrapper);
    grid.update?.(wrapper, { x, y, w, h, layer: activeLayer });
    await renderWidget(wrapper, widgetDef, localCodeMap, code);
    setInspectorMode('content');
    selectWidget(wrapper);
    markInactiveWidgets();
    renderSceneLayers();
    grid.emitChange?.(wrapper);
    if (pageId && state.autosaveEnabled) scheduleAutosave();
    return wrapper;
  }

  function activeScenePresetContext(extra = {}) {
    return {
      sceneId: activeSceneId,
      sceneTitle: getActiveScene()?.title || '',
      sceneBackground: getSceneBackground(),
      ...extra
    };
  }

  function createPublicWidgetPresetCode(preset) {
    const settings = preset?.settings && typeof preset.settings === 'object'
      ? { ...preset.settings }
      : {};
    return {
      meta: {
        kind: preset.widgetId || preset.nativeType || 'widget',
        presetId: preset.id,
        presetVersion: 1,
        designContract: {
          version: 1,
          source: 'design-studio-preset'
        },
        settings,
        sceneId: activeSceneId,
        sceneTitle: getActiveScene()?.title || '',
        sceneBackground: getSceneBackground()
      }
    };
  }

  async function insertWidgetPreset(preset, position = null) {
    const widgetDef = findWidgetForQuickInsert([preset.widgetId], [preset.title, preset.description, preset.widgetId]);
    if (!widgetDef) {
      focusWidgetIcon([preset.widgetId, preset.title]);
      return null;
    }
    await ensureDesignLayerForTool();
    const size = preset.size || defaultWidgetDimensions();
    const minSize = preset.minSize || { w: size.minW || 240, h: size.minH || 120 };
    const pos = position || nextSceneInsertPosition(size.w, size.h);
    return createSceneWidget(widgetDef, {
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
      minW: minSize.w,
      minH: minSize.h,
      code: createPublicWidgetPresetCode(preset),
      label: preset.title,
      elementName: preset.title
    });
  }

  async function insertQuickText(position = null, presetOptions = {}) {
    const preset = createNativeElementPreset('text', {
      ...activeScenePresetContext(),
      presetId: presetOptions.id,
      variant: presetOptions.variant
    });
    const widgetDef = findWidgetForQuickInsert(preset.preferredWidgetIds, preset.keywords);
    if (!widgetDef) {
      focusWidgetIcon(preset.keywords);
      return null;
    }
    const size = {
      ...preset.size,
      minW: preset.minSize.w,
      minH: preset.minSize.h
    };
    const pos = position || nextSceneInsertPosition(size.w, size.h);
    return createSceneWidget(widgetDef, {
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
      code: preset.code,
      label: preset.label,
      elementName: preset.elementName
    });
  }

  async function insertQuickShape(position = null, presetOptions = {}) {
    const preset = createNativeElementPreset('shape', {
      ...activeScenePresetContext(),
      presetId: presetOptions.id,
      variant: presetOptions.variant
    });
    const widgetDef = findWidgetForQuickInsert(preset.preferredWidgetIds, preset.keywords);
    if (!widgetDef) {
      focusWidgetIcon(preset.keywords);
      return null;
    }
    const size = {
      ...preset.size,
      minW: preset.minSize.w,
      minH: preset.minSize.h
    };
    const pos = position || nextSceneInsertPosition(size.w, size.h);
    return createSceneWidget(widgetDef, {
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
      code: preset.code,
      label: preset.label,
      elementName: preset.elementName
    });
  }

  async function insertQuickMedia(position = null, presetOptions = {}) {
    let shareURL = '';
    try {
      const media = await window.meltdownEmit?.('openMediaExplorer', { jwt: window.ADMIN_TOKEN });
      shareURL = media?.shareURL || media?.url || '';
    } catch (err) {
      console.warn('[Designer] openMediaExplorer quick insert skipped', err);
    }
    const preset = createNativeElementPreset('media', {
      mediaUrl: shareURL,
      ...activeScenePresetContext(),
      presetId: presetOptions.id,
      variant: presetOptions.variant
    });
    const widgetDef = findWidgetForQuickInsert(preset.preferredWidgetIds, preset.keywords);
    if (!widgetDef) {
      focusWidgetIcon(preset.keywords);
      return null;
    }
    const size = {
      ...preset.size,
      minW: preset.minSize.w,
      minH: preset.minSize.h
    };
    const pos = position || nextSceneInsertPosition(size.w, size.h);
    return createSceneWidget(widgetDef, {
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
      code: preset.code,
      label: preset.label,
      elementName: preset.elementName
    });
  }

  async function insertQuickButton(position = null, presetOptions = {}) {
    const preset = createNativeElementPreset('button', {
      ...activeScenePresetContext(),
      presetId: presetOptions.id,
      variant: presetOptions.variant
    });
    const widgetDef = findWidgetForQuickInsert(preset.preferredWidgetIds, preset.keywords);
    if (!widgetDef) {
      focusWidgetIcon(preset.keywords);
      return null;
    }
    const size = {
      ...preset.size,
      minW: preset.minSize.w,
      minH: preset.minSize.h
    };
    const pos = position || nextSceneInsertPosition(size.w, size.h);
    return createSceneWidget(widgetDef, {
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
      code: preset.code,
      label: preset.label,
      elementName: preset.elementName,
      behavior: preset.behavior || 'scroll'
    });
  }

  async function insertQuickBackground() {
    const scene = getActiveScene();
    if (!scene) return null;
    const background = applySceneBackground(scene, nextSceneBackground(scene));
    if (state.activeWidgetEl) {
      state.activeWidgetEl.classList.remove('selected');
      state.activeWidgetEl = null;
      gridEl?.__grid?.clearSelection?.();
      hideToolbar();
      hideBgToolbar();
    }
    setInspectorMode('content');
    renderSceneNavigation();
    updateSceneInspector(null);
    requestSceneChangePersist();
    return { sceneId: scene.id, background };
  }

  async function insertNativeElement(type, position = null, presetOptions = {}) {
    const nativeType = normalizeNativeElementType(type);
    if (!nativeType) return null;
    if (nativeType === 'background') return insertQuickBackground();
    await ensureDesignLayerForTool();
    if (nativeType === 'text') return insertQuickText(position, presetOptions);
    if (nativeType === 'media') return insertQuickMedia(position, presetOptions);
    if (nativeType === 'shape') return insertQuickShape(position, presetOptions);
    if (nativeType === 'button') return insertQuickButton(position, presetOptions);
    return null;
  }

  async function insertPresetElement(presetId, position = null) {
    const preset = getInsertPreset(presetId);
    if (!preset) return null;
    if (preset.widgetId) return insertWidgetPreset(preset, position);
    if (preset.nativeType) return insertNativeElement(preset.nativeType, position, preset);
    return null;
  }

  async function insertByTypeOrPreset(value, position = null) {
    const preset = getInsertPreset(value);
    if (preset) return insertPresetElement(preset.id, position);
    return insertNativeElement(value, position);
  }

  async function ensureDesignLayerForTool() {
    if (HAS_LAYOUT_STRUCTURE && activeLayer === 0) {
      await switchLayer(1);
    }
  }

  function setActiveWidgetBehavior(behavior) {
    setInspectorMode('behavior');
    const nextBehavior = normalizeBehavior(behavior);
    if (!state.activeWidgetEl) {
      sceneInspector?.querySelector('.scene-layer-settings')?.scrollIntoView?.({
        block: 'nearest',
        behavior: 'smooth'
      });
      updateSceneInspector(null);
      setSidebarToolActive(nextBehavior === 'scroll' ? 'scroll' : 'action');
      return;
    }
    state.activeWidgetEl.dataset.behavior = nextBehavior;
    applyBehaviorRange(
      state.activeWidgetEl,
      state.activeWidgetEl.dataset.scrollStart,
      state.activeWidgetEl.dataset.scrollEnd
    );
    setSidebarToolActive(nextBehavior === 'scroll' ? 'scroll' : 'action');
    updateSceneInspector(state.activeWidgetEl, allWidgets.find(w => w.id === state.activeWidgetEl.dataset.widgetId));
    renderSceneLayers();
    if (pageId && state.autosaveEnabled) scheduleAutosave();
  }

  function commandValue(command = {}, key, fallback = '') {
    const params = command.params && typeof command.params === 'object' ? command.params : {};
    const target = command.target && typeof command.target === 'object' ? command.target : {};
    return params[key] ?? target[key] ?? command[key] ?? fallback;
  }

  function commandAction(command = {}) {
    return String(command.action || command.type || '').trim();
  }

  function selectedElementSummary(el = state.activeWidgetEl) {
    if (!el) return null;
    return {
      id: el.dataset.instanceId || el.id || '',
      widgetId: el.dataset.widgetId || '',
      sceneId: el.dataset.sceneId || '',
      behavior: normalizeBehavior(el.dataset.behavior),
      range: getElementRange(el),
      effects: compactEffects(getElementEffects(el)),
      appearance: getElementAppearance(el)
    };
  }

  function sceneSummary(scene = getActiveScene()) {
    if (!scene) return null;
    return {
      id: scene.id,
      title: scene.title,
      background: getSceneBackground(scene)
    };
  }

  function activateSceneById(sceneId, persist = false) {
    const id = String(sceneId || '').trim();
    const scene = sceneSections.find(section => section.id === id);
    if (!scene) return { handled: false, reason: 'scene-not-found', sceneId: id };
    activeSceneId = scene.id;
    editingSceneId = null;
    renderSceneNavigation();
    if (persist) requestSceneChangePersist();
    return { handled: true, scene: sceneSummary(scene) };
  }

  function stepSceneBy(delta) {
    const activeIndex = sceneSections.findIndex(section => section.id === activeSceneId);
    const next = sceneSections[activeIndex + delta];
    if (!next) return { handled: false, reason: 'scene-edge', activeScene: sceneSummary() };
    return activateSceneById(next.id, false);
  }

  function findCanvasItemByCommand(command = {}) {
    if (!gridEl) return null;
    const raw = String(
      commandValue(command, 'id') ||
      commandValue(command, 'instanceId') ||
      commandValue(command, 'widgetId') ||
      command.target ||
      ''
    ).trim();
    if (!raw) return state.activeWidgetEl || null;
    const escaped = cssEscape(raw);
    return gridEl.querySelector(`.canvas-item[data-instance-id="${escaped}"]`) ||
      gridEl.querySelector(`.canvas-item#${escaped}`) ||
      gridEl.querySelector(`.canvas-item[data-widget-id="${escaped}"]`);
  }

  function selectElementByCommand(command = {}) {
    const el = findCanvasItemByCommand(command);
    if (!el) return { handled: false, reason: 'element-not-found' };
    if (el.dataset.sceneId && el.dataset.sceneId !== activeSceneId) {
      const result = activateSceneById(el.dataset.sceneId, false);
      if (!result.handled) return result;
    }
    selectWidget(el);
    pulseElement(el);
    return { handled: true, selection: selectedElementSummary(el) };
  }

  function updateActiveElementRange(command = {}) {
    const selectResult = command.target || commandValue(command, 'id') ? selectElementByCommand(command) : null;
    if (selectResult && !selectResult.handled) return selectResult;
    const el = state.activeWidgetEl;
    if (!el) return { handled: false, reason: 'no-active-element' };
    const current = getElementRange(el);
    const range = applyElementRangeFromUi(el, {
      start: commandValue(command, 'start', current.start),
      end: commandValue(command, 'end', current.end)
    }, true);
    renderSceneLayers();
    return { handled: true, selection: selectedElementSummary(el), range };
  }

  function updateActiveElementEffects(command = {}) {
    const selectResult = command.target || commandValue(command, 'id') ? selectElementByCommand(command) : null;
    if (selectResult && !selectResult.handled) return selectResult;
    const el = state.activeWidgetEl;
    if (!el) return { handled: false, reason: 'no-active-element' };
    const incoming = commandValue(command, 'effects', null);
    let nextEffects = Array.isArray(incoming) ? normalizeEffects(incoming) : getElementEffects(el);
    const effectId = String(commandValue(command, 'effectId', commandValue(command, 'id', '')) || '').trim();
    if (effectId) {
      nextEffects = nextEffects.map(effect => {
        if (effect.id !== effectId) return effect;
        const range = normalizeRange(
          commandValue(command, 'start', effect.start),
          commandValue(command, 'end', effect.end)
        );
        return {
          ...effect,
          enabled: commandValue(command, 'enabled', true) !== false,
          start: range.start,
          end: range.end
        };
      });
    }
    syncInspectorEffects(nextEffects);
    applyEffectsToElement(el, nextEffects);
    syncWidgetStyleFollowers(el);
    updateSceneInspector(el, allWidgets.find(w => w.id === el.dataset.widgetId));
    renderSceneLayers();
    gridEl?.__grid?.emitChange?.(el, { contentOnly: true });
    if (pageId && state.autosaveEnabled) scheduleAutosave();
    return { handled: true, selection: selectedElementSummary(el), effects: compactEffects(getElementEffects(el)) };
  }

  function updateActiveElementAppearance(command = {}) {
    const selectResult = command.target || commandValue(command, 'id') ? selectElementByCommand(command) : null;
    if (selectResult && !selectResult.handled) return selectResult;
    const el = state.activeWidgetEl;
    if (!el) return { handled: false, reason: 'no-active-element' };
    applyElementAppearance(el, {
      name: commandValue(command, 'name', commandValue(command, 'label', getElementAppearance(el).name)),
      opacity: commandValue(command, 'opacity', getElementAppearance(el).opacity),
      radius: commandValue(command, 'radius', getElementAppearance(el).radius)
    }, true);
    if (isNativeButtonElement(el)) {
      applyNativeButtonContent(el, {
        label: commandValue(command, 'buttonLabel', commandValue(command, 'label', undefined)),
        href: commandValue(command, 'href', undefined)
      }, true);
    }
    updateSceneInspector(el, allWidgets.find(w => w.id === el.dataset.widgetId));
    renderSceneLayers();
    return { handled: true, selection: selectedElementSummary(el) };
  }

  function updateSceneFromCommand(command = {}) {
    const sceneId = commandValue(command, 'sceneId', activeSceneId);
    const scene = sceneSections.find(section => section.id === String(sceneId || '').trim());
    if (!scene) return { handled: false, reason: 'scene-not-found', sceneId };
    const title = String(commandValue(command, 'title', '') || '').trim();
    if (title) {
      scene.title = title;
      updateSceneTitleReferences(scene.id, title);
    }
    const background = commandValue(command, 'background', commandValue(command, 'bgColor', ''));
    if (background) applySceneBackground(scene, background);
    activeSceneId = scene.id;
    editingSceneId = null;
    renderSceneNavigation();
    requestSceneChangePersist();
    return { handled: true, scene: sceneSummary(scene) };
  }

  function findLayoutContainerByCommand(command = {}, key = 'id') {
    if (!layoutRoot) return null;
    const raw = String(commandValue(command, key, '') || '').trim();
    const containers = [
      ...(layoutRoot.classList?.contains('layout-container') ? [layoutRoot] : []),
      ...Array.from(layoutRoot.querySelectorAll('.layout-container'))
    ];
    if (!raw) return getActiveWorkareaContainer() || containers[0] || null;
    return containers.find(container => (
      container.dataset.nodeId === raw || container.id === raw
    )) || null;
  }

  function updateElementGeometry(command = {}) {
    const selectResult = command.target || commandValue(command, 'id') ? selectElementByCommand(command) : null;
    if (selectResult && !selectResult.handled) return selectResult;
    const el = state.activeWidgetEl;
    if (!el) return { handled: false, reason: 'no-active-element' };
    const current = {
      x: Number(el.dataset.x || 0),
      y: Number(el.dataset.y || 0),
      w: Number(el.getAttribute('gs-w') || 1),
      h: Number(el.getAttribute('gs-h') || 1)
    };
    const geometry = {
      x: Number(commandValue(command, 'x', current.x)),
      y: Number(commandValue(command, 'y', current.y)),
      w: Math.max(1, Number(commandValue(command, 'w', current.w))),
      h: Math.max(1, Number(commandValue(command, 'h', current.h)))
    };
    grid.update(el, geometry);
    selectWidget(el);
    renderSceneLayers();
    if (pageId && state.autosaveEnabled) scheduleAutosave();
    return { handled: true, geometry, selection: selectedElementSummary(el) };
  }

  function updateElementResponsiveRange(command = {}) {
    const selectResult = command.target || commandValue(command, 'id') ? selectElementByCommand(command) : null;
    if (selectResult && !selectResult.handled) return selectResult;
    const el = state.activeWidgetEl;
    if (!el) return { handled: false, reason: 'no-active-element' };
    const viewport = getBuilderViewportState();
    const range = normalizeResponsiveWidthRange({
      minWidth: commandValue(command, 'minWidth', viewport.width),
      maxWidth: commandValue(command, 'maxWidth', viewport.width)
    }, viewport.width);
    grid.setResponsiveRange?.(range, { element: el, rewriteActive: true });
    if (pageId && state.autosaveEnabled) scheduleAutosave();
    return {
      handled: true,
      range,
      responsivePlacement: grid.getResponsivePlacementState?.(el) || null,
      selection: selectedElementSummary(el)
    };
  }

  function setElementStack(command = {}) {
    const selectResult = command.target || commandValue(command, 'id') ? selectElementByCommand(command) : null;
    if (selectResult && !selectResult.handled) return selectResult;
    const el = state.activeWidgetEl;
    if (!el) return { handled: false, reason: 'no-active-element' };
    const direction = String(commandValue(command, 'direction', '') || '').trim();
    if (direction === 'forward' || direction === 'backward') {
      const moved = arrangeSceneWidget(el, direction);
      return { handled: moved, direction, selection: selectedElementSummary(el) };
    }
    const zIndex = Math.max(1, Math.round(Number(commandValue(command, 'zIndex', layerStackIndex(el))) || 1));
    el.style.zIndex = String(zIndex);
    el.dataset.layerOrder = String(zIndex);
    renderSceneLayers();
    requestSceneChangePersist();
    return { handled: true, zIndex, selection: selectedElementSummary(el) };
  }

  function deleteElementFromCommand(command = {}) {
    const el = findCanvasItemByCommand(command);
    if (!el) return { handled: false, reason: 'element-not-found' };
    const id = el.dataset.instanceId || el.id || '';
    grid.removeWidget(el);
    if (state.activeWidgetEl === el) {
      state.activeWidgetEl = null;
      actionBar.style.display = 'none';
      setActiveElement(null);
      hideToolbar();
      updateSceneInspector(null);
    }
    renderSceneLayers();
    if (pageId && state.autosaveEnabled) scheduleAutosave();
    return { handled: true, deletedId: id };
  }

  async function duplicateElementFromCommand(command = {}) {
    const source = findCanvasItemByCommand(command);
    if (!source) return { handled: false, reason: 'element-not-found' };
    updateAllWidgetContents();
    const widgetDef = allWidgets.find(widget => widget.id === source.dataset.widgetId);
    if (!widgetDef) return { handled: false, reason: 'widget-definition-not-found' };
    const sourceCode = ensureCodeMap()[source.dataset.instanceId];
    const code = sourceCode ? JSON.parse(JSON.stringify(sourceCode)) : null;
    const duplicate = await createSceneWidget(widgetDef, {
      x: Number(source.dataset.x || 0) + 1,
      y: Number(source.dataset.y || 0) + 1,
      w: Number(source.getAttribute('gs-w') || 1),
      h: Number(source.getAttribute('gs-h') || DEFAULT_ROWS),
      minW: Number(source.getAttribute('gs-min-w') || 1),
      minH: Number(source.getAttribute('gs-min-h') || 1),
      code,
      behavior: source.dataset.behavior,
      elementName: source.dataset.elementName
    });
    if (!duplicate) return { handled: false, reason: 'duplicate-create-failed' };
    ['scrollStart', 'scrollEnd', 'effects', 'opacity', 'radius'].forEach(key => {
      if (source.dataset[key] !== undefined) duplicate.dataset[key] = source.dataset[key];
    });
    renderSceneLayers();
    return { handled: true, selection: selectedElementSummary(duplicate) };
  }

  function updateTextFromCommand(command = {}) {
    const selectResult = command.target || commandValue(command, 'id') ? selectElementByCommand(command) : null;
    if (selectResult && !selectResult.handled) return selectResult;
    const widget = state.activeWidgetEl;
    if (!widget) return { handled: false, reason: 'no-active-element' };
    const editable = getRegisteredEditable(widget)
      || widget.querySelector('[data-text-editable], .editable');
    if (!editable) return { handled: false, reason: 'selected-element-is-not-text-editable' };
    const content = commandValue(command, 'content', undefined);
    if (content !== undefined) editable.textContent = String(content);
    const styleValues = {
      fontFamily: commandValue(command, 'fontFamily', undefined),
      color: commandValue(command, 'color', undefined),
      fontSize: commandValue(command, 'fontSize', undefined),
      fontWeight: commandValue(command, 'fontWeight', undefined),
      fontStyle: commandValue(command, 'fontStyle', undefined),
      textDecoration: commandValue(command, 'textDecoration', undefined),
      textAlign: commandValue(command, 'textAlign', undefined)
    };
    Object.entries(styleValues).forEach(([property, value]) => {
      if (value !== undefined) editable.style[property] = String(value || '');
    });
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    document.dispatchEvent(new CustomEvent('designerContentChanged', {
      detail: { source: 'agent-text-update', elementId: widget.dataset.instanceId || widget.id }
    }));
    updateAllWidgetContents();
    return {
      handled: true,
      defaultTypography: !editable.style.fontFamily,
      defaultColor: !editable.style.color,
      selection: selectedElementSummary(widget)
    };
  }

  function updateContainerFromCommand(action, command = {}) {
    const target = findLayoutContainerByCommand(command, 'id');
    if (!target) return { handled: false, reason: 'container-not-found' };
    if (action === 'container.create') {
      placeContainer(target, commandValue(command, 'position', 'inside'));
    } else if (action === 'container.delete') {
      deleteContainer(target);
    } else if (action === 'container.mode.set') {
      setContainerLayoutMode(target, commandValue(command, 'mode', 'free'));
    } else if (action === 'container.settings.set') {
      const settings = commandValue(command, 'settings', {});
      setContainerSettings(target, settings && typeof settings === 'object' ? settings : {});
    } else if (action === 'container.move') {
      const source = findLayoutContainerByCommand(command, 'sourceId');
      const destination = findLayoutContainerByCommand(command, 'targetId');
      if (!source || !destination) return { handled: false, reason: 'container-source-or-target-not-found' };
      moveContainer(source, destination, commandValue(command, 'position', 'inside'));
    } else if (action === 'container.styleSource.link') {
      const source = findLayoutContainerByCommand(command, 'sourceId');
      if (source && source !== target) {
        source.dataset.styleSourceEnabled = 'true';
        source.dataset.styleSourceRole = 'source';
        source.dataset.styleSyncLayout = 'true';
        source.dataset.styleSyncDesign = 'true';
        if (
          target.dataset.styleSourceEnabled !== 'true'
          || target.dataset.styleSourceId !== source.dataset.nodeId
        ) {
          target.dataset.styleSourceEnabled = 'false';
          delete target.dataset.styleSourceId;
          toggleContainerStyleSource(target);
        }
      } else if (target.dataset.styleSourceEnabled !== 'true' || !target.dataset.styleSourceId) {
        toggleContainerStyleSource(target);
      }
    } else if (action === 'container.styleSource.unlink') {
      if (target.dataset.styleSourceEnabled !== 'false') {
        if (target.dataset.styleSourceId) toggleContainerStyleSource(target);
        else {
          target.dataset.styleSourceEnabled = 'false';
          handleContainerMutation();
        }
      }
    } else {
      return { handled: false, reason: 'unsupported-container-command', action };
    }
    return { handled: true, action, container: containerDebugInfo(target) };
  }

  async function createCurrentSitePreset(command = {}) {
    const name = String(commandValue(command, 'name', '') || '').trim();
    if (!name) return { handled: false, reason: 'missing-site-preset-name' };
    const colorScheme = getActiveColorScheme();
    const fontPackage = getActiveFontPackage();
    if (!colorScheme || !fontPackage) {
      return { handled: false, reason: 'site-preset-defaults-unavailable' };
    }
    const demo = layoutCtx.captureSitePresetDemo?.();
    const preset = await createSitePreset({
      name,
      version: String(commandValue(command, 'version', '1.0.0')),
      developer: String(commandValue(command, 'developer', 'User')),
      builderSettings: layoutCtx.getSitePresetSettings?.() || {},
      colorScheme,
      fontPackage,
      pageDemos: demo ? [demo] : []
    });
    return { handled: Boolean(preset), preset };
  }

  async function saveDesignFromCommand(command = {}) {
    const nameInput = document.querySelector('#layoutNameInput');
    const name = String(commandValue(command, 'name', nameInput?.value || layoutName || '') || '').trim();
    if (!name) return { handled: false, reason: 'missing-design-name' };
    const result = await saveDesign({
      name,
      description: String(commandValue(command, 'description', '') || ''),
      gridEl,
      layoutRoot,
      getCurrentLayoutForLayer,
      getActiveLayer: () => activeLayer,
      ensureCodeMap,
      capturePreview: options => captureGridPreview(gridEl, options),
      updateAllWidgetContents,
      ownerId: getAdminUserId(),
      pageId,
      isLayout: activeLayer === 0,
      isGlobal: activeLayer === 0
    });
    return { handled: true, result };
  }

  async function startPublishFromCommand(command = {}) {
    document.getElementById('publishLayoutBtn')?.click();
    const deadline = Date.now() + 4000;
    let slugInput = null;
    let confirmButton = null;
    while (Date.now() < deadline && (!slugInput || !confirmButton)) {
      slugInput = document.querySelector('.publish-slug-input');
      confirmButton = document.querySelector('.publish-confirm');
      if (!slugInput || !confirmButton) await new Promise(resolve => window.setTimeout(resolve, 25));
    }
    if (!slugInput || !confirmButton) {
      return { handled: false, reason: 'publish-panel-unavailable', code: 'DESIGNER_AGENT_PUBLISH_PANEL_UNAVAILABLE' };
    }
    const slug = String(commandValue(command, 'slug', slugInput.value || '') || '').trim();
    if (!slug) return { handled: false, reason: 'missing-publish-slug' };
    slugInput.value = slug;
    slugInput.dispatchEvent(new Event('input', { bubbles: true }));
    const draft = commandValue(command, 'draft', undefined);
    const draftInput = document.querySelector('.publish-draft-checkbox');
    if (draftInput && draft !== undefined) {
      draftInput.checked = Boolean(draft);
      draftInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    confirmButton.click();
    const publishDeadline = Date.now() + 30000;
    while (Date.now() < publishDeadline) {
      const success = document.querySelector('.publish-info[data-variant="success"]:not(.hidden)');
      if (success) {
        return {
          handled: true,
          published: true,
          slug,
          draft: draftInput?.checked ?? null,
          message: success.textContent?.trim() || 'Design published successfully.'
        };
      }
      const warning = document.querySelector('.publish-warning:not(.hidden)');
      if (warning?.textContent?.trim()) {
        return {
          handled: false,
          reason: 'publish-failed',
          code: 'DESIGNER_AGENT_PUBLISH_FAILED',
          message: warning.textContent.trim()
        };
      }
      await new Promise(resolve => window.setTimeout(resolve, 50));
    }
    return {
      handled: false,
      reason: 'publish-timeout',
      code: 'DESIGNER_AGENT_PUBLISH_TIMEOUT',
      slug
    };
  }

  async function executeDesignerAgentCommand(command = {}) {
    const action = commandAction(command);
    if (action === 'scene.next') return stepSceneBy(1);
    if (action === 'scene.prev' || action === 'scene.previous') return stepSceneBy(-1);
    if (action === 'scene.add') return { handled: true, scene: sceneSummary(createSceneFromUi({ edit: false })) };
    if (action === 'scene.select') return activateSceneById(commandValue(command, 'sceneId', command.target), false);
    if (action === 'scene.rename' || action === 'scene.update' || action === 'scene.background') return updateSceneFromCommand(command);
    if (action === 'scene.move' || action === 'scene.reorder') {
      const sceneId = String(commandValue(command, 'sceneId', activeSceneId));
      const currentIndex = sceneSections.findIndex(scene => scene.id === sceneId);
      const requestedIndex = commandValue(command, 'index', undefined);
      const delta = requestedIndex === undefined
        ? Number(commandValue(command, 'delta', 0))
        : Number(requestedIndex) - currentIndex;
      if (currentIndex < 0 || !delta) return { handled: false, reason: currentIndex < 0 ? 'scene-not-found' : 'scene-position-unchanged' };
      const direction = delta > 0 ? 1 : -1;
      for (let step = 0; step < Math.abs(delta); step += 1) moveScene(sceneId, direction);
      return { handled: true, scene: sceneSummary(sceneSections.find(scene => scene.id === sceneId)) };
    }
    if (action === 'scene.delete') {
      const sceneId = String(commandValue(command, 'sceneId', activeSceneId));
      const before = sceneSections.length;
      removeScene(sceneId);
      return { handled: sceneSections.length < before, deletedSceneId: sceneId };
    }
    if (action === 'insert' || action === 'insert.element') {
      const type = commandValue(command, 'type', command.value || command.target);
      const inserted = await insertByTypeOrPreset(type);
      const insertedEl = inserted instanceof HTMLElement ? inserted : state.activeWidgetEl;
      return { handled: Boolean(inserted), type, result: inserted, selection: selectedElementSummary(insertedEl) };
    }
    if (action === 'element.select') return selectElementByCommand(command);
    if (action === 'element.move' || action === 'element.resize' || action === 'element.geometry.set') return updateElementGeometry(command);
    if (action === 'element.responsiveRange.set') return updateElementResponsiveRange(command);
    if (action === 'element.zIndex.set' || action === 'element.arrange') return setElementStack(command);
    if (action === 'element.delete') return deleteElementFromCommand(command);
    if (action === 'element.duplicate') return duplicateElementFromCommand(command);
    if (action === 'text.update' || action === 'text.format.set') return updateTextFromCommand(command);
    if (action === 'behavior.set') {
      const selectResult = command.target || commandValue(command, 'id') ? selectElementByCommand(command) : null;
      if (selectResult && !selectResult.handled) return selectResult;
      setActiveWidgetBehavior(commandValue(command, 'behavior', command.value || command.target));
      return { handled: Boolean(state.activeWidgetEl), selection: selectedElementSummary() };
    }
    if (action === 'range.set' || action === 'behavior.range.set') return updateActiveElementRange(command);
    if (action === 'effect.set' || action === 'effects.set') return updateActiveElementEffects(command);
    if (action === 'element.update' || action === 'element.appearance.set') return updateActiveElementAppearance(command);
    if (action.startsWith('container.')) return updateContainerFromCommand(action, command);
    if (action === 'viewport.set') {
      return { handled: true, viewport: setBuilderViewportWidth(commandValue(command, 'width', 1280)) };
    }
    if (action === 'viewport.preset') {
      return { handled: true, viewport: setBuilderViewportPreset(commandValue(command, 'preset', command.target)) };
    }
    if (action === 'viewport.zoom.set') {
      return { handled: true, viewport: setBuilderZoom(commandValue(command, 'zoom', 100)) };
    }
    if (action === 'sitePresets.create') return createCurrentSitePreset(command);
    if (action === 'design.save') return saveDesignFromCommand(command);
    if (action === 'design.publish') return startPublishFromCommand(command);
    if (action === 'publishing.open') {
      document.getElementById('publishLayoutBtn')?.click();
      return { handled: true };
    }
    return { handled: false, reason: 'unsupported-command', action };
  }

  window.blogposterDesignerCommands = {
    execute: executeDesignerAgentCommand,
    snapshot: () => ({
      activeScene: sceneSummary(),
      sections: getSceneSectionsSnapshot(),
      selection: selectedElementSummary(),
      viewport: getBuilderViewportState()
    })
  };

  document.addEventListener('designerToolSelected', async event => {
    const tool = event.detail?.tool;
    if (!tool) return;
    if (SIDEBAR_TOOL_NAMES.has(tool)) setSidebarToolActive(tool);
    if (tool === 'layout') {
      hideBuilderPanel();
      if (HAS_LAYOUT_STRUCTURE) await switchLayer(0);
      focusSidebarSection('.layout-panel');
      return;
    }
    await ensureDesignLayerForTool();
    if (tool === 'insert') {
      hideBuilderPanel();
      setSidebarPanel('insert');
      focusSidebarSection('.element-library');
      return;
    }
    if (tool === 'text') {
      hideBuilderPanel();
      await insertQuickText();
      return;
    }
    if (tool === 'media') {
      hideBuilderPanel();
      await insertQuickMedia();
      return;
    }
    if (tool === 'shape') {
      hideBuilderPanel();
      await insertQuickShape();
      return;
    }
    if (tool === 'scroll') {
      setActiveWidgetBehavior('scroll');
      sceneInspector?.querySelector('.scene-inspector-group')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    if (tool === 'action') {
      if (state.activeWidgetEl) {
        setActiveWidgetBehavior('pinned');
        sceneInspector?.querySelector('.scene-effect-list')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      } else {
        hideBuilderPanel();
        await insertQuickButton();
      }
    }
  });

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
      e.target.closest('.color-picker') ||
      e.target.closest('.scene-inspector')
    ) {
      return;
    }
    actionBar.style.display = 'none';
    state.activeWidgetEl.classList.remove('selected');
    state.activeWidgetEl.dispatchEvent(new Event('deselected'));
    removeStageBehaviorHuds();
    state.activeWidgetEl = null;
    updateSceneInspector(null);
    renderSceneLayers();
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
                 e.target.closest('.scene-empty-state') ||
                 e.target.closest('.scene-inspector') ||
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
                 e.target.closest('.scene-empty-state') ||
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
      const layoutRes = await emitAdminFacade(meltdownEmit, 'plainSpace', 'layoutForViewport', {
        pageId,
        lane: 'public',
        viewport: 'desktop'
      });
      initialLayout = Array.isArray(layoutRes?.layout) ? layoutRes.layout : [];

      const pageRes = await emitAdminFacade(meltdownEmit, 'pages', 'get', {
        pageId
      });
      pageData = pageRes?.data ?? pageRes ?? null;

      if (HAS_LAYOUT_STRUCTURE) {
        try {
          const globalRes = await emitAdminFacade(meltdownEmit, 'plainSpace', 'globalLayoutTemplate');
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
      ? loadedDesign.widgets.map(w => {
          const meta = parseWidgetMeta(w.metadata);
          return {
            id: w.instance_id || w.instanceId,
            widgetId: w.widget_id || w.widgetId,
            xPercent: w.x_percent ?? w.xPercent,
            yPercent: w.y_percent ?? w.yPercent,
            wPercent: w.w_percent ?? w.wPercent,
            hPercent: w.h_percent ?? w.hPercent,
            behavior: meta.behavior || w.behavior,
            sceneId: meta.sceneId || w.sceneId,
            sceneTitle: meta.sceneTitle || w.sceneTitle,
            sceneBackground: meta.sceneBackground || w.sceneBackground || w.scene_background,
            scrollStart: meta.scrollStart || w.scrollStart || w.scroll_start,
            scrollEnd: meta.scrollEnd || w.scrollEnd || w.scroll_end,
            effects: meta.effects || w.effects,
            elementName: meta.elementName || w.elementName || w.element_name,
            opacity: meta.opacity ?? w.opacity,
            radius: meta.radius ?? w.radius,
            code: {
              html: w.html,
              css: w.css,
              js: w.js,
              meta
            }
          };
        })
      : [];
    pageData = loadedDesign?.design || null;
  } else {
    if (layoutNameParam) {
      try {
        const tplRes = await emitAdminFacade(meltdownEmit, 'plainSpace', 'layoutTemplate', {
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
        const globalRes = await emitAdminFacade(meltdownEmit, 'plainSpace', 'globalLayoutTemplate');
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
  hydrateSceneSectionsFromLayoutTree(persistedLayoutData);
  hydrateSceneSectionsFromLayouts(layoutLayers.map(layer => layer.layout));

  if (HAS_LAYOUT_STRUCTURE) {
    if (globalLayoutName) {
      document.body.dataset.globalLayoutName = globalLayoutName;
    } else {
      delete document.body.dataset.globalLayoutName;
    }
  }
  applyCompositeLayout(activeLayer);
  markInactiveWidgets();
  renderSceneNavigation();

  gridEl.addEventListener('dragover',  e => { e.preventDefault(); gridEl.classList.add('drag-over'); });
  gridEl.addEventListener('dragleave', () => gridEl.classList.remove('drag-over'));
  gridEl.addEventListener('drop', async e => {
    e.preventDefault();
    gridEl.classList.remove('drag-over');
    const dragData = e.dataTransfer?.getData('text/plain') || '';
    const presetId = dragData.startsWith(INSERT_PRESET_PREFIX)
      ? normalizeInsertPresetId(dragData)
      : '';
    if (presetId) {
      const preset = getInsertPreset(presetId);
      const baseSize = preset?.size
        || (preset?.nativeType ? nativeElementSize(preset.nativeType, preset.variant) : defaultWidgetDimensions());
      await insertPresetElement(presetId, dropSceneInsertPosition(e, baseSize.w, baseSize.h));
      return;
    }
    const nativeType = dragData.startsWith(NATIVE_ELEMENT_PREFIX)
      ? normalizeNativeElementType(dragData)
      : '';
    if (nativeType) {
      const size = nativeElementSize(nativeType);
      await insertNativeElement(nativeType, dropSceneInsertPosition(e, size.w, size.h));
      return;
    }
    const widgetDef = allWidgets.find(w => w.id === dragData);
    if (!widgetDef) return;
    await ensureDesignLayerForTool();
    const size = defaultWidgetDimensions();
    const { x, y } = dropSceneInsertPosition(e, size.w, size.h);
    await createSceneWidget(widgetDef, { x, y, ...size });
  });

  if (!layoutName) {
    layoutName =
      layoutNameParam ||
      pageData?.meta?.layoutTemplate ||
      pageData?.title ||
      'layout-title';
  }

  currentDesignId = state.designId || layoutName;
  resetDesignHistory(currentDesignId);
  pushLayoutState(initialLayout);
  layoutBar = buildLayoutBar({ footer, grid, gridEl });

  if (HAS_LAYOUT_STRUCTURE) {
    if (activeLayer === 0) {
      await startLayoutMode(layoutCtx);
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

  Object.assign(layoutCtx, {
    getSitePresetSettings: () => {
      const container = layoutRoot?.querySelector('.layout-container') || layoutRoot;
      const numberFromCss = (value, fallback = 0) => {
        const numeric = Number.parseFloat(String(value || ''));
        return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
      };
      return {
        layoutMode: container?.dataset?.layoutMode || 'free',
        gap: numberFromCss(container?.dataset?.layoutGap),
        padding: numberFromCss(container?.dataset?.layoutPadding),
        sceneBackground: getSceneBackground()
      };
    },
    applySitePresetSettings: settings => {
      const source = settings && typeof settings === 'object' ? settings : {};
      const container = layoutRoot?.querySelector('.layout-container') || layoutRoot;
      setContainerLayoutMode(container, source.layoutMode || 'free');
      setContainerSettings(container, {
        gap: `${Math.max(0, Number(source.gap) || 0)}px`,
        padding: `${Math.max(0, Number(source.padding) || 0)}px`
      });
      applySceneBackground(getActiveScene(), source.sceneBackground);
      renderSceneNavigation();
      requestSceneChangePersist();
    },
    captureSitePresetDemo: () => {
      const layout = getCurrentLayoutForLayer(gridEl, activeLayer, ensureCodeMap());
      const elements = layout.map(item => {
        const presetId = String(item.code?.meta?.presetId || '');
        if (!presetId || !getInsertPreset(presetId)) return null;
        return {
          presetId,
          x: Math.max(0, Math.min(11, Math.round((Number(item.xPercent) || 0) * 0.12))),
          y: Math.max(0, Math.round((Number(item.yPercent) || 0) * 10)),
          w: Math.max(1, Math.min(12, Math.round((Number(item.wPercent) || 25) * 0.12))),
          h: Math.max(1, Math.round((Number(item.hPercent) || 8) * 10))
        };
      }).filter(Boolean);
      return {
        id: 'current-scene',
        name: getActiveScene()?.title || 'Current scene',
        scene: {
          title: getActiveScene()?.title || 'Scene',
          background: getSceneBackground()
        },
        elements
      };
    },
    applySitePresetDemo: async demo => {
      const source = demo && typeof demo === 'object' ? demo : {};
      const elements = Array.isArray(source.elements) ? source.elements : [];
      await ensureDesignLayerForTool();
      applySnapshot([]);
      const scene = getActiveScene();
      if (scene && source.scene) {
        scene.title = String(source.scene.title || scene.title).trim() || scene.title;
        applySceneBackground(scene, source.scene.background);
        renderSceneNavigation();
      }
      const columns = Math.max(1, Number(grid?.options?.columns) || gridEl?.clientWidth || 1200);
      for (const element of elements) {
        const x = Math.round((Math.max(0, Number(element.x) || 0) / 12) * columns);
        const w = Math.max(1, Math.round((Math.max(1, Number(element.w) || 4) / 12) * columns));
        await insertPresetElement(element.presetId, {
          x,
          y: Math.max(0, Number(element.y) || 0),
          w,
          h: Math.max(1, Number(element.h) || DEFAULT_ROWS)
        });
      }
      markInactiveWidgets();
      requestSceneChangePersist();
    }
  });

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
    capturePreview: options => captureGridPreview(gridEl, options),
    updateAllWidgetContents,
    getAdminUserId,
    pageId,
    layoutRoot,
    state,
    startAutosave,
    showPreviewHeader,
    hidePreviewHeader,
    livePreviewController: createLivePreviewController({
      displayPorts,
      frameUrl: buildLivePreviewFrameUrl(pageData?.slug || window.PAGE_SLUG || ''),
      buildPayload: viewport => buildLivePreviewPayload({
        title: document.querySelector('#layoutNameInput')?.value?.trim() || layoutName || pageData?.title || 'Design Preview',
        activeLayer,
        hasLayoutStructure: HAS_LAYOUT_STRUCTURE,
        gridEl,
        layoutRoot,
        layoutLayers,
        allWidgets,
        globalLayout: HAS_LAYOUT_STRUCTURE ? layoutLayers[0]?.layout || [] : [],
        viewport,
        state,
        getCurrentLayoutForLayer,
        ensureCodeMap,
        updateAllWidgetContents,
        saveActiveLayer,
        getSceneSections: getSceneSectionsSnapshot
      })
    }),
    openDesignSettings: () => setSidebarPanel('design'),
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
        await startLayoutMode(layoutCtx);
        wireArrangeToggle();
      } else {
        deactivateArrange();
        stopLayoutMode(layoutCtx);
        renderSceneNavigation();
      }
    }
  }

}
