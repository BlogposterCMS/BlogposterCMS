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
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'plainSpace',
      action: 'widgetRegistry',
      params: { lane: 'public' }
    });
  });

  it('fetches global widget ids from public page layouts', async () => {
    const emit = jest.fn(async (_eventName, payload) => {
      const route = `${payload.resource}.${payload.action}`;
      if (route === 'pages.byLane') {
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
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'byLane',
      params: { lane: 'public' }
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'plainSpace',
      action: 'layoutForViewport',
      params: {
        pageId: 'home',
        lane: 'public',
        viewport: 'desktop'
      }
    });
  });

  it('skips global layout lookup when the page list is too large', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const emit = jest.fn(async (_eventName, payload) => (
      `${payload.resource}.${payload.action}` === 'pages.byLane'
        ? { pages: Array.from({ length: 21 }, (_, idx) => ({ id: idx })) }
        : { layout: [{ widgetId: 'hero', global: true }] }
    ));

    const ids = await fetchGlobalWidgetIds(emit, 'admin-token');

    expect(Array.from(ids)).toEqual([]);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[widgetList] Too many pages, skipping global widget lookup');
  });
});
