import { emitRuntimeAdmin } from '../api-client/runtimeFacade.js';

export type LinkTargetResult = { target: string; code: string; message: string; warning: boolean; pageId?: string };
type PageTarget = { id?: string | number; status?: string; meta?: { publish_at?: string } };
type Lookup = (slug: string) => Promise<PageTarget | null>;

/** Only CMS-owned paths are resolved. No arbitrary URL fetching, query tokens or draft bodies in feedback. */
export function linkTargetPath(href: string, base: string): string | null {
  if (!href.trim() || href.startsWith('#')) return null;
  try {
    const url = new URL(href, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== new URL(base).origin) return null;
    const path = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '');
    if (!path || /^(?:admin|api|media|assets|build|ui|auth)(?:\/|$)/i.test(path)) return null;
    return path;
  } catch { return null; }
}

export function createLinkTargetChecker(lookup: Lookup, base: string) {
  const cache = new Map<string, { at: number; promise: Promise<LinkTargetResult> }>();
  return async (href: string): Promise<LinkTargetResult> => {
    const slug = linkTargetPath(href, base);
    if (!slug) return { target: '', code: 'LINK_TARGET_UNCHECKED', message: 'This target is outside the CMS page check.', warning: false };
    const target = `/${slug}`;
    const current = cache.get(slug);
    if (current && Date.now() - current.at < 10000) return current.promise;
    // Per-editor cache only. Bound its lifetime and size while typing many URLs.
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    const promise = (async (): Promise<LinkTargetResult> => {
      try {
        const page = await lookup(slug);
        const result = (code: string, message: string, warning = true): LinkTargetResult => ({ target, code, message, warning,
          ...(page?.id != null ? { pageId: String(page.id) } : {}) });
        if (!page?.id) return result('LINK_TARGET_MISSING', 'This page does not exist. Visitors will see a 404 page.');
        if (page.status === 'draft') return result('LINK_TARGET_DRAFT', 'This page is still a draft. Visitors cannot open it yet.');
        if (page.status === 'deleted') return result('LINK_TARGET_DELETED', 'This page was deleted. Choose another target.');
        if (page.status !== 'published') return result('LINK_TARGET_UNAVAILABLE', 'This page is not publicly available.');
        if (page.meta?.publish_at && Date.parse(page.meta.publish_at) > Date.now()) return result('LINK_TARGET_SCHEDULED', 'This page is scheduled for a later publication.');
        return result('LINK_TARGET_PUBLISHED', 'This page is published.', false);
      } catch {
        // A denied read or timeout is not evidence that the destination is gone.
        return { target, code: 'LINK_TARGET_CHECK_UNAVAILABLE', message: 'The target could not be checked. Try again later.', warning: true };
      }
    })();
    cache.set(slug, { at: Date.now(), promise });
    return promise;
  };
}

export function createEditorLinkTargetChecker(base = window.location.origin + '/') {
  return createLinkTargetChecker(async slug => {
    // Studio's isolated app bridge supplies credentials at the parent boundary.
    // Do not require a token copy inside the child document.
    if (!window.meltdownEmit) throw new Error('LINK_TARGET_CONTEXT_UNAVAILABLE');
    return emitRuntimeAdmin<PageTarget | null>(window.meltdownEmit, window.ADMIN_TOKEN, 'pages', 'getBySlug', { slug, lane: 'public' }, 5000);
  }, base);
}
