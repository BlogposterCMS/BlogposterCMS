import { errorMessage, fetchPageStats } from './pageStatsData.js';
const PAGE_STATS_RENDER_EMITTER_ERROR = 'PLAINSPACE_PAGE_STATS_RENDER_EMITTER_UNAVAILABLE';
function statRows(stats) {
    return [
        { label: 'Total Pages:', value: stats.total },
        { label: 'Public Published:', value: stats.published },
        { label: 'Public Drafts:', value: stats.draft },
        { label: 'Admin Pages:', value: stats.adminCount }
    ];
}
function renderStatRows(stats) {
    // Label/value spans keep visual alignment local to CSS without changing the stats contract.
    return statRows(stats).map(({ label, value }) => `
            <li class="page-stats-widget__item">
              <span class="page-stats-widget__label">${label}</span>
              <span class="page-stats-widget__value">${value}</span>
            </li>
          `).join('');
}
export async function render(el) {
    if (!el)
        return;
    try {
        const jwt = window.ADMIN_TOKEN;
        const emit = window.meltdownEmit;
        if (typeof emit !== 'function') {
            throw new Error(`${PAGE_STATS_RENDER_EMITTER_ERROR}: meltdownEmit unavailable`);
        }
        const stats = await fetchPageStats(emit, jwt);
        el.innerHTML = `
      <div class="page-stats-widget">
        <h3 class="page-stats-widget__title">Page Statistics</h3>
        <ul class="page-stats-widget__list" aria-label="Page counts by lane">
          ${renderStatRows(stats)}
        </ul>
      </div>
    `;
    }
    catch (err) {
        el.innerHTML = `<div class="error">Error loading stats: ${errorMessage(err)}</div>`;
    }
}
