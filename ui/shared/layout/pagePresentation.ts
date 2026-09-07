/** Derived page presentation only; Pages metadata remains the persistence owner. */
export interface PresentationPage {
  id?: string | number;
  parent_id?: string | number | null;
  parentId?: string | number | null;
  title?: string;
  slug?: string;
  lane?: string;
  status?: string;
  deleted_at?: unknown;
  deletedAt?: unknown;
  designId?: unknown;
  design_id?: unknown;
  meta?: unknown;
}

export interface PagePresentation {
  sourcePage: PresentationPage;
  inherited: boolean;
  depth: number;
  designId?: string;
  layoutRef?: string;
  layoutTemplate?: string;
  source?: 'site' | 'page' | 'ancestor';
  /** Outer-to-inner composition; page HTML belongs to the innermost content slot. */
  contentDesignId?: string;
  contentLayoutRef?: string;
}

export const MAX_PAGE_LAYOUT_DEPTH = 16;
export const SITE_MAIN_DESIGN_SETTING = 'SITE_MAIN_DESIGN_ID';

export function mainDesignId(value: unknown): string {
  const id = scalar(value);
  if (id && !/^[A-Za-z0-9_.:-]+$/.test(id)) throw new Error('PAGE_MAIN_DESIGN_INVALID: Choose a saved design.');
  return id;
}

