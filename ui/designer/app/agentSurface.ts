import {
  createAgentControlClient,
  createAgentSurfaceClient,
  SURFACE_AGENT_ACTIONS,
  type AgentSurfaceClient,
  type AgentSurfaceCommand,
  type AgentSurfaceSnapshotPayload,
  type BuildSnapshotContext
} from '/ui/shared/agent/agentSurfaceClient.js';
import { capturePreview } from './renderer/capturePreview.js';
import { livePreviewFeedbackState } from './renderer/livePreviewFrame.js';
import {
  activateColorScheme,
  colorLibraryAgentState,
  createColorScheme,
  createLibraryColor,
  deleteColorScheme,
  deleteLibraryColor,
  refreshColorLibrary,
  renameColorScheme,
  updateLibraryColor
} from '/ui/shared/colors/colorLibrary.js';
import {
  activateFontPackage,
  createFontPackage,
  deleteFontPackage,
  fontPackagesAgentState,
  refreshFontPackages,
  renameFontPackage,
  resetFontPackageRole,
  updateFontPackageRole,
  type FontPackageRole,
  type FontRoleStyles
} from '/ui/shared/fonts/fontPackages.js';
import {
  applySitePreset,
  deleteSitePreset,
  refreshSitePresets,
  sitePresetsAgentState
} from '/ui/shared/presets/sitePresets.js';
import { getBuilderViewportState } from './renderer/viewportState.js';
import {
  normalizeResponsivePlacementContract,
  resolveResponsivePlacementGeometry,
  responsiveRuleForWidth
} from '/ui/shared/layout/responsivePlacement.js';

