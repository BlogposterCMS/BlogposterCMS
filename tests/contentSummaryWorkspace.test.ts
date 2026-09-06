/** @jest-environment jsdom */
import { render } from '../ui/widgets/plainspace/admin/defaultwidgets/contentSummaryWidget';
import { render as renderStats } from '../ui/widgets/plainspace/admin/defaultwidgets/pageStats';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
describe('Home content entry points', () => {
  let host: HTMLElement;
  let emit: jest.Mock;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.replaceChildren(host);
    window.ADMIN_BASE = '/cms/admin/';
    emit = jest.fn(async (_event, payload) => {
      if (payload.resource === 'designer') return { designs: [{ id: 'id:One', title: 'Design' }] };
      return { data: [{ id: 8, title: 'Nested HTML', slug: 'docs/guide', lane: 'public', is_content: true }] };
    });
    window.meltdownEmit = emit;
  });
  it('uses canonical destinations and retains complete IDs without creating a second draft flow', async () => {
    await render(host);
    expect(host.querySelector('.layout-gallery a')?.getAttribute('href')).toBe('/cms/admin/studio/design/id%3AOne');
    expect(emit).toHaveBeenCalledTimes(1);
    host.querySelector<HTMLButtonElement>('[data-view=uploads]')!.click();
    await settle();
    expect(host.querySelector('.layout-gallery a')?.getAttribute('href')).toBe('/cms/admin/pages/edit/8');
    expect(host.querySelector('[data-all]')?.getAttribute('href')).toBe('/cms/admin/content/pages');
    expect(emit.mock.calls.some(([, payload]) => payload.action === 'save')).toBe(false);
  });
  it('distinguishes a failed read from an empty library and retries', async () => {
    emit.mockRejectedValueOnce(new Error('offline'));
    await render(host);
    expect(host.textContent).toContain('CONTENT_SUMMARY_LOAD_FAILED');
    expect(host.textContent).not.toContain('No designs yet');
    host.querySelector<HTMLButtonElement>('.content-summary-status button')!.click();
    await settle();
    expect(host.querySelector('.layout-gallery a')?.textContent).toBe('Design');
  });
  it('renders statistics errors as text and offers recovery', async () => {
    emit.mockRejectedValueOnce(new Error('<img src=x onerror=alert(1)>'));
    await renderStats(host);
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('PAGE_STATS_LOAD_FAILED');
    expect(host.querySelector('button')?.textContent).toBe('Retry');
  });
});
