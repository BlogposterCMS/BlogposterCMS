import { fetchAnalytics } from './analyticsData.js';
import { renderSummary } from './analyticsWidget.js';

// Compact Home/catalog view uses the exact same authorized summary as Analytics.
export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  el.textContent = 'Loading analytics…';
  try {
    const data = await fetchAnalytics(7);
    const title = document.createElement('h3'); title.textContent = 'Analytics · last 7 days';
    const link = document.createElement('a'); link.href = '/admin/analytics'; link.textContent = 'Open Analytics';
    el.replaceChildren(title, renderSummary(data), link);
    if (data.health.lastError || data.health.dropped || data.health.truncated) {
      const warning = document.createElement('p'); warning.textContent = 'ANALYTICS_INCOMPLETE: Open Analytics for collection status.'; el.append(warning);
    }
  } catch (error) {
    el.textContent = `ANALYTICS_LOAD_FAILED: ${error instanceof Error ? error.message : String(error)}`;
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button secondary sm'; retry.textContent = 'Retry'; retry.onclick = () => void render(el); el.append(retry);
  }
}
