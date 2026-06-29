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

const HALF_WIDGET = {
  id: 'hero',
  metadata: {
    layout: {
      defaultSlot: 'half',
      supportedSlots: [
        { name: 'half', minCols: 6, maxCols: 6 },
        { name: 'full', minCols: 12, maxCols: 12 }
      ],
      breakpoints: {
        mobile: ['full'],
        tablet: ['half', 'full'],
        desktop: ['half', 'full']
      },
      heightMode: 'dynamic',
      height: {
        minHeight: { mobile: 160, tablet: 180, desktop: 220 }
      }
    }
  }
};

describe('runtimeAdminGridMounting', () => {
  function createGrid() {
    return {
      widgets: [] as HTMLElement[],
      registerWidget: jest.fn(function registerWidget(el: HTMLElement) {
        this.widgets.push(el);
      })
    };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    (renderRuntimeCanvasWidget as jest.Mock).mockResolvedValue(undefined);
  });

  it('mounts dashboard slot items, records instance metadata, and renders widgets', async () => {
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
          slot: 'half',
          column: 4,
          order: 10
        },
        {
          id: 'missing-1',
          widgetId: 'missing'
        }
      ],
      allWidgets: [HALF_WIDGET],
      lane: 'admin',
      widgetEmit: emit,
      instanceMetaMap,
      deferHydration: false
    });

    const wrapper = gridEl.querySelector<HTMLElement>('.dashboard-widget');
    expect(grid.registerWidget).toHaveBeenCalledTimes(1);
    expect(wrapper?.dataset.widgetId).toBe('hero');
    expect(wrapper?.dataset.instanceId).toBe('hero-1');
    expect(wrapper?.dataset.dashboardSlot).toBe('half');
    expect(wrapper?.dataset.dashboardColumns).toBe('6');
    expect(wrapper?.dataset.dashboardColumn).toBe('4');
    expect(wrapper?.dataset.dashboardHeightMode).toBe('dynamic');
    expect(wrapper?.style.getPropertyValue('--dashboard-min-height')).toBe('180px');
    expect(wrapper?.style.order).toBe('10');
    expect(wrapper?.dataset.x).toBeUndefined();
    expect(wrapper?.getAttribute('gs-w')).toBeNull();
    expect(instanceMetaMap.get('hero-1')).toMatchObject({
      id: 'hero-1',
      widgetId: 'hero',
      slot: 'half',
      column: 4,
      order: 10
    });
    expect(renderRuntimeCanvasWidget).toHaveBeenCalledWith(expect.objectContaining({
      wrapper,
      lane: 'admin',
      emit,
      afterRender: attachAdminDashboardControls
    }));
  });

  it('ignores old saved free grid coordinates and falls back to the widget default slot', async () => {
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
              defaultSlot: 'third',
              supportedSlots: [
                { name: 'third', minCols: 4, maxCols: 4 },
                { name: 'full', minCols: 12, maxCols: 12 }
              ],
              breakpoints: {
                mobile: ['full'],
                tablet: ['full'],
                desktop: ['third', 'full']
              }
            }
          }
        }
      ],
      lane: 'admin',
      widgetEmit: jest.fn().mockResolvedValue(undefined),
      instanceMetaMap,
      deferHydration: false
    });

    const wrapper = gridEl.querySelector<HTMLElement>('.dashboard-widget');
    expect(wrapper?.dataset.dashboardSlot).toBe('full');
    expect(wrapper?.dataset.x).toBeUndefined();
    expect(wrapper?.getAttribute('gs-h')).toBeNull();
  });

  it('mounts page-sized widgets alone', async () => {
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
          slot: 'half'
        },
        {
          id: 'media-1',
          widgetId: 'mediaExplorer',
          slot: 'page'
        }
      ],
      allWidgets: [
        HALF_WIDGET,
        {
          id: 'mediaExplorer',
          metadata: {
            layout: {
              defaultSlot: 'page',
              supportedSlots: [{ name: 'page', minCols: 12, maxCols: 12 }],
              breakpoints: {
                mobile: ['page'],
                tablet: ['page'],
                desktop: ['page']
              }
            }
          }
        }
      ],
      lane: 'admin',
      widgetEmit: jest.fn().mockResolvedValue(undefined),
      instanceMetaMap,
      deferHydration: false
    });

    const widgets = Array.from(gridEl.querySelectorAll<HTMLElement>('.dashboard-widget'));
    expect(widgets).toHaveLength(1);
    expect(widgets[0].dataset.widgetId).toBe('mediaExplorer');
    expect(widgets[0].dataset.dashboardSlot).toBe('page');
  });
});
