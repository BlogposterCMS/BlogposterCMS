/** @jest-environment jsdom */
jest.mock('../ui/shared/charts/chart.js', () => ({ mountChart: jest.fn().mockResolvedValue({ dispose: jest.fn() }) }));
jest.mock('../ui/widgets/plainspace/admin/analyticsData.js', () => ({ fetchAnalytics: jest.fn() }));
import { fetchAnalytics } from '../ui/widgets/plainspace/admin/analyticsData.js';
import { render, renderAnalytics } from '../ui/widgets/plainspace/admin/analyticsWidget';

test('renders untrusted metadata as text and exposes data gaps', async () => {
  (fetchAnalytics as jest.Mock).mockResolvedValue({ version: 1, pages: 1, system: 2, errors: 0, previous: { pages: 0, system: 1 }, to: '2026-09-07', retentionDays: 60,
    health: { enabled: true, dropped: 2, truncated: false }, timeline: [], recent: [], tables: { event: [{ name: '<img src=x onerror=alert(1)>', count: 1 }] } });
  const el = document.createElement('div'); await renderAnalytics(el, 'system');
  expect(el.querySelector('img')).toBeNull();
  expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(el.textContent).toContain('ANALYTICS_INCOMPLETE');
  expect(el.textContent).toContain('not unique visitors or sessions');
  expect(fetchAnalytics).toHaveBeenCalledWith(7);
});

test('failed loads offer a working refresh without showing zero statistics', async () => {
  (fetchAnalytics as jest.Mock).mockRejectedValue(new Error('ANALYTICS_FORBIDDEN'));
  const el = document.createElement('div'); await render(el);
  expect(el.querySelector('[role="alert"]')?.textContent).toContain('ANALYTICS_FORBIDDEN');
  expect(el.querySelector('button')?.disabled).toBe(false);
  expect(el.textContent).not.toContain('Previous period:');
});

test.each([
  ['overview', 'Analytics overview', ['Activity over time'], ['Pages (ID)', 'System events']],
  ['website', 'Website analytics', ['Pages (ID)', 'Referrer domains'], ['Browsers', 'Target modules']],
  ['devices', 'Devices & Software', ['Browsers', 'Operating systems'], ['Pages (ID)', 'Verified actors']],
  ['system', 'System activity', ['Target modules', 'Verified actors'], ['Referrer domains', 'Browsers']]
] as const)('renders the %s catalog view independently of the page URL', async (view, title, present, absent) => {
  (fetchAnalytics as jest.Mock).mockResolvedValue({ version: 1, pages: 1, system: 2, errors: 0, previous: { pages: 0, system: 0 }, to: '2026-09-07', retentionDays: 60,
    health: { enabled: true, dropped: 0, truncated: false }, timeline: [], recent: [], tables: {} });
  const el = document.createElement('div'); await renderAnalytics(el, view);
  expect(el.querySelector('h2')?.textContent).toBe(title);
  const headings = [...el.querySelectorAll('h3')].map(heading => heading.textContent);
  present.forEach(label => expect(headings).toContain(label));
  absent.forEach(label => expect(headings).not.toContain(label));
});
