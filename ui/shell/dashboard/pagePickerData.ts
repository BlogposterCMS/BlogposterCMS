export type PageRecord = {
  pageId: number | string;
  title?: string;
  slug?: string;
};

import { emitRuntimeAdmin } from '../../shared/api-client/runtimeFacade.js';

type PagePickerEmitter = Window['meltdownEmit'];

interface PageListResult {
  pages?: unknown[];
}

interface PageLookupResult {
  data?: {
    slug?: unknown;
  };
}

function requireEmitter(emit: PagePickerEmitter): NonNullable<PagePickerEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('SHELL_PAGE_PICKER_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

function isPageRecord(value: unknown): value is PageRecord {
  return Boolean(value) &&
    typeof value === 'object' &&
    (typeof (value as PageRecord).pageId === 'string' || typeof (value as PageRecord).pageId === 'number');
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toPages(value: unknown): PageRecord[] {
  const rawPages = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as PageListResult).pages || [])
      : [];
  return rawPages.filter(isPageRecord);
}

export function slugFromPageLookup(value: unknown): string | null {
  const data = value && typeof value === 'object'
    ? (value as PageLookupResult).data
    : undefined;
  return typeof data?.slug === 'string' && data.slug ? data.slug : null;
}

export async function fetchPublicPages(
  emit: PagePickerEmitter,
  jwt: string | null | undefined
): Promise<PageRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'byLane', {
    lane: 'public'
  });
  return toPages(res);
}

export async function savePageOrder(
  emit: PagePickerEmitter,
  jwt: string | null | undefined,
  pageId: number | string,
  newOrder: number
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'update', {
    pageId,
    newOrder
  });
}

export async function createPublicPageForPicker(
  emit: PagePickerEmitter,
  jwt: string | null | undefined,
  title: string,
  slug: string
): Promise<string | number> {
  const meltdownEmit = requireEmitter(emit);
  const result = await emitRuntimeAdmin<{ pageId?: string | number }>(meltdownEmit, jwt, 'pages', 'create', {
    title,
    slug,
    lane: 'public',
    status: 'published'
  });
  const pageId = result && typeof result === 'object'
    ? (result as { pageId?: string | number }).pageId
    : undefined;
  if (pageId === undefined) {
    throw new Error('SHELL_PAGE_PICKER_PAGE_ID_UNAVAILABLE: Page creation did not return a pageId');
  }
  return pageId;
}

export async function fetchPageSlugById(
  emit: PagePickerEmitter,
  jwt: string | null | undefined,
  pageId: string | number
): Promise<string> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'get', {
    pageId
  });
  const slug = slugFromPageLookup(res);
  if (!slug) {
    throw new Error('SHELL_PAGE_PICKER_CREATED_SLUG_UNAVAILABLE: Created page slug could not be resolved');
  }
  return slug;
}
