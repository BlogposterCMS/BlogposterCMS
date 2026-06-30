export type PageDataPayload = Record<string, unknown>;
export type PageData = Record<string, unknown>;
export type PageDataResult = PageData | null;

export interface LoadOptions {
  fields?: readonly string[];
}

export const DEFAULT_PAGE_DATA_FIELDS = [
  'id',
  'slug',
  'status',
  'title',
  'seo_image',
  'translations',
  'trans_title',
  'trans_lang',
  'html',
  'css',
  'meta_desc',
  'seo_title',
  'seo_keywords',
  'meta',
  'language',
  'lane',
  'parent_id',
  'parentSlug',
  'is_content'
] as const;

export function unwrapMeltdownResult(result: unknown): unknown {
  if (result && typeof result === 'object' && 'data' in result) {
    const data = (result as { data?: unknown }).data;
    return data ?? result;
  }
  return result ?? null;
}

export function sanitizePageData(data: unknown, fields?: readonly string[]): PageDataResult {
  if (!fields) return data && typeof data === 'object' ? data as PageData : null;
  if (!data || typeof data !== 'object') return null;
  const out: PageData = {};
  const record = data as PageData;
  for (const field of fields) {
    if (Object.hasOwn(record, field)) out[field] = record[field];
  }
  return out;
}

export function pageDataCacheKey(eventName: string, payload: PageDataPayload = {}): string {
  return `${eventName}:${JSON.stringify(payload)}`;
}

export function buildInitialPageDataRequest(pageId: string | number): {
  eventName: string;
  payload: PageDataPayload;
  fields: readonly string[];
} {
  return {
    eventName: 'cmsAdminApiRequest',
    payload: {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'get',
      params: { pageId }
    },
    fields: DEFAULT_PAGE_DATA_FIELDS
  };
}
