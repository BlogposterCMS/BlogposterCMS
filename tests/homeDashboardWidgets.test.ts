/** @jest-environment jsdom */
jest.mock('../ui/widgets/plainspace/admin/defaultwidgets/contentSummaryData', () => ({ fetchContentDesigns: jest.fn() }));
jest.mock('../ui/widgets/plainspace/admin/defaultwidgets/pageStatsData', () => ({ fetchPagesByLane: jest.fn() }));
import { fetchContentDesigns } from '../ui/widgets/plainspace/admin/defaultwidgets/contentSummaryData';
import { fetchPagesByLane } from '../ui/widgets/plainspace/admin/defaultwidgets/pageStatsData';
import { render } from '../ui/widgets/plainspace/admin/homeWebsiteWidget';
test('keeps untrusted titles as text and rejects executable preview URLs', async () => {
  (fetchContentDesigns as jest.Mock).mockResolvedValue([{ id: 12, title: '<img onerror=bad>', thumbnail: 'javascript:bad()' }]);
  (fetchPagesByLane as jest.Mock).mockResolvedValue([{ status: 'published' }, { status: 'draft' }]);
  const el = document.createElement('div'); await render(el);
  expect(el.querySelector('.home-widget-frame > .home')).not.toBeNull();
  expect(el.querySelector('style')?.textContent).toContain('@container home-widget (max-width:600px)');
  expect(el.querySelector('[data-title]')?.textContent).toBe('<img onerror=bad>');
  expect(el.querySelector('[data-continue]')?.getAttribute('href')).toBe('/admin/studio/design/12');
  expect(el.querySelector('img[src^="javascript:"]')).toBeNull();
  expect(el.textContent).toContain('1 published');
});
