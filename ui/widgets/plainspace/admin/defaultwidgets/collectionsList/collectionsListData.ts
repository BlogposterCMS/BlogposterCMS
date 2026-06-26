export interface PageRecord {
  id?: string | number;
  _id?: string | number;
  title?: string;
  slug?: string;
  status?: string;
  lane?: string;
  parent_id?: string | number | null;
  design_id?: string | number | null;
  meta?: Record<string, unknown> | string | null;
  [key: string]: unknown;
}

export interface CollectionView {
  page: PageRecord;
  id: string;
  title: string;
  slug: string;
  status: string;
  childCount: number;
  children: CollectionChildView[];
  indicator: string;
  editUrl: string;
  publicUrl: string;
}

export interface CollectionChildView {
  page: PageRecord;
  id: string;
  title: string;
  slug: string;
  status: string;
  editUrl: string;
  publicUrl: string;
}

interface PageListPayload {
  data?: unknown[];
}

type CollectionsEmitter = Window['meltdownEmit'];

const PAGES_MODULE = {
  moduleName: 'pagesManager',
  moduleType: 'core'
} as const;

function requireEmitter(emit: CollectionsEmitter): NonNullable<CollectionsEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_COLLECTIONS_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function normalizePageId(id: unknown): string | null {
  if (id === null || id === undefined || id === '') return null;
  return String(id);
}

export function normalizeSlug(slug: unknown): string {
  return String(slug || '').replace(/^\/+/, '').replace(/\/+$/, '');
}

export function readPageMeta(page: PageRecord): Record<string, unknown> {
  if (!page.meta) return {};
  if (typeof page.meta === 'string') {
    try {
      const parsed = JSON.parse(page.meta);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof page.meta === 'object' && !Array.isArray(page.meta) ? page.meta : {};
}

export function toPages(value: unknown): PageRecord[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is PageRecord => Boolean(item) && typeof item === 'object');
  }
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as PageListPayload).data)
  ) {
    return ((value as PageListPayload).data || []).filter((item): item is PageRecord => (
      Boolean(item) && typeof item === 'object'
    ));
  }
  return [];
}

export function buildCollectionsPayload(jwt: string | null | undefined): Record<string, unknown> {
  return {
    jwt,
    ...PAGES_MODULE,
    lane: 'public'
  };
}

function isVisiblePublicPage(page: PageRecord): boolean {
  return (page.lane || 'public') === 'public' && page.status !== 'deleted';
}

export function getCollectionIndicator(page: PageRecord): string {
  const meta = readPageMeta(page);
  const designId = meta.designId || page.design_id;
  if (typeof designId === 'string' || typeof designId === 'number') {
    return `Design: ${designId}`;
  }
  if (typeof meta.layoutTemplate === 'string' && meta.layoutTemplate.trim()) {
    return `Template: ${meta.layoutTemplate.trim()}`;
  }
  if (typeof meta.template === 'string' && meta.template.trim()) {
    return `Template: ${meta.template.trim()}`;
  }
  if (meta.layout && typeof meta.layout === 'object') {
    return 'Layout: configured';
  }
  return 'Default';
}

function toChildView(page: PageRecord): CollectionChildView {
  const id = normalizePageId(page.id ?? page._id) || '';
  const slug = normalizeSlug(page.slug);
  return {
    page,
    id,
    title: String(page.title || 'Untitled page'),
    slug,
    status: String(page.status || 'draft'),
    editUrl: `/admin/pages/edit/${encodeURIComponent(id)}`,
    publicUrl: `/${slug}`
  };
}

export function deriveCollections(pages: PageRecord[]): CollectionView[] {
  const publicPages = pages.filter(isVisiblePublicPage);
  const childrenByParent = new Map<string, PageRecord[]>();

  publicPages.forEach(page => {
    const parentId = normalizePageId(page.parent_id);
    if (!parentId) return;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), page]);
  });

  return publicPages
    .filter(page => {
      const id = normalizePageId(page.id ?? page._id);
      if (!id) return false;
      const meta = readPageMeta(page);
      return Boolean(childrenByParent.get(id)?.length || meta.isCollection === true);
    })
    .map(page => {
      const id = normalizePageId(page.id ?? page._id) || '';
      const slug = normalizeSlug(page.slug);
      const children = (childrenByParent.get(id) || [])
        .map(toChildView)
        .sort((a, b) => a.title.localeCompare(b.title));
      return {
        page,
        id,
        title: String(page.title || 'Untitled collection'),
        slug,
        status: String(page.status || 'draft'),
        childCount: children.length,
        children,
        indicator: getCollectionIndicator(page),
        editUrl: `/admin/pages/edit/${encodeURIComponent(id)}`,
        publicUrl: `/${slug}`
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function fetchCollections(
  emit: CollectionsEmitter,
  jwt: string | null | undefined
): Promise<CollectionView[]> {
  const meltdownEmit = requireEmitter(emit);
  const response = await meltdownEmit('getPagesByLane', buildCollectionsPayload(jwt));
  return deriveCollections(toPages(response));
}