const SURFACE_ID = 'studio.designer';
const APP_NAME = 'designer';
const VISUAL_CAPTURE_MIN_INTERVAL_MS = 7000;
const DEFAULT_BEHAVIOR_RANGE = { start: 10, end: 60 };
const EFFECT_LABELS: Record<string, string> = {
  fadeIn: 'Fade In',
  fadeOut: 'Fade Out',
  moveY: 'Move Y'
};
const DESIGNER_AGENT_ACTIONS = Object.freeze([
  ...SURFACE_AGENT_ACTIONS,
  {
    action: 'feedback.refresh',
    label: 'Refresh feedback',
    category: 'feedback',
    description: 'Publishes a fresh structured Design Studio feedback snapshot through AgentManager.'
  },
  {
    action: 'scene.next',
    label: 'Next scene',
    category: 'scene',
    description: 'Selects the next scene on the stage.'
  },
  {
    action: 'scene.prev',
    label: 'Previous scene',
    category: 'scene',
    description: 'Selects the previous scene on the stage.'
  },
  {
    action: 'scene.add',
    label: 'Add scene',
    category: 'scene',
    description: 'Creates a new scene and makes it active.'
  },
  {
    action: 'scene.select',
    label: 'Select scene',
    category: 'scene',
    description: 'Selects a scene by id.',
    params: [{ name: 'sceneId', type: 'string', required: true }]
  },
  {
    action: 'scene.update',
    label: 'Update scene',
    category: 'scene',
    description: 'Renames a scene or changes its background.',
    params: [
      { name: 'sceneId', type: 'string', required: false },
      { name: 'title', type: 'string', required: false },
      { name: 'background', type: 'color', required: false }
    ]
  },
  {
    action: 'scene.move',
    label: 'Move scene',
    category: 'scene',
    description: 'Moves a scene by delta or to an exact zero-based index.',
    params: [
      { name: 'sceneId', type: 'string', required: true },
      { name: 'delta', type: 'number', required: false },
      { name: 'index', type: 'number', required: false }
    ]
  },
  {
    action: 'scene.delete',
    label: 'Delete scene',
    category: 'scene',
    description: 'Deletes a scene while preserving the required final scene.',
    params: [{ name: 'sceneId', type: 'string', required: true }]
  },
  {
    action: 'insert.element',
    label: 'Insert element',
    category: 'content',
    description: 'Inserts a native text, media, shape, button or background element.',
    params: [{ name: 'type', type: 'text|media|shape|button|background', required: true }]
  },
  {
    action: 'element.select',
    label: 'Select element',
    category: 'element',
    description: 'Selects an element by instance id, DOM id or widget id.',
    params: [{ name: 'id', type: 'string', required: true }]
  },
  {
    action: 'behavior.set',
    label: 'Set behavior',
    category: 'behavior',
    description: 'Sets selected element behavior to scroll, sticky or pinned.',
    requiresSelection: true,
    params: [
      { name: 'id', type: 'string', required: false },
      { name: 'behavior', type: 'scroll|sticky|pinned', required: true }
    ]
  },
  {
    action: 'range.set',
    label: 'Set behavior range',
    category: 'behavior',
    description: 'Sets selected element scroll behavior range in percent.',
    requiresSelection: true,
    params: [
      { name: 'id', type: 'string', required: false },
      { name: 'start', type: 'number', required: true },
      { name: 'end', type: 'number', required: true }
    ]
  },
  {
    action: 'effect.set',
    label: 'Set effect',
    category: 'behavior',
    description: 'Enables or adjusts fadeIn, fadeOut or moveY effect ranges.',
    requiresSelection: true,
    params: [
      { name: 'id', type: 'string', required: false },
      { name: 'effectId', type: 'fadeIn|fadeOut|moveY', required: true },
      { name: 'enabled', type: 'boolean', required: false },
      { name: 'start', type: 'number', required: false },
      { name: 'end', type: 'number', required: false }
    ]
  },
  {
    action: 'element.update',
    label: 'Update element',
    category: 'element',
    description: 'Updates selected element name, opacity, corner radius or button content.',
    requiresSelection: true,
    params: [
      { name: 'id', type: 'string', required: false },
      { name: 'name', type: 'string', required: false },
      { name: 'opacity', type: 'number', required: false },
      { name: 'radius', type: 'number', required: false },
      { name: 'label', type: 'string', required: false },
      { name: 'href', type: 'string', required: false }
    ]
  },
  {
    action: 'element.geometry.set',
    label: 'Set element geometry',
    category: 'element',
    description: 'Moves or resizes an element using exact Builder grid coordinates.',
    requiresSelection: true,
    params: [
      { name: 'id', type: 'string', required: false },
      { name: 'x', type: 'number', required: false },
      { name: 'y', type: 'number', required: false },
      { name: 'w', type: 'number', required: false },
      { name: 'h', type: 'number', required: false }
    ]
  },
  {
    action: 'element.responsiveRange.set',
    label: 'Set responsive range',
    category: 'element',
    description: 'Stores the selected element geometry for an exact viewport-width range.',
    requiresSelection: true,
    params: [
      { name: 'id', type: 'string', required: false },
      { name: 'minWidth', type: 'number', required: true },
      { name: 'maxWidth', type: 'number', required: true }
    ]
  },
  {
    action: 'element.move',
    label: 'Move element',
    category: 'element',
    description: 'Moves an element to exact Builder grid coordinates.',
    requiresSelection: true,
    params: [
      { name: 'id', type: 'string', required: false },
      { name: 'x', type: 'number', required: true },
      { name: 'y', type: 'number', required: true }
    ]
  },
  {
    action: 'element.resize',
    label: 'Resize element',
    category: 'element',
    description: 'Resizes an element to exact Builder grid dimensions.',
    requiresSelection: true,
    params: [
      { name: 'id', type: 'string', required: false },
      { name: 'w', type: 'number', required: true },
      { name: 'h', type: 'number', required: true }
    ]
  },
  {
    action: 'element.zIndex.set',
    label: 'Set element stack',
    category: 'element',
    description: 'Sets an exact z-index or moves the element one step forward or backward.',
    requiresSelection: true,
    params: [
      { name: 'id', type: 'string', required: false },
      { name: 'zIndex', type: 'number', required: false },
      { name: 'direction', type: 'forward|backward', required: false }
    ]
  },
  {
    action: 'element.duplicate',
    label: 'Duplicate element',
    category: 'element',
    description: 'Duplicates an element through the existing widget creation path.',
    requiresSelection: true
  },
  {
    action: 'element.delete',
    label: 'Delete element',
    category: 'element',
    description: 'Deletes an element through the active Builder grid.',
    requiresSelection: true
  },
  {
    action: 'text.update',
    label: 'Update text',
    category: 'content',
    description: 'Updates text content and optional direct font or color overrides; empty values restore defaults.',
    requiresSelection: true,
    params: [
      { name: 'id', type: 'string', required: false },
      { name: 'content', type: 'string', required: false },
      { name: 'fontFamily', type: 'string', required: false },
      { name: 'color', type: 'color', required: false },
      { name: 'fontSize', type: 'string', required: false },
      { name: 'fontWeight', type: 'string', required: false },
      { name: 'textAlign', type: 'string', required: false }
    ]
  },
  {
    action: 'viewport.set',
    label: 'Set viewport width',
    category: 'viewport',
    description: 'Sets the exact shared Builder and Live Preview viewport width.',
    params: [{ name: 'width', type: 'number', required: true }]
  },
  {
    action: 'viewport.preset',
    label: 'Set viewport preset',
    category: 'viewport',
    description: 'Selects Desktop, Tablet or Mobile in every Builder viewport control.',
    params: [{ name: 'preset', type: 'desktop|tablet|mobile', required: true }]
  },
  {
    action: 'viewport.zoom.set',
    label: 'Set Builder zoom',
    category: 'viewport',
    description: 'Sets the shared Builder zoom percentage.',
    params: [{ name: 'zoom', type: 'number', required: true }]
  },
  {
    action: 'container.create',
    label: 'Create layout container',
    category: 'layout',
    description: 'Creates a container through the existing layout container manager.',
    params: [
      { name: 'id', type: 'string', required: false },
      { name: 'position', type: 'string', required: true }
    ]
  },
  {
    action: 'container.move',
    label: 'Move layout container',
    category: 'layout',
    description: 'Moves a container relative to another container.',
    params: [
      { name: 'sourceId', type: 'string', required: true },
      { name: 'targetId', type: 'string', required: true },
      { name: 'position', type: 'string', required: true }
    ]
  },
  {
    action: 'container.delete',
    label: 'Delete layout container',
    category: 'layout',
    description: 'Deletes a container through the existing layout container manager.',
    params: [{ name: 'id', type: 'string', required: true }]
  },
  {
    action: 'container.mode.set',
    label: 'Set container mode',
    category: 'layout',
    description: 'Sets free, stack, row or grid mode on a layout container.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'mode', type: 'free|stack|row|grid', required: true }
    ]
  },
  {
    action: 'container.settings.set',
    label: 'Set container settings',
    category: 'layout',
    description: 'Updates existing typed container settings such as gap and padding.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'settings', type: 'object', required: true }
    ]
  },
  {
    action: 'container.styleSource.link',
    label: 'Link Style Source',
    category: 'layout',
    description: 'Links a layout container to an existing sibling Style Source.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'sourceId', type: 'string', required: false }
    ]
  },
  {
    action: 'container.styleSource.unlink',
    label: 'Unlink Style Source',
    category: 'layout',
    description: 'Disables a layout container Style Source relationship.',
    params: [{ name: 'id', type: 'string', required: true }]
  },
  {
    action: 'design.save',
    label: 'Save design',
    category: 'document',
    description: 'Saves the current design through the existing Designer save manager.',
    params: [
      { name: 'name', type: 'string', required: false },
      { name: 'description', type: 'string', required: false }
    ]
  },
  {
    action: 'design.publish',
    label: 'Publish design',
    category: 'document',
    description: 'Starts the existing publishing flow for an explicit slug and draft state.',
    params: [
      { name: 'slug', type: 'string', required: true },
      { name: 'draft', type: 'boolean', required: false }
    ]
  },
  {
    action: 'colorLibrary.refresh',
    label: 'Refresh color schemes',
    category: 'color',
    description: 'Refreshes numbered Default slots and reapplies the active color scheme.'
  },
  {
    action: 'colorLibrary.createScheme',
    label: 'Create color scheme',
    category: 'color',
    description: 'Creates a named scheme by copying an existing or active scheme.',
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'copyFromId', type: 'string', required: false }
    ]
  },
  {
    action: 'colorLibrary.updateScheme',
    label: 'Rename color scheme',
    category: 'color',
    description: 'Renames a color scheme while retaining its stable id.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true }
    ]
  },
  {
    action: 'colorLibrary.activateScheme',
    label: 'Activate color scheme',
    category: 'color',
    description: 'Makes a scheme the default source for linked color slots.',
    params: [{ name: 'id', type: 'string', required: true }]
  },
  {
    action: 'colorLibrary.deleteScheme',
    label: 'Delete color scheme',
    category: 'color',
    description: 'Deletes a color scheme while preserving the required final scheme.',
    params: [{ name: 'id', type: 'string', required: true }]
  },
  {
    action: 'colorLibrary.create',
    label: 'Add color Default',
    category: 'color',
    description: 'Appends a named Default slot to a color scheme.',
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'value', type: 'color', required: true },
      { name: 'schemeId', type: 'string', required: false }
    ]
  },
  {
    action: 'colorLibrary.update',
    label: 'Update saved color',
    category: 'color',
    description: 'Renames a saved color or updates its value while retaining its stable id.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'schemeId', type: 'string', required: false },
      { name: 'name', type: 'string', required: false },
      { name: 'value', type: 'color', required: false }
    ]
  },
  {
    action: 'colorLibrary.delete',
    label: 'Delete saved color',
    category: 'color',
    description: 'Removes the last Default slot; linked design values retain their serialized fallback.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'schemeId', type: 'string', required: false }
    ]
  },
  {
    action: 'fontPackages.refresh',
    label: 'Refresh font packages',
    category: 'typography',
    description: 'Refreshes reusable font packages and reapplies the active semantic typography.'
  },
  {
    action: 'fontPackages.create',
    label: 'Create font package',
    category: 'typography',
    description: 'Creates a named package by copying an existing or active font package.',
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'copyFromId', type: 'string', required: false }
    ]
  },
  {
    action: 'fontPackages.rename',
    label: 'Rename font package',
    category: 'typography',
    description: 'Renames a font package while retaining its stable id.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'name', type: 'string', required: true }
    ]
  },
  {
    action: 'fontPackages.updateRole',
    label: 'Update font package role',
    category: 'typography',
    description: 'Updates Body, H1-H6, Paragraph, Link, Button, Label, Small, Quote or Code defaults.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'role', type: 'string', required: true },
      { name: 'settings', type: 'object', required: true }
    ]
  },
  {
    action: 'fontPackages.resetRole',
    label: 'Reset font package role',
    category: 'typography',
    description: 'Resets one semantic text role to the system baseline.',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'role', type: 'string', required: true }
    ]
  },
  {
    action: 'fontPackages.activate',
    label: 'Activate font package',
    category: 'typography',
    description: 'Makes a font package the default for text without a direct font override.',
    params: [{ name: 'id', type: 'string', required: true }]
  },
  {
    action: 'fontPackages.delete',
    label: 'Delete font package',
    category: 'typography',
    description: 'Deletes a font package; at least one package must remain.',
    params: [{ name: 'id', type: 'string', required: true }]
  },
  {
    action: 'sitePresets.refresh',
    label: 'Refresh Site Presets',
    category: 'preset',
    description: 'Refreshes installed and user Site Presets.'
  },
  {
    action: 'sitePresets.apply',
    label: 'Apply Site Preset',
    category: 'preset',
    description: 'Applies one declarative preset to the central color and font defaults.',
    params: [{ name: 'id', type: 'string', required: true }]
  },
  {
    action: 'sitePresets.create',
    label: 'Create Site Preset',
    category: 'preset',
    description: 'Captures current Builder settings, active defaults and the current page demo.',
    params: [
      { name: 'name', type: 'string', required: true },
      { name: 'version', type: 'string', required: false },
      { name: 'developer', type: 'string', required: false }
    ]
  },
  {
    action: 'sitePresets.delete',
    label: 'Delete user Site Preset',
    category: 'preset',
    description: 'Deletes a user-created Site Preset. Installed presets stay read-only.',
    params: [{ name: 'id', type: 'string', required: true }]
  }
]);

