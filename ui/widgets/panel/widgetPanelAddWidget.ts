import { applyWidgetOptions } from '../options/widgetOptions.js';
import type { GridLike } from '../options/widgetPercentSizing.js';
import { renderWidget } from '../rendering/widgetRenderer.js';
import { attachDashboardControls } from './widgetControls.js';

const DEFAULT_ADMIN_ROWS = 20;

export interface WidgetDefinition {
  id: string;
  metadata?: {
    category?: string;
    label?: string;
    icon?: string;
  };
}

export interface WidgetPosition {
  x?: unknown;
  y?: unknown;
}

type DashboardGrid = GridLike & {
  addWidget: (opts: { x: number; y: number; w: number; h: number }) => HTMLElement;
  select?: (el: HTMLElement) => void;
  removeWidget: (el: HTMLElement) => void;
  _updateGridHeight?: () => void;
  emitChange?: (el: HTMLElement) => void;
};

function resolvePosition(value: unknown): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function createWidgetWrapper(grid: DashboardGrid, def: WidgetDefinition, pos: WidgetPosition): HTMLElement {
  const wrapper = grid.addWidget({
    x: resolvePosition(pos.x),
    y: resolvePosition(pos.y),
    w: 8,
    h: DEFAULT_ADMIN_ROWS
  });
  wrapper.dataset.widgetId = def.id;
  wrapper.dataset.instanceId = `w${Math.random().toString(36).slice(2, 8)}`;

  const content = document.createElement('div');
  content.className = 'canvas-item-content';
  wrapper.appendChild(content);

  return wrapper;
}

async function loadDefaultWidgetInstance(def: WidgetDefinition): Promise<Record<string, unknown> | null> {
  const emit = window.meltdownEmit;
  if (typeof emit !== 'function') {
    throw new Error('meltdownEmit unavailable');
  }

  const res = await emit('getWidgetInstance', {
    jwt: window.ADMIN_TOKEN,
    moduleName: 'plainspace',
    moduleType: 'core',
    instanceId: `default.${def.id}`
  });
  const contentRaw = res && typeof res === 'object' ? (res as { content?: unknown }).content : null;
  return typeof contentRaw === 'string'
    ? JSON.parse(contentRaw) as Record<string, unknown>
    : null;
}

export async function addDashboardWidget(
  def: WidgetDefinition,
  pos: WidgetPosition = {}
): Promise<void> {
  const grid = window.adminGrid as DashboardGrid | null | undefined;
  if (!grid || !def) return;

  const wrapper = createWidgetWrapper(grid, def, pos);
  let instance: Record<string, unknown> | null = null;
  try {
    instance = await loadDefaultWidgetInstance(def);
    applyWidgetOptions(wrapper, instance as Parameters<typeof applyWidgetOptions>[1], grid);
  } catch {
    /* keep rendering with the widget definition only */
  }

  await renderWidget(wrapper, def, null, instance as Parameters<typeof renderWidget>[3], 'Widgets');
  attachDashboardControls(wrapper, grid);
  if (document.body.classList.contains('dashboard-edit-mode')) {
    grid.select?.(wrapper);
  }
  document.dispatchEvent(new CustomEvent('ui:widget:add', { detail: { type: def.id } }));
}
