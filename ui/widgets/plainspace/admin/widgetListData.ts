export interface WidgetMetadata {
  label?: string;
  icon?: string;
}

import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';

export interface WidgetDefinition {
  id: string;
  metadata?: WidgetMetadata;
}

export interface WidgetTemplate {
  widgetId: string;
  label?: string;
  name?: string;
}

interface PageRecord {
  id?: string | number;
}

interface LayoutRecord {
  widgetId?: string;
  global?: boolean;
}

type WidgetListEmitter = Window['meltdownEmit'];

function requireEmitter(emit: WidgetListEmitter): NonNullable<WidgetListEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('meltdownEmit unavailable');
  }
  return emit;
}

export function toWidgets(value: unknown): WidgetDefinition[] {
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { widgets?: unknown }).widgets)
  ) {
    return (value as { widgets: unknown[] }).widgets.filter((item): item is WidgetDefinition => (
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as WidgetDefinition).id === 'string'
    ));
  }
  return [];
}

export function toPages(value: unknown): PageRecord[] {
  const items = value && typeof value === 'object' && Array.isArray((value as { pages?: unknown }).pages)
    ? (value as { pages: unknown[] }).pages
    : Array.isArray(value) ? value : [];
  return items.filter((item): item is PageRecord => Boolean(item) && typeof item === 'object');
}

export function toLayoutItems(value: unknown): LayoutRecord[] {
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { layout?: unknown }).layout)
  ) {
    return (value as { layout: unknown[] }).layout.filter((item): item is LayoutRecord => (
      Boolean(item) && typeof item === 'object'
    ));
  }
  return [];
}

export function getWidgetTemplates(storage: Pick<Storage, 'getItem'> | null = window.localStorage): WidgetTemplate[] {
  try {
    const arr = JSON.parse(storage?.getItem('widgetTemplates') || '[]') as unknown;
    return Array.isArray(arr)
      ? arr.filter((item): item is WidgetTemplate => (
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as WidgetTemplate).widgetId === 'string'
      ))
      : [];
  } catch {
    return [];
  }
}

export async function fetchWidgetRegistry(
  emit: WidgetListEmitter,
  jwt: string | null | undefined
): Promise<WidgetDefinition[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'plainSpace', 'widgetRegistry', {
    lane: 'public'
  });
  return toWidgets(res);
}

export async function fetchGlobalWidgetIds(
  emit: WidgetListEmitter,
  jwt: string | null | undefined
): Promise<Set<string>> {
  const meltdownEmit = requireEmitter(emit);
  const globalIds = new Set<string>();
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'byLane', {
    lane: 'public'
  });
  const pages = toPages(res);

  if (pages.length > 20) {
    console.warn('[widgetList] Too many pages, skipping global widget lookup');
    return globalIds;
  }

  for (const page of pages) {
    const layoutRes = await emitRuntimeAdmin(meltdownEmit, jwt, 'plainSpace', 'layoutForViewport', {
      pageId: page.id,
      lane: 'public',
      viewport: 'desktop'
    });
    toLayoutItems(layoutRes).forEach(item => {
      if (item.global && item.widgetId) globalIds.add(item.widgetId);
    });
  }

  return globalIds;
}