let lastVisualSnapshot: Record<string, unknown> | null = null;
let lastVisualSnapshotAt = 0;

function cssEscape(value: string): string {
  return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

function textOf(el: Element | null, fallback = ''): string {
  return String(el?.textContent || fallback).replace(/\s+/g, ' ').trim();
}

function datasetOf(el: HTMLElement | null, keys: string[]): Record<string, string> {
  const data: Record<string, string> = {};
  if (!el) return data;
  for (const key of keys) {
    const value = el.dataset[key];
    if (value) data[key] = value;
  }
  return data;
}

// Keep Studio behavior agent-readable here so controllers do not scrape UI copy.
function clampPercent(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string'
    ? Number.parseFloat(value.replace('%', '').trim())
    : Number(value);
  const number = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function rangeOf(el: HTMLElement | null): Record<string, number> {
  const start = clampPercent(el?.dataset.scrollStart, DEFAULT_BEHAVIOR_RANGE.start);
  let end = clampPercent(el?.dataset.scrollEnd, DEFAULT_BEHAVIOR_RANGE.end);
  if (end < start) return { start: end, end: start };
  if (end === start) end = Math.min(100, start + 1);
  return { start, end };
}

function parseEffectList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object') as Record<string, unknown>[];
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(item => item && typeof item === 'object') as Record<string, unknown>[]
      : [];
  } catch {
    return [];
  }
}

function effectsOf(el: HTMLElement | null): Record<string, unknown>[] {
  return parseEffectList(el?.dataset.effects)
    .filter(effect => effect.enabled !== false)
    .map(effect => {
      const id = String(effect.id || '').trim();
      const range = {
        start: clampPercent(effect.start, DEFAULT_BEHAVIOR_RANGE.start),
        end: clampPercent(effect.end, DEFAULT_BEHAVIOR_RANGE.end)
      };
      return {
        id,
        label: EFFECT_LABELS[id] || id || 'Effect',
        enabled: true,
        ...range
      };
    })
    .filter(effect => effect.id);
}

function behaviorOf(el: HTMLElement | null): string {
  const behavior = String(el?.dataset.behavior || 'scroll').trim().toLowerCase();
  return ['scroll', 'sticky', 'pinned'].includes(behavior) ? behavior : 'scroll';
}

function elementBounds(el: HTMLElement): Record<string, number> {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(rect.x || rect.left || 0),
    y: Math.round(rect.y || rect.top || 0),
    width: Math.round(rect.width || 0),
    height: Math.round(rect.height || 0),
    xPercent: clampPercent(el.dataset.xPercent, 0),
    yPercent: clampPercent(el.dataset.yPercent, 0),
    wPercent: clampPercent(el.dataset.wPercent, 0),
    hPercent: clampPercent(el.dataset.hPercent, 0)
  };
}

function feedbackNodeId(el: HTMLElement, fallback: string): string {
  return el.dataset.nodeId || el.dataset.instanceId || el.id || fallback;
}

function styleSourceState(el: HTMLElement): Record<string, unknown> | null {
  const enabled = el.dataset.styleSourceEnabled;
  const role = el.dataset.styleSourceRole;
  const sourceId = el.dataset.styleSourceId;
  const syncLayout = el.dataset.styleSyncLayout;
  const syncDesign = el.dataset.styleSyncDesign;
  if (!enabled && !role && !sourceId && !syncLayout && !syncDesign) return null;
  return {
    enabled: enabled !== 'false',
    role: role || (sourceId ? 'follower' : null),
    sourceId: sourceId || null,
    syncLayout: syncLayout !== 'false',
    syncDesign: syncDesign !== 'false'
  };
}

function uniqueHtmlElements(elements: HTMLElement[]): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  return elements.filter(el => {
    if (seen.has(el)) return false;
    seen.add(el);
    return true;
  });
}

function layoutElements(): HTMLElement[] {
  const root = document.getElementById('layoutRoot') as HTMLElement | null;
  return uniqueHtmlElements([
    ...(root ? [root] : []),
    ...Array.from(document.querySelectorAll<HTMLElement>('.layout-root, .layout-container'))
  ]);
}

function layoutParentId(el: HTMLElement): string | null {
  let parent = el.parentElement;
  while (parent) {
    if (parent.matches('.layout-root, .layout-container')) {
      return feedbackNodeId(parent, 'layout-parent');
    }
    parent = parent.parentElement;
  }
  return null;
}

function layoutNodeRole(el: HTMLElement): string {
  if (el.id === 'layoutRoot' || el.classList.contains('layout-root')) return 'layout-root';
  if (el.dataset.workarea === 'true') return 'workarea';
  return 'layout-container';
}

function layoutNodeFeedback(el: HTMLElement, index: number): Record<string, unknown> {
  const id = feedbackNodeId(el, `layout-node-${index + 1}`);
  const directChildren = Array.from(el.children).filter(child => child.matches?.('.layout-container, .layout-root')).length;
  return {
    id,
    role: layoutNodeRole(el),
    parentId: layoutParentId(el),
    label: el.dataset.label || el.dataset.nodeId || el.dataset.designRef || id,
    selected: el.classList.contains('layout-container--active') || el.classList.contains('tree-selected'),
    workarea: el.dataset.workarea === 'true',
    containsWorkspace: Boolean(el.querySelector(':scope > #workspaceMain, :scope > .builder-grid')),
    childContainerCount: directChildren,
    mode: el.dataset.layoutMode || 'free',
    settings: {
      gap: el.dataset.layoutGap || null,
      padding: el.dataset.layoutPadding || null,
      background: el.dataset.layoutBackground || el.dataset.sceneBackground || null,
      designRef: el.dataset.designRef || null
    },
    styleSource: styleSourceState(el),
    bounds: elementBounds(el)
  };
}

function responsivePlacementFeedback(el: HTMLElement): Record<string, unknown> {
  const viewport = getBuilderViewportState();
  const x = Number.parseFloat(el.dataset.x || '0') || 0;
  const y = Number.parseFloat(el.dataset.y || '0') || 0;
  const width = Number.parseFloat(el.getAttribute('gs-w') || '1') || 1;
  const height = Number.parseFloat(el.getAttribute('gs-h') || '1') || 1;
  let raw: unknown = {};
  try {
    raw = JSON.parse(el.dataset.responsivePlacement || '{}');
  } catch {
    return {
      available: false,
      error: 'DESIGNER_AGENT_FEEDBACK_RESPONSIVE_PLACEMENT_INVALID'
    };
  }
  const contract = normalizeResponsivePlacementContract(raw, {
    centerXPercent: ((x + (width / 2)) / Math.max(1, viewport.width)) * 100,
    yPx: y,
    widthPx: width,
    heightPx: height
  });
  const activeRule = responsiveRuleForWidth(contract, viewport.width);
  const geometry = resolveResponsivePlacementGeometry(contract, viewport.width);
  return {
    available: true,
    version: contract.version,
    viewportWidth: viewport.width,
    activeRuleId: activeRule?.id || null,
    activeRange: activeRule
      ? { minWidth: activeRule.minWidth, maxWidth: activeRule.maxWidth }
      : null,
    geometry,
    base: contract.base,
    rules: contract.rules.map(rule => ({
      id: rule.id,
      minWidth: rule.minWidth,
      maxWidth: rule.maxWidth,
      geometry: rule.geometry
    })),
    fitsViewport: geometry.widthPx <= viewport.width
  };
}

