import { emitRuntimeAdmin, runtimeAdminPayload } from '../../../../shared/api-client/runtimeFacade.js';

export interface PageMeta {
  designId?: string | number;
  designTitle?: string;
  designThumbnail?: string;
  layoutTemplate?: string;
  htmlFileName?: string;
  [key: string]: unknown;
}

export interface PageRecord {
  id?: string | number;
  slug?: string;
  status?: string;
  seo_image?: string;
  parent_id?: string | number | null;
  is_content?: boolean;
  lane?: string;
  language?: string;
  title?: string;
  html?: string;
  css?: string;
  meta?: PageMeta;
}

export interface DesignRecord {
  id?: string | number;
  title?: string;
  thumbnail?: string;
  is_draft?: boolean;
}

export interface BuilderApp {
  name: string;
  title?: string;
}

export interface PageContentUpdateValues {
  html: string;
  meta: PageMeta;
}

interface PageDataLoaderLike {
  clear?: (eventName?: string, payload?: Record<string, unknown>) => void;
}

export type PageContentFetch = (
  resource: RequestInfo | URL,
  options?: RequestInit
) => Promise<Response>;

type PageContentEmitter = Window['meltdownEmit'];

export const HTML_FOLDER = 'page-content';
export const HTML_SUBPATH = `public/${HTML_FOLDER}`;
export const HTML_WEB_BASE = `/media/${HTML_FOLDER}`;

// Keep cross-module event names, media paths, and page update payloads out of the DOM widget.
function requireEmitter(emit: PageContentEmitter): NonNullable<PageContentEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_PAGE_CONTENT_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function toPage(value: unknown): PageRecord | null {
  return value && typeof value === 'object' ? value as PageRecord : null;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toDesigns(value: unknown): DesignRecord[] {
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { designs?: unknown }).designs)
  ) {
    return (value as { designs: unknown[] }).designs.filter((item): item is DesignRecord => (
      Boolean(item) && typeof item === 'object'
    ));
  }
  return [];
}

export function toFiles(value: unknown): string[] {
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { files?: unknown }).files)
  ) {
    return (value as { files: unknown[] }).files.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

export function isHtmlFileName(fileName: string): boolean {
  return /\.html?$/i.test(fileName);
}

export function toBuilderApps(value: unknown): BuilderApp[] {
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { apps?: unknown }).apps)
  ) {
    return (value as { apps: unknown[] }).apps.filter((item): item is BuilderApp => (
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as BuilderApp).name === 'string'
    ));
  }
  return [];
}

export function visibleDesigns(value: unknown): DesignRecord[] {
  return toDesigns(value).filter(template => !template.is_draft);
}

export function htmlFileUrl(name: string): string {
  return `${HTML_WEB_BASE}/${encodeURIComponent(name)}`;
}

export function buildPageContentCommonPayload(
  _jwt: string | null | undefined,
  page: PageRecord
): Record<string, unknown> {
  return {
    pageId: page.id,
    slug: page.slug,
    status: page.status,
    seo_image: page.seo_image || '',
    parent_id: page.parent_id,
    is_content: page.is_content,
    lane: page.lane,
    language: page.language,
    title: page.title
  };
}

export function buildPageContentUpdatePayload(
  jwt: string | null | undefined,
  page: PageRecord,
  values: PageContentUpdateValues
): Record<string, unknown> {
  return runtimeAdminPayload(jwt, 'pages', 'update', {
    ...buildPageContentCommonPayload(jwt, page),
    translations: [{
      language: page.language,
      title: page.title,
      html: values.html,
      css: page.css || ''
    }],
    meta: values.meta
  });
}

export function clearPageContentCache(
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

export function detachDesignMeta(page: PageRecord): PageMeta {
  const newMeta: PageMeta = { ...(page.meta || {}) };
  delete newMeta.designId;
  delete newMeta.designTitle;
  delete newMeta.designThumbnail;
  delete newMeta.layoutTemplate;
  delete newMeta.htmlFileName;
  return newMeta;
}

export function attachDesignMeta(page: PageRecord, template: DesignRecord): PageMeta {
  const newMeta: PageMeta = {
    ...(page.meta || {}),
    designId: template.id,
    designTitle: template.title,
    designThumbnail: template.thumbnail
  };
  delete newMeta.htmlFileName;
  delete newMeta.layoutTemplate;
  return newMeta;
}

export function detachHtmlMeta(page: PageRecord): PageMeta {
  const newMeta: PageMeta = { ...(page.meta || {}) };
  delete newMeta.htmlFileName;
  return newMeta;
}

export function attachHtmlMeta(page: PageRecord, htmlFileName: string): PageMeta {
  const newMeta: PageMeta = { ...(page.meta || {}), htmlFileName };
  delete newMeta.layoutTemplate;
  delete newMeta.designId;
  delete newMeta.designTitle;
  delete newMeta.designThumbnail;
  return newMeta;
}

export async function fetchBuilderApps(
  emit: PageContentEmitter,
  jwt: string | null | undefined
): Promise<BuilderApp[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'apps', 'builderList');
  return toBuilderApps(res);
}

export async function fetchPublishedDesigns(
  emit: PageContentEmitter,
  jwt: string | null | undefined
): Promise<DesignRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'designer', 'list');
  return visibleDesigns(res);
}

export async function ensureHtmlContentFolder(
  emit: PageContentEmitter,
  jwt: string | null | undefined
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  try {
    await emitRuntimeAdmin(meltdownEmit, jwt, 'media', 'createLocalFolder', {
      currentPath: 'public',
      newFolderName: HTML_FOLDER
    });
  } catch {
    // The folder is shared across pages and usually already exists.
  }
}

export async function listHtmlFiles(
  emit: PageContentEmitter,
  jwt: string | null | undefined
): Promise<string[]> {
  const meltdownEmit = requireEmitter(emit);
  await ensureHtmlContentFolder(meltdownEmit, jwt);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'media', 'listLocalFolder', { subPath: HTML_SUBPATH });
  return toFiles(res).filter(isHtmlFileName);
}

export async function fetchHtmlFile(fetchImpl: PageContentFetch, name: string): Promise<string> {
  const res = await fetchImpl(htmlFileUrl(name));
  return res.text();
}

export async function uploadHtmlFile(
  emit: PageContentEmitter,
  jwt: string | null | undefined,
  fileName: string,
  html: string
): Promise<string> {
  const meltdownEmit = requireEmitter(emit);
  await ensureHtmlContentFolder(meltdownEmit, jwt);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'media', 'uploadToFolder', {
    subPath: HTML_SUBPATH,
    fileName,
    fileData: btoa(unescape(encodeURIComponent(html))),
    mimeType: 'text/html'
  });
  return res && typeof res === 'object' && typeof (res as { fileName?: unknown }).fileName === 'string'
    ? (res as { fileName: string }).fileName
    : fileName;
}

export async function savePageContent(
  emit: PageContentEmitter,
  jwt: string | null | undefined,
  page: PageRecord,
  values: PageContentUpdateValues
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('cmsAdminApiRequest', buildPageContentUpdatePayload(jwt, page, values));
}
