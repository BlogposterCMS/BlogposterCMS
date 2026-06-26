/**
 * @jest-environment jsdom
 */

import { saveRuntimeLayoutForViewport } from '../ui/runtime/main/runtimePageData';
import {
  bindAdminDropTarget,
  bindAdminLayoutPersistence,
  bindResponsiveAdminColumns,
  exposeAdminGridGlobals
} from '../ui/runtime/main/runtimeAdminGridInteractions';

jest.mock('../ui/runtime/main/runtimePageData', () => ({
  saveRuntimeLayoutForViewport: jest.fn()
}));

type GridHandler = (...args: any[]) => unknown;

describe('runtimeAdminGridInteractions', () => {
  function createGrid() {
    const handlers = new Map<string, GridHandler[]>();
    const grid = {
      options: {
        columnWidth: 1,
        cellHeight: 1,
        columns: 12
      },
      widgets: [] as HTMLElement[],
      update: jest.fn(),
      setStatic: jest.fn(),
      refreshMetrics: jest.fn(() => ({
        width: 120,
        height: 100,
        paddingLeft: 5,
        paddingTop: 10,
        paddingRight: 0,
        paddingBottom: 0
      })),
      on: jest.fn((eventName: string, handler: GridHandler) => {
        const current = handlers.get(eventName) || [];
        current.push(handler);
        handlers.set(eventName, current);
      }),
      trigger(eventName: string, ...args: any[]) {
        for (const handler of handlers.get(eventName) || []) {
          handler(...args);
        }
      }
    };
    return grid;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    jest.clearAllMocks();
    delete window.adminGrid;
    delete window.adminCurrentLayout;
    delete window.adminPageContext;
    delete window.addDashboardWidget;
    delete window.saveAdminLayout;
    delete window.availableWidgets;
    window.requestAnimationFrame = callback => {
      callback(0);
      return 1;
    };
    (saveRuntimeLayoutForViewport as jest.Mock).mockResolvedValue(undefined);
  });

  it('keeps admin columns responsive and refreshes existing widgets', () => {
    const gridEl = document.createElement('div');
    const widget = document.createElement('div');
    const grid = createGrid();
    grid.widgets.push(widget);

    bindResponsiveAdminColumns(gridEl, grid);

    expect(grid.options.columnWidth).toBe(10);
    expect(grid.update).toHaveBeenCalledWith(widget, {}, { silent: true });
  });

  it('translates active dashboard drops into grid coordinates', () => {
    const gridEl = document.createElement('div');
    const grid = createGrid();
    grid.options.columnWidth = 10;
    gridEl.getBoundingClientRect = jest.fn(() => ({
      width: 120,
      height: 100,
      top: 20,
      right: 130,
      bottom: 120,
      left: 10,
      x: 10,
      y: 20,
      toJSON: () => ({})
    }));
    document.body.classList.add('dashboard-edit-mode');
    window.availableWidgets = [{ id: 'stats' }];
    window.addDashboardWidget = jest.fn();

    bindAdminDropTarget(gridEl, grid);
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'clientX', { value: 45 });
    Object.defineProperty(event, 'clientY', { value: 40 });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        getData: () => 'stats'
      }
    });
    gridEl.dispatchEvent(event);

    expect(window.addDashboardWidget).toHaveBeenCalledWith(
      { id: 'stats' },
      { x: 3, y: 10 }
    );
  });

  it('exposes admin grid globals and drag state hooks', () => {
    const grid = createGrid();
    const widget = document.createElement('div');

    exposeAdminGridGlobals(grid, 'page-1', 'admin', [{ id: 'hero-1' }]);
    grid.trigger('dragstart', widget);
    expect(widget.classList.contains('dragging')).toBe(true);
    grid.trigger('dragstop', widget);

    expect(grid.setStatic).toHaveBeenCalledWith(true);
    expect(document.body.classList.contains('grid-mode')).toBe(true);
    expect(window.adminGrid).toBe(grid);
    expect(window.adminPageContext).toEqual({ pageId: 'page-1', lane: 'admin' });
    expect(window.adminCurrentLayout).toEqual([{ id: 'hero-1' }]);
    expect(widget.classList.contains('dragging')).toBe(false);
  });

  it('serializes admin layout changes and saves the latest layout', async () => {
    const grid = createGrid();
    const gridEl = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-item';
    wrapper.dataset.instanceId = 'hero-1';
    wrapper.dataset.widgetId = 'hero';
    wrapper.dataset.x = '4';
    wrapper.dataset.y = '2';
    wrapper.setAttribute('gs-w', '8');
    wrapper.setAttribute('gs-h', '4');
    gridEl.appendChild(wrapper);
    const emit = jest.fn().mockResolvedValue(undefined);

    bindAdminLayoutPersistence({
      grid,
      gridEl,
      instanceMetaMap: new Map([
        ['hero-1', { code: { html: '<p>Hero</p>' } }]
      ]),
      layout: [{ id: 'hero-1', widgetId: 'hero' }],
      pageId: 'page-1',
      lane: 'admin',
      emit
    });
    grid.trigger('change');
    await window.saveAdminLayout?.();

    expect(window.adminCurrentLayout?.[0]).toMatchObject({
      id: 'hero-1',
      widgetId: 'hero',
      x: 4,
      code: { html: '<p>Hero</p>' }
    });
    expect(saveRuntimeLayoutForViewport).toHaveBeenCalledWith(
      emit,
      'page-1',
      'admin',
      window.adminCurrentLayout
    );
  });
});