function widgetPlacementFeedback(): Record<string, unknown>[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.canvas-item')).map((el, index) => {
    const workarea = el.closest<HTMLElement>('.layout-container, .layout-root');
    return {
      id: feedbackNodeId(el, `widget-placement-${index + 1}`),
      role: 'widget-placement',
      widgetId: el.dataset.widgetId || null,
      label: textOf(el.querySelector('.canvas-item-content'), el.dataset.elementName || el.dataset.widgetId || `Widget ${index + 1}`),
      sceneId: el.dataset.sceneId || null,
      sceneTitle: el.dataset.sceneTitle || null,
      workareaId: el.dataset.workareaId || workarea?.dataset.nodeId || null,
      selected: el.classList.contains('selected'),
      global: el.dataset.global === 'true',
      layer: el.dataset.layer || null,
      zIndex: Number.parseInt(el.style.zIndex || el.dataset.layerOrder || '0', 10) || 0,
      grid: {
        x: Number.parseFloat(el.dataset.x || '0') || 0,
        y: Number.parseFloat(el.dataset.y || '0') || 0,
        w: Number.parseFloat(el.getAttribute('gs-w') || '1') || 1,
        h: Number.parseFloat(el.getAttribute('gs-h') || '1') || 1
      },
      behavior: behaviorOf(el),
      range: rangeOf(el),
      effects: effectsOf(el),
      responsivePlacement: responsivePlacementFeedback(el),
      styleSource: styleSourceState(el),
      bounds: elementBounds(el)
    };
  });
}

function styleSourceEntry(node: Record<string, unknown>): Record<string, unknown> | null {
  const styleSource = node.styleSource as Record<string, unknown> | null;
  if (!styleSource) return null;
  return {
    objectId: node.id || null,
    objectRole: node.role || null,
    enabled: styleSource.enabled !== false,
    role: styleSource.role || null,
    sourceId: styleSource.sourceId || null,
    syncLayout: styleSource.syncLayout !== false,
    syncDesign: styleSource.syncDesign !== false
  };
}

function styleSourceRelationships(
  layoutNodes: Record<string, unknown>[],
  widgetPlacements: Record<string, unknown>[]
): Record<string, unknown> {
  const entries = [...layoutNodes, ...widgetPlacements]
    .map(styleSourceEntry)
    .filter(Boolean) as Record<string, unknown>[];
  const sources = entries.filter(entry => entry.enabled !== false && entry.role === 'source');
  const followers = entries.filter(entry => entry.enabled !== false && Boolean(entry.sourceId));
  const disabled = entries.filter(entry => entry.enabled === false);
  return {
    sourceCount: sources.length,
    followerCount: followers.length,
    disabledCount: disabled.length,
    sources,
    followers,
    disabled
  };
}

function visualFeedbackState(visual: Record<string, unknown>): Record<string, unknown> {
  return {
    available: Boolean(visual.available),
    kind: visual.kind || null,
    source: visual.source || null,
    capturedAt: visual.capturedAt || null,
    reused: Boolean(visual.reused),
    reason: visual.reason || visual.reuseReason || null,
    width: visual.width || null,
    height: visual.height || null,
    previewBytes: Number(visual.previewDataUrl ? String(visual.previewDataUrl).length : visual.previewBytes || 0)
  };
}

function snapGuideFeedback(): Record<string, unknown> {
  const grid = document.getElementById('workspaceMain') ||
    document.querySelector<HTMLElement>('.builder-grid, .canvas-grid');
  const guideElements = Array.from(document.querySelectorAll<HTMLElement>('.canvas-snap-guide'));
  return {
    enabled: grid instanceof HTMLElement ? grid.dataset.objectSnapGuides === 'true' : false,
    liveMagnet: grid instanceof HTMLElement ? grid.dataset.objectSnapLiveMagnet === 'true' : false,
    active: guideElements.length > 0,
    activeCount: guideElements.length,
    tolerance: grid instanceof HTMLElement ? Number(grid.dataset.objectSnapTolerance || 0) || null : null,
    guides: guideElements.map((guide, index) => ({
      id: `snap-guide-${index + 1}`,
      role: 'snap-guide',
      kind: guide.dataset.snapGuide || 'object',
      guideKind: guide.dataset.snapGuideKind || null,
      axis: guide.dataset.snapGuideAxis || null,
      sourceId: guide.dataset.snapGuideSource || null,
      secondarySourceId: guide.dataset.snapGuideSecondarySource || null,
      sourceKind: guide.dataset.snapGuideSourceKind || null,
      targetKind: guide.dataset.snapGuideTargetKind || null,
      spacing: Number(guide.dataset.snapGuideSpacing || 0) || null,
      bounds: elementBounds(guide)
    }))
  };
}

function publishingFeedbackState(): Record<string, unknown> {
  const panel = document.getElementById('publishPanel') as HTMLElement | null;
  const trigger = document.getElementById('publishLayoutBtn') as HTMLElement | null;
  const usageItems = Array.from(panel?.querySelectorAll<HTMLElement>('.publish-usage-item') || []);
  return {
    available: Boolean(panel),
    open: Boolean(panel && !panel.classList.contains('hidden') && panel.getAttribute('aria-hidden') !== 'true'),
    triggerVisible: Boolean(trigger && trigger.offsetParent !== null),
    triggerLabel: trigger?.getAttribute('aria-label') || textOf(trigger, 'Publish'),
    title: textOf(panel?.querySelector('.publish-title') ?? null, 'Publishing'),
    activeSlug: (panel?.querySelector<HTMLInputElement>('.publish-slug-input')?.value || '').trim() || null,
    usageStatus: textOf(panel?.querySelector('.publish-usage-status') ?? null),
    usageCount: usageItems.length,
    pageUsageCount: usageItems.filter(item => item.dataset.usageKind === 'Page').length,
    bundlePublished: usageItems.some(item => item.dataset.usageKind === 'Bundle'),
    usages: usageItems.map((item, index) => ({
      id: `publication-usage-${index + 1}`,
      kind: item.dataset.usageKind || null,
      label: textOf(item.querySelector('strong'), textOf(item)),
      detail: textOf(item.querySelector('small')),
      href: item instanceof HTMLAnchorElement ? item.getAttribute('href') : null
    }))
  };
}

