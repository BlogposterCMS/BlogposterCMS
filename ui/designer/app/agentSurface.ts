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
    action: 'scene.next',
    label: 'Next section',
    category: 'scene',
    description: 'Selects the next section on the stage.'
  },
  {
    action: 'scene.prev',
    label: 'Previous section',
    category: 'scene',
    description: 'Selects the previous section on the stage.'
  },
  {
    action: 'scene.add',
    label: 'Add section',
    category: 'scene',
    description: 'Creates a new section and makes it active.'
  },
  {
    action: 'scene.select',
    label: 'Select section',
    category: 'scene',
    description: 'Selects a section by id.',
    params: [{ name: 'sceneId', type: 'string', required: true }]
  },
  {
    action: 'scene.update',
    label: 'Update section',
    category: 'scene',
    description: 'Renames a section or changes its background.',
    params: [
      { name: 'sceneId', type: 'string', required: false },
      { name: 'title', type: 'string', required: false },
      { name: 'background', type: 'color', required: false }
    ]
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
      stageHud: Boolean(el.querySelector(':scope > .scene-stage-hud'))
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
      label: textOf(section.querySelector('.scene-section-title'), `Section ${index + 1}`),
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
        ...datasetOf(layer, ['widgetId', 'behavior', 'sceneId']),
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
    bounds: elementBounds(selected),
    label: textOf(selected.querySelector('.canvas-item-content'), selected.dataset.widgetId || 'Selected element')
  };
}

function availableControls(): Record<string, unknown>[] {
  const controls: Record<string, unknown>[] = [];
  document.querySelectorAll<HTMLElement>('[data-stage-scene-action]').forEach(button => {
    controls.push({
      id: `scene.${button.dataset.stageSceneAction}`,
      role: 'scene-command',
      label: button.getAttribute('aria-label') || textOf(button),
      disabled: button.hasAttribute('disabled')
    });
  });
  document.querySelectorAll<HTMLElement>('[data-tool]').forEach(button => {
    controls.push({
      id: `tool.${button.dataset.tool}`,
      role: 'insert-tool',
      label: button.getAttribute('aria-label') || textOf(button, button.dataset.tool || '')
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

  const previewDataUrl = await capturePreview(gridEl);
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
    source: 'designer.capturePreview',
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
      hasSelection: Boolean(selectedCanvasItem())
    },
    state: {
      activeSceneId,
      activeSceneTitle,
      designId: document.body.dataset.designId || null,
      designVersion: document.body.dataset.designVersion || null,
      mode: document.body.classList.contains('builder-mode') ? 'builder' : 'unknown',
      behaviorMap
    },
    selection: selectionState(),
    tree: [
      {
        id: 'sections',
        role: 'section-list',
        label: 'Sections',
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
    metrics: {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      visualPreviewAvailable: Boolean(visual.available),
      visualPreviewBytes: Number(visual.previewDataUrl ? String(visual.previewDataUrl).length : visual.previewBytes || 0)
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
  return { handled: clickFirst(`[data-tool="${cssEscape(type)}"]`), via: 'topbar-tool' };
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

export async function handleDesignerAgentCommand(command: AgentSurfaceCommand): Promise<Record<string, unknown>> {
  const commandPort = window.blogposterDesignerCommands;
  if (commandPort && typeof commandPort.execute === 'function') {
    const result = await commandPort.execute(command);
    if (result && result.handled !== false) return result;
  }
  const action = commandAction(command);
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
