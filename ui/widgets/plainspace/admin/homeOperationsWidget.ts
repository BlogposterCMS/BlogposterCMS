import { fetchAnalytics } from './analyticsData.js';
import { mountChart } from '../../../shared/charts/chart.js';
import { adminHomeBase, mountHome } from './homeWidgetStyles.js';

export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  const root = mountHome(el, `<h2 class="operation-title">Your operations</h2><div><p class="metric" data-total>—</p><p class="muted">HTML deliveries · last 7 days</p></div><div data-chart></div><div class="activity" data-activity></div><p class="notice" data-notice role="status">Loading activity…</p><footer class="footer"><a class="accent" data-link>Open Analytics</a></footer>`);
  root.querySelector<HTMLAnchorElement>('[data-link]')!.href = `${adminHomeBase()}/analytics`;
  try {
    const summary = await fetchAnalytics(7);
    root.querySelector('[data-total]')!.textContent = summary.pages.toLocaleString();
    const chart = document.createElement('div');
    chart.style.height = '180px';
    root.querySelector('[data-chart]')!.append(chart);
    await mountChart(chart, { labels: summary.timeline.map(day => day.day.slice(5)),
      series: [{ name: 'HTML deliveries', values: summary.timeline.map(day => day.pages) }] });
    // The event stream represents technical operations, not invented publishing stories.
    summary.recent.filter(event => event.kind === 'system').slice(0, 3).forEach(event => {
      const row = document.createElement('div');
      row.className = 'event';
      const icon = document.createElement('img'); icon.src = '/assets/icons/activity.svg'; icon.alt = '';
      const body = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = event.event;
      const time = document.createElement('time'); time.dateTime = event.at; time.textContent = new Date(event.at).toLocaleString();
      body.append(title, time); row.append(icon, body); root.querySelector('[data-activity]')!.append(row);
    });
    root.querySelector('[data-notice]')!.textContent = summary.health.lastError || summary.health.truncated || summary.health.dropped
      ? 'Analytics data may be incomplete. Open Analytics for details.'
      : `${summary.errors} failed events · ${summary.system.toLocaleString()} system events. HTML deliveries include reloads and automated clients.`;
  } catch {
    root.querySelector('[data-notice]')!.textContent = 'HOME_OPERATIONS_LOAD_FAILED: Analytics is unavailable or access was denied. Reload to retry.';
  }
}
