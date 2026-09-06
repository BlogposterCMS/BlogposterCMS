import { errorMessage, fetchPageStats, type PageStatsSummary } from './pageStatsData.js';

const PAGE_STATS_RENDER_EMITTER_ERROR = 'PLAINSPACE_PAGE_STATS_RENDER_EMITTER_UNAVAILABLE';

function statRows(stats: PageStatsSummary): Array<{ label: string; value: number }> {
  return [
    { label: 'Total Pages:', value: stats.total },
    { label: 'Public Published:', value: stats.published },
    { label: 'Public Drafts:', value: stats.draft },
    { label: 'Admin Pages:', value: stats.adminCount }
  ];
}

function renderStatRows(stats: PageStatsSummary): string {
  // Label/value spans keep visual alignment local to CSS without changing the stats contract.
  return statRows(stats).map(({ label, value }) => `
            <li class="page-stats-widget__item">
              <span class="page-stats-widget__label">${label}</span>
              <span class="page-stats-widget__value">${value}</span>
            </li>
          `).join('');
}

export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  el.innerHTML = '<p role="status">Loading page counts…</p>';
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
  } catch (err) {
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = `PAGE_STATS_LOAD_FAILED: ${errorMessage(err)}`;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'button secondary sm';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => void render(el));
    el.replaceChildren(message, retry);
  }
}