function designerFeedbackWarnings(
  visual: Record<string, unknown>,
  layoutNodes: Record<string, unknown>[],
  widgets: Record<string, unknown>[]
): Record<string, unknown>[] {
  const warnings: Record<string, unknown>[] = [];
  const hasLayoutRoot = Boolean(document.getElementById('layoutRoot'));
  const hasCommandPort = Boolean(window.blogposterDesignerCommands && typeof window.blogposterDesignerCommands.execute === 'function');
  const zeroSizeWidgets = widgets.filter(widget => {
    const bounds = widget.bounds as Record<string, number> | undefined;
    return bounds && (!bounds.width || !bounds.height);
  });
  const invalidResponsivePlacements = widgets.filter(widget => {
    const responsivePlacement = widget.responsivePlacement as Record<string, unknown> | undefined;
    return responsivePlacement?.error === 'DESIGNER_AGENT_FEEDBACK_RESPONSIVE_PLACEMENT_INVALID';
  });
  if (!hasLayoutRoot || layoutNodes.length === 0) {
    warnings.push({
      code: 'DESIGNER_AGENT_FEEDBACK_NO_LAYOUT_ROOT',
      severity: 'warning',
      message: 'Design Studio feedback could not find #layoutRoot or layout containers.'
    });
  }
  if (!hasCommandPort) {
    warnings.push({
      code: 'DESIGNER_AGENT_FEEDBACK_NO_COMMAND_PORT',
      severity: 'warning',
      message: 'window.blogposterDesignerCommands.execute is missing, so write commands can only use fallback DOM actions.'
    });
  }
  if (zeroSizeWidgets.length > 0) {
    warnings.push({
      code: 'DESIGNER_AGENT_FEEDBACK_ZERO_WIDGET_BOUNDS',
      severity: 'warning',
      message: 'One or more widget placements reported zero-size bounds.',
      count: zeroSizeWidgets.length
    });
  }
  if (invalidResponsivePlacements.length > 0) {
    warnings.push({
      code: 'DESIGNER_AGENT_FEEDBACK_RESPONSIVE_PLACEMENT_INVALID',
      severity: 'warning',
      message: 'One or more widget responsive-placement contracts could not be parsed.',
      count: invalidResponsivePlacements.length
    });
  }
  if (!visual.available) {
    warnings.push({
      code: 'DESIGNER_AGENT_FEEDBACK_VISUAL_PREVIEW_UNAVAILABLE',
      severity: 'info',
      message: 'Structured feedback is available, but the optional visual preview could not be captured.'
    });
  }
  return warnings;
}

function feedbackStatus(warnings: Record<string, unknown>[]): string {
  if (warnings.some(warning => warning.severity === 'error')) return 'blocked';
  if (warnings.some(warning => warning.severity === 'warning')) return 'degraded';
  return 'ready';
}

function buildDesignerAgentFeedback(
  context: BuildSnapshotContext,
  visual: Record<string, unknown>,
  activeSceneId: string,
  activeSceneTitle: string
): Record<string, unknown> {
  const layoutNodes = layoutElements().map(layoutNodeFeedback);
  const widgetPlacements = widgetPlacementFeedback();
  const warnings = designerFeedbackWarnings(visual, layoutNodes, widgetPlacements);
  const status = feedbackStatus(warnings);
  const builderViewport = getBuilderViewportState();
  return {
    version: 1,
    channel: 'design-studio.agent-feedback',
    source: 'ui/designer/app/agentSurface.ts',
    guide: 'docs/design-studio-agent-feedback.md',
    status,
    reason: context.reason,
    generatedAt: new Date().toISOString(),
    contracts: {
      transport: 'AgentManager/AppLoader agentSurface',
      structuredSnapshot: true,
      commandPort: !warnings.some(warning => warning.code === 'DESIGNER_AGENT_FEEDBACK_NO_COMMAND_PORT'),
      visualPreview: Boolean(visual.available),
      runtimeLivePreview: true,
      stableBounds: true,
      responsivePlacementRanges: true,
      objectSnapGuides: true,
      publishingCenter: true
    },
    viewport: {
      width: builderViewport.width,
      presetId: builderViewport.presetId,
      zoom: builderViewport.zoom,
      zoomMode: builderViewport.zoomMode,
      browserWidth: window.innerWidth,
      browserHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    },
    document: {
      designId: document.body.dataset.designId || null,
      designVersion: document.body.dataset.designVersion || null,
      activeSceneId,
      activeSceneTitle,
      mode: document.body.classList.contains('builder-mode') ? 'builder' : 'unknown',
      route: window.location.pathname
    },
    layoutTree: {
      rootId: layoutNodes[0]?.id || null,
      nodeCount: layoutNodes.length,
      workareaCount: layoutNodes.filter(node => node.workarea === true).length,
      nodes: layoutNodes
    },
    widgetPlacements,
    styleSources: styleSourceRelationships(layoutNodes, widgetPlacements),
    selection: selectionState(),
    snapGuides: snapGuideFeedback(),
    livePreview: livePreviewFeedbackState(),
    publishing: publishingFeedbackState(),
    visual: visualFeedbackState(visual),
    warnings
  };
}

function hasStageHudForElement(el: HTMLElement): boolean {
  const instanceId = el.dataset.instanceId || el.id || '';
  if (!instanceId) return false;
  return Array.from(document.querySelectorAll<HTMLElement>('.widget-action-bar > .scene-stage-hud'))
    .some(hud => hud.dataset.instanceId === instanceId);
}

function behaviorElementNode(el: HTMLElement, index: number, activeSceneId = ''): Record<string, unknown> {
  const effects = effectsOf(el);
  const behavior = behaviorOf(el);
  const sceneId = el.dataset.sceneId || '';
  return {
    id: el.dataset.instanceId || el.id || `element-${index + 1}`,
    widgetId: el.dataset.widgetId || null,
    label: textOf(el.querySelector('.canvas-item-content'), el.dataset.elementName || el.dataset.widgetId || `Element ${index + 1}`),
    sceneId,
    sceneTitle: el.dataset.sceneTitle || null,
    selected: el.classList.contains('selected'),
    visibleInActiveScene: !sceneId || !activeSceneId || sceneId === activeSceneId,
    behavior,
    behaviorState: el.dataset.behaviorState || null,
    range: rangeOf(el),
    effects,
    effectCount: effects.length,
    bounds: elementBounds(el),
    cues: {
      badge: Boolean(el.querySelector(':scope > .scene-behavior-badge')),
      range: Boolean(el.querySelector(':scope > .scene-behavior-range-cue')),
      effectGuide: Boolean(el.querySelector(':scope > .scene-stage-effect-guide')),
      stageHud: hasStageHudForElement(el)
    }
  };
}

function stageBehaviorMap(activeSceneId = ''): Record<string, unknown> {
  const elements = Array.from(document.querySelectorAll<HTMLElement>('.canvas-item'))
    .map((el, index) => behaviorElementNode(el, index, activeSceneId));
  const behaviorElements = elements.filter(element => (
    element.behavior !== 'scroll' || Number(element.effectCount || 0) > 0
  ));
  const behaviorCounts = elements.reduce<Record<string, number>>((counts, element) => {
    const key = String(element.behavior || 'scroll');
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  return {
    activeSceneId,
    elementCount: elements.length,
    behaviorElementCount: behaviorElements.length,
    effectElementCount: elements.filter(element => Number(element.effectCount || 0) > 0).length,
    selectedElementId: elements.find(element => element.selected)?.id || null,
    behaviorCounts,
    activeSceneElementIds: elements
      .filter(element => element.visibleInActiveScene)
      .map(element => element.id),
    elements
  };
}

function clickFirst(selector: string): boolean {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target || target.hasAttribute('disabled')) return false;
  target.click();
  return true;
}

function sectionNodes(): Record<string, unknown>[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.scene-section-item')).map((section, index) => {
    const sceneId = section.dataset.sceneId || `section-${index + 1}`;
    const sceneElements = Array.from(document.querySelectorAll<HTMLElement>(`.canvas-item[data-scene-id="${cssEscape(sceneId)}"]`));
    const behaviorCount = sceneElements.filter(el => behaviorOf(el) !== 'scroll' || effectsOf(el).length > 0).length;
    return {
      id: sceneId,
      role: 'section',
      label: textOf(section.querySelector('.scene-section-title'), `Scene ${index + 1}`),
      active: section.classList.contains('active'),
      meta: {
        number: textOf(section.querySelector('.scene-section-number'), String(index + 1)),
        detail: textOf(section.querySelector('.scene-section-meta')),
        elementCount: sceneElements.length,
        behaviorCount,
        ...datasetOf(section, ['sceneId'])
      }
    };
  });
}

