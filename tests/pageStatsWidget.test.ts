/**
 * @jest-environment jsdom
 */

import fs from 'fs';
import path from 'path';
import { render } from '../ui/widgets/plainspace/admin/defaultwidgets/pageStats';

const root = path.join(__dirname, '..');

describe('pageStats widget', () => {
  afterEach(() => {
    delete (window as Window & { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
    delete (window as Window & { meltdownEmit?: unknown }).meltdownEmit;
  });

  it('renders the page counts with stable styling hooks', async () => {
    const el = document.createElement('div');
    (window as Window & { ADMIN_TOKEN?: string }).ADMIN_TOKEN = 'admin-token';
    (window as Window & { meltdownEmit?: jest.Mock }).meltdownEmit = jest.fn(async (_eventName, payload) => (
      payload.params.lane === 'public'
        ? { data: [{ status: 'published' }, { status: 'draft' }] }
        : { data: [{ status: 'draft' }] }
    ));

    await render(el);

    expect(el.querySelector('.page-stats-widget__title')?.textContent).toBe('Page Statistics');
    expect(el.querySelector('.page-stats-widget__list')?.getAttribute('aria-label')).toBe('Page counts by lane');
    expect(Array.from(el.querySelectorAll('.page-stats-widget__item')).map(item => ({
      label: item.querySelector('.page-stats-widget__label')?.textContent,
      value: item.querySelector('.page-stats-widget__value')?.textContent
    }))).toEqual([
      { label: 'Total Pages:', value: '3' },
      { label: 'Public Published:', value: '1' },
      { label: 'Public Drafts:', value: '1' },
      { label: 'Admin Pages:', value: '1' }
    ]);
  });

  it('keeps the stats card on the shared Studio style contract', () => {
    const scss = fs.readFileSync(path.join(root, 'public/assets/scss/pages/_pages.scss'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'public/assets/css/site.css'), 'utf8');

    expect(scss).toContain('.page-stats-widget');
    expect(scss).toContain('&__title');
    expect(scss).toContain('letter-spacing: 0');
    expect(scss).toContain('var(--studio-text-muted)');
    expect(css).toContain('.page-stats-widget__title');
    expect(css).toContain('.page-stats-widget__value');
    expect(css).toContain('color: var(--studio-text-muted)');
  });

  it('renders a searchable error code when the dashboard emitter is unavailable', async () => {
    const el = document.createElement('div');

    await render(el);

    expect(el.querySelector('.error')?.textContent)
      .toContain('PLAINSPACE_PAGE_STATS_RENDER_EMITTER_UNAVAILABLE');
  });
});
