export interface TemplateName {
  name: string;
  previewPath?: string;
}

import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';

export interface PageRecord {
  title?: string;
  meta?: {
    layoutTemplate?: string;
  };
}

export interface TemplateView {
  name: string;
  previewPath: string;
  usedPages: string[];
}

type LayoutTemplatesEmitter = Window['meltdownEmit'];

function requireEmitter(emit: LayoutTemplatesEmitter): NonNullable<LayoutTemplatesEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('meltdownEmit unavailable');
  }
  return emit;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toTemplateNames(value: unknown): TemplateName[] {
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { templates?: unknown }).templates)
  ) {
    return (value as { templates: unknown[] }).templates
      .map(item => typeof item === 'string' ? { name: item } : item)
      .filter((item): item is TemplateName => (
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as TemplateName).name === 'string'
      ));
  }
  return [];
}

export function toPages(value: unknown): PageRecord[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { pages?: unknown }).pages)
      ? (value as { pages: unknown[] }).pages
      : [];
  return items.filter((item): item is PageRecord => Boolean(item) && typeof item === 'object');
}

export function buildTemplateViews(templateNames: TemplateName[], pages: PageRecord[]): TemplateView[] {
  const usedMap: Record<string, string[]> = {};
  pages.forEach(page => {
    const name = page.meta?.layoutTemplate;
    if (name) {
      usedMap[name] ??= [];
      usedMap[name].push(page.title || 'Unnamed');
    }
  });

  return templateNames.map(template => ({
    name: template.name,
    previewPath: template.previewPath || '',
    usedPages: usedMap[template.name] || []
  }));
}

export async function fetchLayoutTemplateNames(
  emit: LayoutTemplatesEmitter,
  jwt: string | null | undefined
): Promise<TemplateName[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'plainSpace', 'layoutTemplateNames', {
    lane: 'public'
  });
  return toTemplateNames(res);
}

export async function fetchPublicPages(
  emit: LayoutTemplatesEmitter,
  jwt: string | null | undefined
): Promise<PageRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'byLane', {
    lane: 'public'
  });
  return toPages(res);
}

export async function createBlankLayoutTemplate(
  emit: LayoutTemplatesEmitter,
  jwt: string | null | undefined,
  name: string,
  previewPath: string
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'plainSpace', 'saveLayoutTemplate', {
    name: name.trim(),
    lane: 'public',
    viewport: 'desktop',
    layout: [],
    previewPath
  });
}
