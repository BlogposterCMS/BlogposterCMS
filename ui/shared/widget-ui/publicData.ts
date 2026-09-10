import { createWidgetServices } from '../../widgets/rendering/widgetServices.js';

/** Fixed public module adapters reuse the same bounded transport as community widgets.
 * No configurable origin, credentials or admin-principal fallback is accepted here. */
export function createPublicUiData(preview = false) {
  const services = createWidgetServices('uiKitComponent', { operations: {
    publicSearch: { method: 'GET', path: '/api/public/search', query: ['q','lang','type','limit'] },
    publicArticle: { method: 'GET', path: '/api/public/content', query: ['path','lang'] }
  } }, window, preview);
  return { dispose: services.dispose, async request(operation: string, input: any, signal?: AbortSignal) {
    const response = await services.request(operation, input, signal);
    if (operation !== 'publicSearch') return response;
    // The module owns search; this projection gives Designer a stable list schema.
    const results = (response as { results?: unknown[] })?.results;
    return { items: Array.isArray(results) ? results.slice(0, 100).map((item: any) => ({
      id: String(item.id || item.entryId || item.url), title: String(item.title || ''),
      excerpt: String(item.excerpt || ''), path: String(item.url || '')
    })) : [] };
  } };
}
