import { emitRuntimeAdmin, runtimeAdminPayload } from '../api-client/runtimeFacade.js';

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

export interface PageEditorFormValues {
  title: string;
  seoDesc: string;
  status: string;
  slug: string;
  publishAt: string;
  seoImage: string;
  seoTitle?: string;
  featuredImage?: string;
}

interface PageDataLoaderLike {
  clear?: (eventName?: string, payload?: Record<string, unknown>) => void;
  load?: (eventName: string, payload?: Record<string, unknown>) => Promise<unknown>;
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
      seoTitle: values.seoTitle?.trim() ?? page.seo_title ?? '',
      seoKeywords: page.seo_keywords || ''
    }],
    meta: {
      ...(page.meta || {}),
      // Presentation is edited by the existing Content/Designer attachment flow.
      // Saving SEO fields must not invent or overwrite a template assignment.
      publish_at: publishAt,
      featuredImage: values.featuredImage?.trim() ?? page.meta?.featuredImage ?? ''
    }
  });
}

/** SPA navigation leaves the shell's initial pageDataPromise behind. Resolve
 * the editor's explicit route id and reject an unrelated cached record. */
export async function loadPageEditorPage(
  emit: PageEditorEmitter, jwt: string | null | undefined,
  pathname: string, adminBase: string, initial: Promise<unknown> | undefined,
  loader?: PageDataLoaderLike
): Promise<PageRecord | null> {
  const prefix = `/${adminBase.replace(/^\/+|\/+$/g, '')}/pages/edit/`;
  if (!pathname.startsWith(prefix)) return toPage(await initial);
  let pageId: string;
  try { pageId = decodeURIComponent(pathname.slice(prefix.length).replace(/\/$/, '')); }
  catch { throw new Error('PAGE_EDITOR_ID_INVALID: The editor page id is invalid.'); }
  if (!/^[A-Za-z0-9_.:-]+$/.test(pageId)) throw new Error('PAGE_EDITOR_ID_INVALID: The editor page id is invalid.');
  const request = { moduleName: 'runtimeManager', moduleType: 'core', resource: 'pages', action: 'get', params: { pageId } };
  const result = loader?.load
    ? await loader.load('cmsAdminApiRequest', request)
    : await emitRuntimeAdmin(requireEmitter(emit), jwt, 'pages', 'get', { pageId });
  const page = toPage(result);
  if (!page || String(page.id) !== pageId) throw new Error('PAGE_EDITOR_PAGE_MISMATCH: The selected page could not be loaded. Reopen it from Pages.');
  return page;
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

export async function savePageEditorPage(
  emit: PageEditorEmitter,
  jwt: string | null | undefined,
  page: PageRecord,
  values: PageEditorFormValues
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('cmsAdminApiRequest', buildPageUpdatePayload(jwt, page, values));
}
