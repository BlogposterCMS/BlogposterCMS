/**
 * @jest-environment jsdom
 */

import {
  fetchGlobalWidgetIds,
  fetchWidgetRegistry,
  getWidgetTemplates,
  toLayoutItems,
  toPages,
  toWidgets
} from '../ui/widgets/plainspace/admin/widgetListData';

describe('widgetListData', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes registry, page, layout, and template payloads', () => {
    const storage = {
      getItem: jest.fn(() => JSON.stringify([
        { widgetId: 'hero', name: 'Hero template' },
        { widgetId: 12 }
      ]))
    };

    expect(toWidgets({ widgets: [{ id: 'hero' }, { id: 12 }, null] })).toEqual([{ id: 'hero' }]);
    expect(toPages({ pages: [{ id: 'home' }, null] })).toEqual([{ id: 'home' }]);
    expect(toPages([{ id: 'about' }])).toEqual([{ id: 'about' }]);
    expect(toLayoutItems({ layout: [{ widgetId: 'hero', global: true }, null] }))
      .toEqual([{ widgetId: 'hero', global: true }]);
    expect(getWidgetTemplates(storage)).toEqual([{ widgetId: 'hero', name: 'Hero template' }]);
  });

  it('fetches and normalizes the widget registry', async () => {
    const emit = jest.fn().mockResolvedValue({
      widgets: [{ id: 'hero' }, { id: 10 }]
    });

    await expect(fetchWidgetRegistry(emit, 'admin-token')).resolves.toEqual([{ id: 'hero' }]);
    expect(emit).toHaveBeenCalledWith('widget.registry.request.v1', {
      lane: 'public',
      moduleName: 'plainspace',
      moduleType: 'core',
      jwt: 'admin-token'
    });
  });

  it('fetches global widget ids from public page layouts', async () => {
    const emit = jest.fn(async eventName => {
      if (eventName === 'getPagesByLane') {
        return { pages: [{ id: 'home' }, { id: 'about' }] };
      }
      return {
        layout: [
          { widgetId: 'hero', global: true },
          { widgetId: 'local', global: false }
        ]
      };
    });

    const ids = await fetchGlobalWidgetIds(emit, 'admin-token');

    expect(Array.from(ids)).toEqual(['hero']);
    expect(emit).toHaveBeenCalledWith('getPagesByLane', {
      jwt: 'admin-token',
      moduleName: 'pagesManager',
      moduleType: 'core',
      lane: 'public'
    });
    expect(emit).toHaveBeenCalledWith('getLayoutForViewport', {
      jwt: 'admin-token',
      moduleName: 'plainspace',
      moduleType: 'core',
      pageId: 'home',
      lane: 'public',
      viewport: 'desktop'
    });
  });

  it('skips global layout lookup when the page list is too large', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const emit = jest.fn(async eventName => (
      eventName === 'getPagesByLane'
        ? { pages: Array.from({ length: 21 }, (_, idx) => ({ id: idx })) }
        : { layout: [{ widgetId: 'hero', global: true }] }
    ));

    const ids = await fetchGlobalWidgetIds(emit, 'admin-token');

    expect(Array.from(ids)).toEqual([]);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[widgetList] Too many pages, skipping global widget lookup');
  });
});
