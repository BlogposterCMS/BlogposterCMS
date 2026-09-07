import { renderAnalytics } from './analyticsWidget.js';
// Catalog entrypoint; storage and authorization stay behind the shared facade.
export async function render(el) { await renderAnalytics(el, 'website'); }
