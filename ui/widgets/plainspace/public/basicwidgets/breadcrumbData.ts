import { runtimePublicPayload, unwrapRuntimeFacadeData } from '../../../../shared/api-client/runtimeFacade.js';
import { normalizeLinkUrl, type NavigationItem, type PublicWidgetContext } from './publicWidgetHelpers.js';

type Page = { id?: string | number; parent_id?: string | number; parentId?: string | number; title?: string; slug?: string; status?: string; lane?: string };

/** Follow actual page relationships; URL segments need not match the CMS parent tree. */
export async function loadBreadcrumbPages(path: string, ctx: PublicWidgetContext): Promise<NavigationItem[] | null> {
  const emit = ctx.emit || (window.PUBLIC_TOKEN ? window.meltdownEmit : undefined);
  if (!emit) return null; // Studio without a public context keeps the explicit path preview.
  const get = async (action: string, params: Record<string, unknown>): Promise<Page | null> => {
    const response = unwrapRuntimeFacadeData<any>(await emit('cmsPublicRuntimeRequest',
      runtimePublicPayload(window.PUBLIC_TOKEN, 'pages', action, { ...params, lane: 'public' })));
    const page: Page = response?.page || response;
    // Never substitute the Studio/admin principal or show unpublished ancestors.
    return page?.id != null && page.status === 'published' && (!page.lane || page.lane === 'public') ? page : null;
  };
  let page = await get(path === '/' ? 'start' : 'getBySlug', { slug: path.replace(/^\/+|\/+$/gu, '') });
  const trail: NavigationItem[] = [];
  const visited = new Set<string>();
  while (page) {
    const id = String(page.id);
    if (visited.has(id) || visited.size >= 16) throw new Error('BP_WIDGET_BREADCRUMB_HIERARCHY_CYCLE');
    visited.add(id);
    const href = normalizeLinkUrl(`/${String(page.slug || '').replace(/^\//u, '')}`);
    if (page.title && href) trail.unshift({ id, label: page.title, href, children: [] });
    const parentId = page.parent_id ?? page.parentId;
    page = parentId ? await get('get', { pageId: parentId }) : null;
  }
  return trail;
}