function layerNodes(): Record<string, unknown>[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.scene-layer-item')).map((layer, index) => {
    const id = layer.dataset.instanceId || layer.dataset.widgetId || `layer-${index + 1}`;
    const canvasItem = document.querySelector<HTMLElement>(`.canvas-item[data-instance-id="${cssEscape(id)}"], .canvas-item[data-widget-id="${cssEscape(id)}"]`);
    const effects = effectsOf(canvasItem);
    return {
      id,
      role: 'layer',
      label: textOf(layer.querySelector('.scene-layer-title'), textOf(layer, `Layer ${index + 1}`)),
      active: layer.classList.contains('scene-layer-item--active'),
      meta: {
        ...datasetOf(layer, ['widgetInstanceId', 'widgetId', 'behavior', 'sceneId', 'layer', 'zIndex']),
        range: canvasItem ? rangeOf(canvasItem) : null,
        effects,
        effectCount: effects.length,
        behaviorState: canvasItem?.dataset.behaviorState || null
      }
    };
  });
}

function selectedCanvasItem(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.canvas-item.selected');
}

function selectionState(): Record<string, unknown> | null {
  const selected = selectedCanvasItem();
  if (!selected) return null;
  const effects = effectsOf(selected);
  return {
    id: selected.dataset.instanceId || selected.id || null,
    widgetId: selected.dataset.widgetId || null,
    sceneId: selected.dataset.sceneId || null,
    sceneTitle: selected.dataset.sceneTitle || null,
    behavior: selected.dataset.behavior || 'scroll',
    scrollStart: selected.dataset.scrollStart || null,
    scrollEnd: selected.dataset.scrollEnd || null,
    range: rangeOf(selected),
    effects,
    effectCount: effects.length,
    responsivePlacement: responsivePlacementFeedback(selected),
    bounds: elementBounds(selected),
    label: textOf(selected.querySelector('.canvas-item-content'), selected.dataset.widgetId || 'Selected element')
  };
}

function availableControls(): Record<string, unknown>[] {
  const controls: Record<string, unknown>[] = [];
  document.querySelectorAll<HTMLElement>('[data-builder-viewport-preset]').forEach(button => {
    controls.push({
      id: `viewport.${button.dataset.builderViewportPreset}`,
      role: 'viewport-preset-command',
      label: button.getAttribute('aria-label') || textOf(button),
      active: button.getAttribute('aria-pressed') === 'true'
    });
  });
  document.querySelectorAll<HTMLElement>('[data-stage-scene-action]').forEach(button => {
    controls.push({
      id: `scene.${button.dataset.stageSceneAction}`,
      role: 'scene-command',
      label: button.getAttribute('aria-label') || textOf(button),
      disabled: button.hasAttribute('disabled')
    });
  });
  document.querySelectorAll<HTMLElement>('[data-scene-storyboard-item]').forEach((item, index) => {
    const sceneId = item.dataset.sceneId || `scene-${index + 1}`;
    controls.push({
      id: `scene.${sceneId}.select`,
      role: 'scene-storyboard-command',
      label: textOf(item.querySelector('.scene-section-title'), `Scene ${index + 1}`),
      active: item.classList.contains('active'),
      meta: {
        ...datasetOf(item, ['sceneId']),
        number: textOf(item.querySelector('.scene-section-number'), String(index + 1))
      }
    });
  });
  document.querySelectorAll<HTMLElement>('[data-scene-storyboard-item] [data-section-action]').forEach((button, index) => {
    const item = button.closest<HTMLElement>('[data-scene-storyboard-item]');
    controls.push({
      id: `scene.${item?.dataset.sceneId || index}.${button.dataset.sectionAction}`,
      role: 'scene-storyboard-command',
      label: button.getAttribute('aria-label') || textOf(button, button.dataset.sectionAction || ''),
      disabled: button.hasAttribute('disabled'),
      meta: {
        ...datasetOf(button, ['sectionAction']),
        scene: item ? datasetOf(item, ['sceneId']) : {}
      }
    });
  });
  document.querySelectorAll<HTMLElement>('[data-insert-group]').forEach(button => {
    controls.push({
      id: `insert.${button.dataset.insertGroup}`,
      role: 'insert-group',
      label: button.getAttribute('aria-label') || textOf(button, button.dataset.insertGroup || ''),
      active: button.classList.contains('active') || button.getAttribute('aria-expanded') === 'true'
    });
  });
  document.querySelectorAll<HTMLElement>('[data-designer-tool]').forEach(button => {
    controls.push({
      id: `tool.${button.dataset.designerTool}`,
      role: 'designer-tool',
      label: button.getAttribute('aria-label') || textOf(button, button.dataset.designerTool || ''),
      active: button.classList.contains('active') || button.getAttribute('aria-pressed') === 'true'
    });
  });
  document.querySelectorAll<HTMLElement>('[data-stage-behavior]').forEach(button => {
    controls.push({
      id: `behavior.${button.dataset.stageBehavior}`,
      role: 'behavior-command',
      label: button.getAttribute('aria-label') || textOf(button, button.dataset.stageBehavior || ''),
      active: button.classList.contains('active')
    });
  });
  const publishButton = document.getElementById('publishLayoutBtn') as HTMLElement | null;
  if (publishButton) {
    controls.push({
      id: 'publishing.open',
      role: 'publication-center-command',
      label: publishButton.getAttribute('aria-label') || textOf(publishButton, 'Publish'),
      disabled: publishButton.hasAttribute('disabled')
    });
  }
  document.querySelectorAll<HTMLElement>('[data-layer-action]').forEach((button, index) => {
    const layer = button.closest<HTMLElement>('.scene-layer-item');
    controls.push({
      id: `layer.${layer?.dataset.widgetInstanceId || index}.${button.dataset.layerAction}`,
      role: 'layer-order-command',
      label: button.getAttribute('aria-label') || textOf(button, button.dataset.layerAction || ''),
      disabled: button.hasAttribute('disabled'),
      meta: {
        ...datasetOf(button, ['layerAction']),
        layer: layer ? datasetOf(layer, ['widgetInstanceId', 'widgetId', 'sceneId', 'layer', 'zIndex']) : {}
      }
    });
  });
  return controls;
}

async function captureStageVisual(reason: string): Promise<Record<string, unknown>> {
  const gridEl = document.getElementById('workspaceMain') as HTMLElement | null;
  if (!gridEl) {
    return { available: false, reason: 'missing-stage' };
  }

  const shouldCapture = reason === 'start' || reason === 'manual' || reason === 'command' || reason === 'refresh' || !lastVisualSnapshot;
  const now = Date.now();
  if (!shouldCapture && lastVisualSnapshot) {
    return { ...lastVisualSnapshot, reused: true, reuseReason: reason };
  }
  if (lastVisualSnapshot && now - lastVisualSnapshotAt < VISUAL_CAPTURE_MIN_INTERVAL_MS && reason !== 'command' && reason !== 'refresh') {
    return { ...lastVisualSnapshot, reused: true, reuseReason: 'rate-limit' };
  }

  const previewDataUrl = await capturePreview(gridEl, { structuralFallback: true });
  if (!previewDataUrl) {
    return {
      available: false,
      reason: 'capture-empty',
      activeSceneId: document.body.dataset.activeScene || ''
    };
  }

  lastVisualSnapshot = {
    available: true,
    kind: 'stage-preview',
    source: previewDataUrl.startsWith('data:image/svg+xml')
      ? 'designer.structuralPreview'
      : 'designer.capturePreview',
    capturedAt: new Date().toISOString(),
    previewDataUrl,
    width: Math.round(gridEl.getBoundingClientRect().width || gridEl.clientWidth || 0),
    height: Math.round(gridEl.getBoundingClientRect().height || gridEl.clientHeight || 0),
    activeSceneId: document.body.dataset.activeScene || '',
    activeSceneTitle: document.body.dataset.activeSceneTitle || ''
  };
  lastVisualSnapshotAt = now;
  return lastVisualSnapshot;
}

