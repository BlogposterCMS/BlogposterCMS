import { renderAnalytics } from './analyticsWidget.js';
// Independently placeable on any existing admin dashboard.
export async function render(el) { await renderAnalytics(el, 'system'); }
