import { renderAnalytics } from './analyticsWidget.js';

// Independently placeable on any existing admin dashboard.
export async function render(el: HTMLElement | null): Promise<void> { await renderAnalytics(el, 'system'); }