export async function buildDesignerAgentSnapshot(
  context: BuildSnapshotContext = { reason: 'manual' }
): Promise<AgentSurfaceSnapshotPayload> {
  const sections = sectionNodes();
  const layers = layerNodes();
  const activeSceneId = document.body.dataset.activeScene || '';
  const activeSceneTitle = document.body.dataset.activeSceneTitle || '';
  const behaviorMap = stageBehaviorMap(activeSceneId);
  const visual = await captureStageVisual(context.reason);
  const feedback = buildDesignerAgentFeedback(context, visual, activeSceneId, activeSceneTitle);
  const feedbackWarnings = Array.isArray(feedback.warnings) ? feedback.warnings.length : 0;
  const feedbackLayoutTree = feedback.layoutTree as Record<string, unknown>;
  const feedbackWidgetPlacements = Array.isArray(feedback.widgetPlacements) ? feedback.widgetPlacements : [];
  const colorLibrary = colorLibraryAgentState();
  const fontPackages = fontPackagesAgentState();
  const sitePresets = sitePresetsAgentState();
  const builderViewport = getBuilderViewportState();
  return {
    appName: APP_NAME,
    surfaceId: SURFACE_ID,
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    route: window.location.pathname,
    url: window.location.href,
    summary: {
      activeScene: activeSceneTitle || activeSceneId,
      sectionCount: sections.length,
      layerCount: layers.length,
      behaviorElementCount: behaviorMap.behaviorElementCount,
      effectElementCount: behaviorMap.effectElementCount,
      hasSelection: Boolean(selectedCanvasItem()),
      savedColorCount: Number(colorLibrary.colorCount || 0),
      fontPackageCount: Number(fontPackages.packageCount || 0),
      activeFontPackage: fontPackages.activePackageName || null,
      sitePresetCount: Number(sitePresets.presetCount || 0),
      lastAppliedSitePreset: sitePresets.lastAppliedId || null,
      feedbackStatus: feedback.status,
      feedbackWarningCount: feedbackWarnings
    },
    state: {
      activeSceneId,
      activeSceneTitle,
      designId: document.body.dataset.designId || null,
      designVersion: document.body.dataset.designVersion || null,
      mode: document.body.classList.contains('builder-mode') ? 'builder' : 'unknown',
      behaviorMap,
      colorLibrary,
      fontPackages,
      sitePresets,
      feedback
    },
    selection: selectionState(),
    tree: [
      {
        id: 'sections',
        role: 'section-list',
        label: 'Scenes',
        children: sections
      },
      {
        id: 'layers',
        role: 'layer-list',
        label: 'Layers',
        children: layers
      }
    ],
    controls: availableControls(),
    actions: DESIGNER_AGENT_ACTIONS,
    visual,
    feedback,
    meta: {
      agentFeedback: {
        channel: 'design-studio.agent-feedback',
        version: 1,
        status: feedback.status,
        warningCount: feedbackWarnings,
        guide: 'docs/design-studio-agent-feedback.md'
      },
      colorLibrary: {
        contract: 'numbered-color-schemes',
        linkedValueFormat: 'var(--bp-color-default-<slot>, <fallback>)',
        directColorOverride: 'supported; literal values override the active Default slot locally'
      },
      fontPackages: {
        contract: 'numbered-semantic-font-packages',
        roles: 'body,h1,h2,h3,h4,h5,h6,paragraph,link,button,label,small,blockquote,code',
        directFontOverride: 'supported; empty font-family means active package default'
      },
      sitePresets: {
        contract: 'declarative-site-presets-v1',
        sources: 'installed,user',
        runtimeDependency: 'none'
      }
    },
    metrics: {
      viewportWidth: builderViewport.width,
      viewportPreset: builderViewport.presetId,
      viewportZoom: builderViewport.zoom,
      viewportZoomMode: builderViewport.zoomMode,
      browserViewportWidth: window.innerWidth,
      browserViewportHeight: window.innerHeight,
      visualPreviewAvailable: Boolean(visual.available),
      visualPreviewBytes: Number(visual.previewDataUrl ? String(visual.previewDataUrl).length : visual.previewBytes || 0),
      feedbackWarningCount: feedbackWarnings,
      layoutNodeCount: Number(feedbackLayoutTree.nodeCount || 0),
      widgetPlacementCount: feedbackWidgetPlacements.length
    }
  };
}

function commandAction(command: AgentSurfaceCommand): string {
  return String(command.action || command.type || '').trim();
}

function commandParam(command: AgentSurfaceCommand, key: string): unknown {
  const params = command.params && typeof command.params === 'object' ? command.params : {};
  return params[key];
}

function handleSceneCommand(action: string, command: AgentSurfaceCommand): Record<string, unknown> {
  if (action === 'scene.next') {
    return { handled: clickFirst('[data-stage-scene-action="next"]') };
  }
  if (action === 'scene.prev' || action === 'scene.previous') {
    return { handled: clickFirst('[data-stage-scene-action="prev"]') };
  }
  if (action === 'scene.add') {
    return { handled: clickFirst('[data-stage-scene-action="add"]') };
  }
  if (action === 'scene.select') {
    const rawSceneId = String(commandParam(command, 'sceneId') || command.target || '').trim();
    if (!rawSceneId) return { handled: false, reason: 'missing-scene-id' };
    return { handled: clickFirst(`.scene-section-item[data-scene-id="${cssEscape(rawSceneId)}"]`) };
  }
  return { handled: false };
}

function handleInsertCommand(command: AgentSurfaceCommand): Record<string, unknown> {
  const rawType = String(commandParam(command, 'type') || command.value || command.target || '').trim();
  const type = rawType === 'image' ? 'media' : rawType;
  if (!type) return { handled: false, reason: 'missing-insert-type' };
  const direct = clickFirst(`[data-empty-insert="${cssEscape(type)}"]`);
  if (direct) return { handled: true, via: 'empty-state' };
  const preset = clickFirst(`[data-insert-preset="${cssEscape(type)}"]`);
  if (preset) return { handled: true, via: 'insert-preset' };
  const nativeElement = clickFirst(`[data-native-element="${cssEscape(type)}"]`);
  if (nativeElement) return { handled: true, via: 'native-element' };
  const group = clickFirst(`[data-insert-group="${cssEscape(type)}"]`);
  if (group) return { handled: true, via: 'insert-group' };
  const designerTool = clickFirst(`[data-designer-tool="${cssEscape(type)}"]`);
  if (designerTool) return { handled: true, via: 'sidebar-tool' };
  return { handled: false, reason: 'insert-target-not-found', type };
}

function handleElementCommand(action: string, command: AgentSurfaceCommand): Record<string, unknown> {
  if (action === 'element.select') {
    const rawId = String(commandParam(command, 'id') || command.target || '').trim();
    if (!rawId) return { handled: false, reason: 'missing-element-id' };
    const selector = [
      `.canvas-item[data-instance-id="${cssEscape(rawId)}"]`,
      `.canvas-item#${cssEscape(rawId)}`,
      `.canvas-item[data-widget-id="${cssEscape(rawId)}"]`
    ].join(',');
    return { handled: clickFirst(selector) };
  }
  if (action === 'behavior.set') {
    const behavior = String(commandParam(command, 'behavior') || command.value || command.target || '').trim();
    if (!behavior) return { handled: false, reason: 'missing-behavior' };
    return { handled: clickFirst(`[data-stage-behavior="${cssEscape(behavior)}"]`) };
  }
  return { handled: false };
}

