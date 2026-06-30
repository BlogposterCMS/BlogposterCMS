import { emitRuntimeAdmin, runtimeAdminPayload } from '../../../../shared/api-client/runtimeFacade.js';

export interface PageRecord {
  id?: string | number;
  title?: string;
  trans_title?: string;
  meta_desc?: string;
  slug?: string;
  status?: string;
  seo_image?: string;
  seo_title?: string;
  seo_keywords?: string;
  parent_id?: string | number | null;
  is_content?: boolean;
  lane?: string;
  language?: string;
  html?: string;
  css?: string;
  meta?: Record<string, unknown> & {
    publish_at?: string;
    layoutTemplate?: string;
  };
}

export interface TemplateRecord {
  name?: string;
  isGlobal?: boolean;
}

export interface PageEditorFormValues {
  title: string;
  seoDesc: string;
  status: string;
  slug: string;
  publishAt: string;
  layoutName: string;
  seoImage: string;
}

interface PageDataLoaderLike {
  clear?: (eventName?: string, payload?: Record<string, unknown>) => void;
}

type PageEditorEmitter = Window['meltdownEmit'];

// Keep page-manager and layout-template event payloads outside the DOM widget.
function requireEmitter(emit: PageEditorEmitter): NonNullable<PageEditorEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_PAGE_EDITOR_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function toPage(value: unknown): PageRecord | null {
  return value && typeof value === 'object' ? value as PageRecord : null;
}

export function toTemplates(value: unknown): TemplateRecord[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { templates?: unknown }).templates)
      ? (value as { templates: unknown[] }).templates
      : [];

  return items
    .map(item => typeof item === 'string' ? { name: item } : item)
    .filter((item): item is TemplateRecord => Boolean(item) && typeof item === 'object');
}

export function visibleTemplates(value: unknown): TemplateRecord[] {
  const templates = toTemplates(value).filter(template => !template.isGlobal);
  return templates.length ? templates : [{ name: 'default' }];
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function asString(value: unknown): string {
  return value == null ? '' : String(value);
}

export function buildPageUpdatePayload(
  jwt: string | null | undefined,
  page: PageRecord,
  values: PageEditorFormValues
): Record<string, unknown> {
  const title = values.title.trim();
  const seoDesc = values.seoDesc || '';
  const status = values.status || page.status;
  const slug = values.slug.trim() || page.slug;
  const publishAt = values.publishAt || '';
  const layoutName = values.layoutName || '';
  const seoImage = values.seoImage.trim() || '';

  return runtimeAdminPayload(jwt, 'pages', 'update', {
    pageId: page.id,
    slug,
    status,
    seo_image: seoImage,
    parent_id: page.parent_id,
    is_content: page.is_content,
    lane: page.lane,
    language: page.language,
    title,
    translations: [{
      language: page.language,
      title,
      html: page.html || '',
      css: page.css || '',
      metaDesc: seoDesc,
      seoTitle: page.seo_title || '',
      seoKeywords: page.seo_keywords || ''
    }],
    meta: {
      ...(page.meta || {}),
      publish_at: publishAt,
      layoutTemplate: layoutName
    }
  });
}

export function clearPageEditorCache(
  pageDataLoader: PageDataLoaderLike | undefined,
  page: PageRecord
): void {
  pageDataLoader?.clear?.('cmsAdminApiRequest', {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource: 'pages',
    action: 'get',
    params: { pageId: page.id }
  });
}

export async function fetchPageEditorTemplates(
  emit: PageEditorEmitter,
  jwt: string | null | undefined,
  lane: string | undefined
): Promise<TemplateRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'plainSpace', 'layoutTemplateNames', { lane });
  return visibleTemplates(res);
}

export async function savePageEditorPage(
  emit: PageEditorEmitter,
  jwt: string | null | undefined,
  page: PageRecord,
  values: PageEditorFormValues
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('cmsAdminApiRequest', buildPageUpdatePayload(jwt, page, values));
}
