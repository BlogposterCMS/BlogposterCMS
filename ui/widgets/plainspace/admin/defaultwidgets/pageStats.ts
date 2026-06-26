import { errorMessage, fetchPageStats } from './pageStatsData.js';

export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  try {
    const jwt = window.ADMIN_TOKEN;
    const emit = window.meltdownEmit;
    if (typeof emit !== 'function') throw new Error('meltdownEmit unavailable');

    const stats = await fetchPageStats(emit, jwt);

    el.innerHTML = `
      <div class="page-stats-widget">
        <h3>Page Statistics</h3>
        <ul>
          <li>Total Pages: ${stats.total}</li>
          <li>Public Published: ${stats.published}</li>
          <li>Public Drafts: ${stats.draft}</li>
          <li>Admin Pages: ${stats.adminCount}</li>
        </ul>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="error">Error loading stats: ${errorMessage(err)}</div>`;
  }
}
