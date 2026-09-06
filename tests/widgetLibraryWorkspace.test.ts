/** @jest-environment jsdom */
import { render } from '../ui/widgets/plainspace/admin/widgetListWidget';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('public widget library workspace', () => {
  let host: HTMLElement;
  let emit: jest.Mock;
  let fail: string;
  const button = (view: string) => host.querySelector<HTMLButtonElement>(`[data-view="${view}"]`)!;
  beforeEach(async () => {
    fail = '';
    window.localStorage.clear();
    host = document.createElement('div');
    document.body.replaceChildren(host);
    emit = jest.fn(async (_event, payload) => {
      if (payload.action === fail) throw new Error('offline');
      if (payload.action === 'widgetRegistry') return { widgets: [
        { id: 'text', metadata: { label: 'Rich text', description: 'Write page content.' } },
        { id: 'gallery', metadata: { label: 'Gallery' } },
        { id: 'legacy', metadata: { hiddenFromCatalog: true } }
      ] };
      if (payload.action === 'byLane') return [{ id: 'p1' }];
      if (payload.action === 'layoutForViewport') return { layout: [{ widgetId: 'gallery', global: true }] };
      return [];
    });
    window.meltdownEmit = emit;
    await render(host);
  });

  it('loads public building blocks without scanning usage before it is requested', () => {
    expect(host.querySelectorAll('.widget-library__item')).toHaveLength(2);
    expect(emit.mock.calls.filter(([, payload]) => payload.resource !== 'agentSurface')).toHaveLength(1);
    expect(host.querySelector('h3')?.textContent).toBe('Rich text');
    expect(host.querySelector<HTMLAnchorElement>('[data-open-studio]')?.pathname).toBe('/admin/content/designer-layouts');
    expect(host.querySelector('[draggable]')).toBeNull();
  });

  it('uses selectable buttons and keeps the search input during filtering', () => {
    const search = host.querySelector<HTMLInputElement>('[type="search"]')!;
    search.value = 'gallery';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(host.querySelector('[type="search"]')).toBe(search);
    expect(host.querySelectorAll('.widget-library__item')).toHaveLength(1);
    expect(host.querySelector('.widget-library__item')?.tagName).toBe('BUTTON');
    expect(host.querySelector('h3')?.textContent).toBe('Gallery');
    search.value = 'missing';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(host.querySelector('.widget-library__empty')?.textContent).toContain('No matches');
  });

  it('loads global usage once on demand and reports failures instead of zero', async () => {
    fail = 'layoutForViewport';
    button('global').click();
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('WIDGET_LIBRARY_USAGE_FAILED');
    expect(host.querySelector('.widget-library__empty')).toBeNull();
    fail = '';
    host.querySelector<HTMLButtonElement>('.widget-library__list button')!.click();
    await settle();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelectorAll('.widget-library__item')).toHaveLength(1);
    expect(host.querySelector('h3')?.textContent).toBe('Gallery');
    const requestCount = emit.mock.calls.length;
    button('all').click();
    button('global').click();
    await settle();
    expect(emit).toHaveBeenCalledTimes(requestCount);
  });

  it('reads local templates when the view opens and never interprets names as markup', () => {
    window.localStorage.setItem('widgetTemplates', JSON.stringify([{ widgetId: 'text', name: '<img src=x onerror=alert(1)>' }]));
    button('templates').click();
    expect(host.querySelector('h3')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(host.querySelector('img[src="x"]')).toBeNull();
    expect(host.querySelector('.widget-library__summary')?.textContent).toContain('saved in this browser');
    button('all').click();
    window.localStorage.setItem('widgetTemplates', '[]');
    button('templates').click();
    expect(host.querySelectorAll('.widget-library__item')).toHaveLength(0);
  });

  it('recovers registry errors with Retry', async () => {
    fail = 'widgetRegistry';
    await render(host);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('WIDGET_LIBRARY_LOAD_FAILED');
    fail = '';
    host.querySelector('button')!.click();
    await settle();
    expect(host.querySelector('.widget-library')).not.toBeNull();
  });
});