export function presentationMeta(page: PresentationPage): Record<string, unknown> {
  let value = page.meta;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function scalar(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

export function inheritsPageLayout(page: PresentationPage): boolean {
  const meta = presentationMeta(page);
  return ![meta.inheritParentDesign, meta.inheritPresentation, meta.inheritDesign]
    .some(value => value === false || ['0', 'false', 'no', 'off'].includes(String(value).toLowerCase().trim()));
}

export function ownPagePresentation(page: PresentationPage, depth = 0): PagePresentation | null {
  const meta = presentationMeta(page);
  const explicit = scalar(meta.design_layout ?? meta.designLayout);
  const validRef = /^layout:([A-Za-z0-9_.:-]+)(?:@[^/\s]+)?$/.exec(explicit);
  const id = scalar(page.designId ?? page.design_id ?? meta.designId ?? meta.design_id);
  const designId = validRef?.[1] || (/^[A-Za-z0-9_.:-]+$/.test(id) ? id : '');
  const source = { sourcePage: page, inherited: depth > 0, depth };
  if (designId) return { ...source, designId, layoutRef: validRef ? explicit : `layout:${designId}@v1` };
  const layoutTemplate = scalar(meta.layoutTemplate ?? meta.layout_template);
  return layoutTemplate ? { ...source, layoutTemplate } : null;
}

/** Async ancestry traversal works with the existing public or admin page reader. */
export async function resolvePagePresentation(
  page: PresentationPage,
  loadParent: (id: string) => Promise<PresentationPage | null>,
  options: { maxDepth?: number; publicOnly?: boolean; mainDesignId?: string } = {}
): Promise<PagePresentation | null> {
  const mode = pageLayoutMode(page);
  if (mode !== 'inherit') return directPresentation(page, mode, options.mainDesignId);
  let current: PresentationPage | null = page;
  const seen = new Set<string>();
  const maxDepth = Math.min(MAX_PAGE_LAYOUT_DEPTH, options.maxDepth ?? MAX_PAGE_LAYOUT_DEPTH);
  for (let depth = 0; current && depth <= maxDepth; depth += 1) {
    const id = scalar(current.id);
    if (id && seen.has(id)) throw new Error('PAGE_LAYOUT_CYCLE: The page hierarchy contains a cycle.');
    if (id) seen.add(id);
    if (depth && ((current.lane || 'public') !== (page.lane || 'public')
      || current.status === 'deleted' || current.deleted_at || current.deletedAt
      || (options.publicOnly && current.status !== 'published'))) return null;
    const own = ownPagePresentation(current, depth);
    if (own) return own;
    if (!inheritsPageLayout(current)) return null;
    const parentId = scalar(current.parent_id ?? current.parentId);
    if (!parentId) return directPresentation(page, 'main', options.mainDesignId);
    if (depth === maxDepth) throw new Error('PAGE_LAYOUT_DEPTH: The page hierarchy exceeds the supported depth.');
    current = await loadParent(parentId);
  }
  return null;
}

/** Synchronous counterpart for the already-loaded Page Manager list. */
export function pagePresentationFromList(page: PresentationPage, pages: PresentationPage[], siteDesignId?: string): PagePresentation | null {
  const mode = pageLayoutMode(page);
  if (mode !== 'inherit') return directPresentation(page, mode, siteDesignId);
  const byId = new Map(pages.map(entry => [scalar(entry.id), entry]));
  const seen = new Set<string>();
  let current: PresentationPage | undefined = page;
  for (let depth = 0; current && depth <= MAX_PAGE_LAYOUT_DEPTH; depth += 1) {
    const id = scalar(current.id);
    if (seen.has(id)) return null;
    seen.add(id);
    if (depth && ((current.lane || 'public') !== (page.lane || 'public')
      || current.status === 'deleted' || current.deleted_at || current.deletedAt)) return null;
    const own = ownPagePresentation(current, depth);
    if (own) return own;
    if (!inheritsPageLayout(current)) return null;
    const parentId = scalar(current.parent_id ?? current.parentId);
    if (!parentId) return directPresentation(page, 'main', siteDesignId);
    current = byId.get(parentId);
  }
  return null;
}

export type PageLayoutMode = 'main' | 'composed' | 'design' | 'inherit' | 'none';

/** Validate the explicit composition contract at the Pages write boundary. */
export function validatePageDesignMode(page: PresentationPage): void {
  const meta = presentationMeta(page);
  if (meta.pageDesignMode === undefined) return;
  const mode = String(meta.pageDesignMode);
  if (!['main', 'composed', 'design', 'inherit', 'none'].includes(mode)) throw new Error('PAGE_LAYOUT_MODE_INVALID: Choose an available page design mode.');
  if (['composed', 'design'].includes(mode) && !ownPagePresentation(page)?.designId) {
    throw new Error('PAGE_LAYOUT_DESIGN_REQUIRED: Choose a saved page design.');
  }
}

function directPresentation(page: PresentationPage, mode: PageLayoutMode, siteDesignId?: string): PagePresentation | null {
  const own = ownPagePresentation(page);
  if (mode === 'none') return null;
  if (mode === 'design') return own;
  const id = mainDesignId(siteDesignId);
  if (!id || (page.lane && page.lane !== 'public')) return mode === 'composed' ? own : null;
  return {
    sourcePage: page, source: 'site', inherited: true, depth: 0,
    designId: id, layoutRef: `layout:${id}@v1`,
    ...(mode === 'composed' && own?.designId && own.designId !== id ? {
      contentDesignId: own.designId, contentLayoutRef: own.layoutRef
    } : {})
  };
}

export function pageLayoutMode(page: PresentationPage): PageLayoutMode {
  const meta = presentationMeta(page);
  if (['main', 'composed', 'design', 'inherit', 'none'].includes(String(meta.pageDesignMode))) return meta.pageDesignMode as PageLayoutMode;
  if (ownPagePresentation(page)) return 'design';
  if (!inheritsPageLayout(page)) return 'none';
  // Keep explicitly saved legacy inheritance readable; new pages use the site default.
  return meta.inheritParentDesign === true ? 'inherit' : 'main';
}

/** A layout change must never erase the separately authored page body. */
export function pageLayoutMeta(page: PresentationPage, mode: PageLayoutMode, designId?: string, title?: string): Record<string, unknown> {
  if (!['main', 'composed', 'inherit', 'design', 'none'].includes(mode)) throw new Error('PAGE_LAYOUT_MODE_INVALID: Choose an available layout mode.');
  if ((mode === 'design' || mode === 'composed') && !/^[A-Za-z0-9_.:-]+$/.test(designId || '')) {
    throw new Error('PAGE_LAYOUT_DESIGN_REQUIRED: Choose a saved design.');
  }
  const meta = { ...presentationMeta(page) };
  for (const key of ['designId', 'design_id', 'designTitle', 'designThumbnail', 'design_layout', 'designLayout',
    'layoutTemplate', 'layout_template', 'inheritPresentation', 'inheritDesign']) delete meta[key];
  meta.pageDesignMode = mode;
  meta.inheritParentDesign = mode === 'inherit';
  if (mode === 'design' || mode === 'composed') {
    meta.designId = designId;
    if (title) meta.designTitle = title;
  }
  return meta;
}
