/**
 * @jest-environment jsdom
 */

import { mountAdminGridWidgets } from '../ui/runtime/main/runtimeAdminGridMounting';
import { renderRuntimeCanvasWidget } from '../ui/runtime/main/runtimeWidgetMounting';
import { attachAdminDashboardControls } from '../ui/runtime/main/widgetRuntimeGateway';

jest.mock('../ui/runtime/main/runtimeWidgetMounting', () => ({
  renderRuntimeCanvasWidget: jest.fn()
}));

jest.mock('../ui/runtime/main/widgetRuntimeGateway', () => ({
  attachAdminDashboardControls: jest.fn()
}));

describe('runtimeAdminGridMounting', () => {
  function createGrid() {
    const grid = {
      options: {
        columnWidth: 1,
        cellHeight: 1,
        columns: 12
      },
      widgets: [] as HTMLElement[],
      makeWidget: jest.fn((el: HTMLElement) => {
        grid.widgets.push(el);
      }),
      refreshMetrics: jest.fn(() => ({
        width: 120,
        height: 100,
        paddingLeft: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0
      }))
    };
    return grid;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    (renderRuntimeCanvasWidget as jest.Mock).mockResolvedValue(undefined);
  });

  it('projects admin layout items, records instance metadata, and mounts widgets', async () => {
    const gridEl = document.createElement('section');
    const grid = createGrid();
    const emit = jest.fn().mockResolvedValue(undefined);
    const instanceMetaMap = new Map<string, Record<string, any>>();

    await mountAdminGridWidgets({
      gridEl,
      grid,
      layout: [
        {
          id: 'hero-1',
          widgetId: 'hero',
          xPercent: 25,
          yPercent: 10,
          wPercent: 50,
          hPercent: 20
        },
        {
          id: 'missing-1',
          widgetId: 'missing'
        }
      ],
      allWidgets: [{ id: 'hero', metadata: { label: 'Hero' } }],
      lane: 'admin',
      widgetEmit: emit,
      instanceMetaMap,
      deferHydration: false
    });

    const wrapper = gridEl.querySelector<HTMLElement>('.canvas-item');
    expect(grid.makeWidget).toHaveBeenCalledTimes(1);
    expect(wrapper?.dataset.widgetId).toBe('hero');
    expect(wrapper?.dataset.instanceId).toBe('hero-1');
    expect(wrapper?.dataset.x).toBe('3');
    expect(wrapper?.dataset.y).toBe('10');
    expect(wrapper?.getAttribute('gs-w')).toBe('6');
    expect(wrapper?.getAttribute('gs-h')).toBe('20');
    expect(wrapper?.getAttribute('gs-min-h')).toBe('100');
    expect(instanceMetaMap.get('hero-1')).toMatchObject({
      id: 'hero-1',
      widgetId: 'hero',
      xPercent: 25
    });
    expect(renderRuntimeCanvasWidget).toHaveBeenCalledWith(expect.objectContaining({
      wrapper,
      lane: 'admin',
      emit,
      afterRender: attachAdminDashboardControls
    }));
  });

  it('mounts legacy oversized admin percent heights as compact row heights', async () => {
    const gridEl = document.createElement('section');
    const grid = createGrid();
    const instanceMetaMap = new Map<string, Record<string, any>>();

    grid.refreshMetrics.mockReturnValue({
      width: 120,
      height: 900,
      paddingLeft: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0
    });

    await mountAdminGridWidgets({
      gridEl,
      grid,
      layout: [
        {
          id: 'stats-1',
          widgetId: 'stats',
          xPercent: 50,
          yPercent: 160,
          wPercent: 50,
          hPercent: 160
        }
      ],
      allWidgets: [{ id: 'stats' }],
      lane: 'admin',
      widgetEmit: jest.fn().mockResolvedValue(undefined),
      instanceMetaMap,
      deferHydration: false
    });

    const wrapper = gridEl.querySelector<HTMLElement>('.canvas-item');
    expect(wrapper?.dataset.x).toBe('6');
    expect(wrapper?.dataset.y).toBe('160');
    expect(wrapper?.getAttribute('gs-w')).toBe('6');
    expect(wrapper?.getAttribute('gs-h')).toBe('160');
  });

  it('recovers old saved admin grid rows from seed sizing metadata', async () => {
    const gridEl = document.createElement('section');
    const grid = createGrid();
    const instanceMetaMap = new Map<string, Record<string, any>>();

    await mountAdminGridWidgets({
      gridEl,
      grid,
      layout: [
        {
          id: 'stats-1',
          widgetId: 'stats',
          x: 8,
          y: 0,
          w: 4,
          h: 2022
        }
      ],
      allWidgets: [
        {
          id: 'stats',
          metadata: {
            seedOptions: {
              halfWidth: true,
              height: 160,
              overflow: true
            }
          }
        }
      ],
      lane: 'admin',
      widgetEmit: jest.fn().mockResolvedValue(undefined),
      instanceMetaMap,
      deferHydration: false
    });

    const wrapper = gridEl.querySelector<HTMLElement>('.canvas-item');
    expect(wrapper?.dataset.x).toBe('6');
    expect(wrapper?.getAttribute('gs-w')).toBe('6');
    expect(wrapper?.getAttribute('gs-h')).toBe('160');
  });

  it('uses widget size slots as a width fallback for old saved admin rows', async () => {
    const gridEl = document.createElement('section');
    const grid = createGrid();
    const instanceMetaMap = new Map<string, Record<string, any>>();

    await mountAdminGridWidgets({
      gridEl,
      grid,
      layout: [
        {
          id: 'stats-1',
          widgetId: 'stats',
          x: 8,
          y: 0,
          w: 4,
          h: 2022
        }
      ],
      allWidgets: [
        {
          id: 'stats',
          metadata: {
            layout: {
              supportedSlots: [
                { name: 'full', minCols: 12, maxCols: 12 },
                { name: 'wide', minCols: 6 }
              ]
            }
          }
        }
      ],
      lane: 'admin',
      widgetEmit: jest.fn().mockResolvedValue(undefined),
      instanceMetaMap,
      deferHydration: false
    });

    const wrapper = gridEl.querySelector<HTMLElement>('.canvas-item');
    expect(wrapper?.dataset.x).toBe('6');
    expect(wrapper?.getAttribute('gs-w')).toBe('6');
    expect(wrapper?.getAttribute('gs-h')).toBe('160');
  });
});