async function handleColorLibraryCommand(
  action: string,
  command: AgentSurfaceCommand
): Promise<Record<string, unknown>> {
  if (action === 'colorLibrary.refresh') {
    return { handled: true, library: await refreshColorLibrary() };
  }
  if (action === 'colorLibrary.createScheme') {
    const name = String(commandParam(command, 'name') || '').trim();
    const copyFromId = String(commandParam(command, 'copyFromId') || '').trim();
    if (!name) return { handled: false, reason: 'missing-color-scheme-name' };
    return {
      handled: true,
      scheme: await createColorScheme({
        name,
        ...(copyFromId ? { copyFromId } : {})
      })
    };
  }
  const schemeId = String(commandParam(command, 'id') || command.target || '').trim();
  if (action === 'colorLibrary.updateScheme') {
    const name = String(commandParam(command, 'name') || '').trim();
    if (!schemeId || !name) return { handled: false, reason: 'missing-color-scheme-id-or-name' };
    return { handled: true, scheme: await renameColorScheme(schemeId, name) };
  }
  if (action === 'colorLibrary.activateScheme') {
    if (!schemeId) return { handled: false, reason: 'missing-color-scheme-id' };
    return { handled: true, scheme: await activateColorScheme(schemeId) };
  }
  if (action === 'colorLibrary.deleteScheme') {
    if (!schemeId) return { handled: false, reason: 'missing-color-scheme-id' };
    return { handled: true, result: await deleteColorScheme(schemeId) };
  }
  if (action === 'colorLibrary.create') {
    const name = String(commandParam(command, 'name') || '').trim();
    const value = String(commandParam(command, 'value') || command.value || '').trim();
    const schemeId = String(commandParam(command, 'schemeId') || '').trim();
    if (!name || !value) return { handled: false, reason: 'missing-color-name-or-value' };
    return {
      handled: true,
      color: await createLibraryColor({ name, value, ...(schemeId ? { schemeId } : {}) })
    };
  }
  if (action === 'colorLibrary.update') {
    const id = String(commandParam(command, 'id') || command.target || '').trim();
    if (!id) return { handled: false, reason: 'missing-color-id' };
    const nameValue = commandParam(command, 'name');
    const colorValue = commandParam(command, 'value');
    const schemeId = String(commandParam(command, 'schemeId') || '').trim();
    const update: { id: string; name?: string; value?: string; schemeId?: string } = { id };
    if (typeof nameValue === 'string') update.name = nameValue;
    if (typeof colorValue === 'string') update.value = colorValue;
    if (schemeId) update.schemeId = schemeId;
    return { handled: true, color: await updateLibraryColor(update) };
  }
  if (action === 'colorLibrary.delete') {
    const id = String(commandParam(command, 'id') || command.target || '').trim();
    if (!id) return { handled: false, reason: 'missing-color-id' };
    const schemeId = String(commandParam(command, 'schemeId') || '').trim();
    return { handled: true, result: await deleteLibraryColor(id, schemeId || undefined) };
  }
  return { handled: false, reason: 'unsupported-color-library-command', action };
}

async function handleFontPackagesCommand(
  action: string,
  command: AgentSurfaceCommand
): Promise<Record<string, unknown>> {
  const id = String(commandParam(command, 'id') || command.target || '').trim();
  if (action === 'fontPackages.refresh') {
    return { handled: true, library: await refreshFontPackages() };
  }
  if (action === 'fontPackages.create') {
    const name = String(commandParam(command, 'name') || '').trim();
    const copyFromId = String(commandParam(command, 'copyFromId') || '').trim();
    if (!name) return { handled: false, reason: 'missing-font-package-name' };
    return {
      handled: true,
      package: await createFontPackage({
        name,
        ...(copyFromId ? { copyFromId } : {})
      })
    };
  }
  if (!id) return { handled: false, reason: 'missing-font-package-id' };
  if (action === 'fontPackages.rename') {
    const name = String(commandParam(command, 'name') || '').trim();
    if (!name) return { handled: false, reason: 'missing-font-package-name' };
    return { handled: true, package: await renameFontPackage(id, name) };
  }
  if (action === 'fontPackages.updateRole') {
    const role = String(commandParam(command, 'role') || '').trim() as FontPackageRole;
    const settingsValue = commandParam(command, 'settings');
    const settings = settingsValue && typeof settingsValue === 'object' && !Array.isArray(settingsValue)
      ? settingsValue as Partial<FontRoleStyles>
      : null;
    if (!role || !settings) {
      return { handled: false, reason: 'missing-font-package-role-or-settings' };
    }
    return {
      handled: true,
      package: await updateFontPackageRole({ id, role, settings })
    };
  }
  if (action === 'fontPackages.resetRole') {
    const role = String(commandParam(command, 'role') || '').trim() as FontPackageRole;
    if (!role) return { handled: false, reason: 'missing-font-package-role' };
    return { handled: true, package: await resetFontPackageRole(id, role) };
  }
  if (action === 'fontPackages.activate') {
    return { handled: true, package: await activateFontPackage(id) };
  }
  if (action === 'fontPackages.delete') {
    return { handled: true, result: await deleteFontPackage(id) };
  }
  return { handled: false, reason: 'unsupported-font-packages-command', action };
}

async function handleSitePresetsCommand(
  action: string,
  command: AgentSurfaceCommand
): Promise<Record<string, unknown>> {
  if (action === 'sitePresets.refresh') {
    return { handled: true, library: await refreshSitePresets() };
  }
  const id = String(commandParam(command, 'id') || command.target || '').trim();
  if (!id) return { handled: false, reason: 'missing-site-preset-id' };
  if (action === 'sitePresets.apply') {
    const result = await applySitePreset(id);
    await Promise.all([refreshColorLibrary(), refreshFontPackages()]);
    return { handled: true, result };
  }
  if (action === 'sitePresets.delete') {
    return { handled: true, preset: await deleteSitePreset(id) };
  }
  return { handled: false, reason: 'unsupported-site-presets-command', action };
}

export async function handleDesignerAgentCommand(command: AgentSurfaceCommand): Promise<Record<string, unknown>> {
  const commandPort = window.blogposterDesignerCommands;
  if (commandPort && typeof commandPort.execute === 'function') {
    const result = await commandPort.execute(command);
    if (result && result.handled !== false) return result;
  }
  const action = commandAction(command);
  if (action === 'feedback.refresh') return { handled: true, feedback: 'refresh-requested' };
  if (action.startsWith('colorLibrary.')) return handleColorLibraryCommand(action, command);
  if (action.startsWith('fontPackages.')) return handleFontPackagesCommand(action, command);
  if (action.startsWith('sitePresets.')) return handleSitePresetsCommand(action, command);
  if (action.startsWith('scene.')) return handleSceneCommand(action, command);
  if (action === 'insert' || action === 'insert.element') return handleInsertCommand(command);
  if (action.startsWith('element.') || action.startsWith('behavior.')) return handleElementCommand(action, command);
  return { handled: false, reason: 'unsupported-command', action };
}

export function startDesignerAgentSurface(): AgentSurfaceClient | null {
  if (typeof window === 'undefined') return null;
  const root = document.getElementById('builderRow') || document.body;
  const client = createAgentSurfaceClient({
    appName: APP_NAME,
    surfaceId: SURFACE_ID,
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    root,
    snapshotIntervalMs: 3000,
    pollIntervalMs: 1400,
    buildSnapshot: buildDesignerAgentSnapshot,
    handleCommand: handleDesignerAgentCommand
  });
  const control = createAgentControlClient({
    appName: APP_NAME,
    surfaceId: SURFACE_ID,
    surfaceType: 'studio-builder',
    title: 'Design Studio'
  });
  client.start();
  window.blogposterAgent = {
    ...(window.blogposterAgent || {}),
    designer: client,
    designerControl: control
  };
  return client;
}
