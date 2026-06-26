/**
 * @jest-environment jsdom
 */

import { init as initCanvasGrid } from '../ui/runtime/main/canvasGrid';
import {
  loadRuntimeLayoutForViewport,
  saveRuntimeLayoutForViewport
} from '../ui/runtime/main/runtimePageData';
import { renderAttachedRuntimeContent } from '../ui/runtime/main/runtimeAttachedContent';
import { renderAdminRuntimeGrid } from '../ui/runtime/main/runtimeAdminGrid';
import { renderRuntimeCanvasWidget } from '../ui/runtime/main/runtimeWidgetMounting';
import { attachAdminDashboardControls } from '../ui/runtime/main/widgetRuntimeGateway';

jest.mock('../ui/runtime/main/canvasGrid', () => ({
  init: jest.fn()
}));

jest.mock('../ui/runtime/main/runtimePageData', () => ({
  loadRuntimeLayoutForViewport: jest.fn(),
  saveRuntimeLayoutForViewport: jest.fn()
}));

jest.mock('../ui/runtime/main/runtimeAttachedContent', () => ({
  renderAttachedRuntimeContent: jest.fn()
}));

jest.mock('../ui/runtime/main/runtimeWidgetMounting', () => ({
  renderRuntimeCanvasWidget: jest.fn()
}));

jest.mock('../ui/runtime/main/widgetRuntimeGateway', () => ({
  attachAdminDashboardControls: jest.fn()
}));

type GridHandler = (...args: any[]) => unknown;

describe('runtimeAdminGrid', () => {
  function createGrid() {
    const handlers = new Map<string, GridHandler[]>();
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
    (initCanvasGrid as jest.Mock).mockImplementation(() => createGrid());
    (loadRuntimeLayoutForViewport as jest.Mock).mockResolvedValue([
      {
        id: 'hero-1',
        widgetId: 'hero',
        xPercent: 25,
        yPercent: 10,
        wPercent: 50,
        hPercent: 20,
        code: { html: '<p>Hero</p>' }
      }
    ]);
    (saveRuntimeLayoutForViewport as jest.Mock).mockResolvedValue(undefined);
    (renderRuntimeCanvasWidget as jest.Mock).mockResolvedValue(undefined);
    (renderAttachedRuntimeContent as jest.Mock).mockResolvedValue(undefined);
  });

  it('sets up the admin grid, globals, mounted widgets, and attached content', async () => {
    const contentEl = document.createElement('main');
    const contentHeader = document.createElement('div');
    contentHeader.id = 'content-header';
    contentEl.append(contentHeader, document.createElement('p'));
    const emit = jest.fn().mockResolvedValue(undefined);

    const result = await renderAdminRuntimeGrid({
      page: { id: 'page-1' },
      contentEl,
      globalLayout: [{ id: 'global-1', widgetId: 'global', x: 0, y: 0, w: 2, h: 2 }],
      allWidgets: [{ id: 'hero' }, { id: 'global' }],
      lane: 'admin',
      emit,
      widgetEmit: emit
    });

    expect(loadRuntimeLayoutForViewport).toHaveBeenCalledWith(emit, 'page-1', 'admin');
    expect(contentEl.firstElementChild).toBe(contentHeader);
    expect(result.gridEl.id).toBe('adminGrid');
    expect(result.grid.options.columnWidth).toBe(10);
    expect(result.grid.setStatic).toHaveBeenCalledWith(true);
    expect(document.body.classList.contains('grid-mode')).toBe(true);
    expect(window.adminGrid).toBe(result.grid);
    expect(window.adminPageContext).toEqual({ pageId: 'page-1', lane: 'admin' });
    expect(window.adminCurrentLayout).toEqual(result.layout);

    const hero = result.gridEl.querySelector<HTMLElement>('[data-instance-id="hero-1"]');
    expect(hero?.dataset.widgetId).toBe('hero');
    expect(hero?.dataset.x).toBe('3');
    expect(hero?.dataset.y).toBe('10');
    expect(hero?.getAttribute('gs-w')).toBe('6');
    expect(hero?.getAttribute('gs-h')).toBe('20');
    expect(hero?.getAttribute('gs-min-h')).toBe('100');
    expect(renderRuntimeCanvasWidget).toHaveBeenCalledWith(expect.objectContaining({
      wrapper: hero,
      lane: 'admin',
      emit,
      afterRender: attachAdminDashboardControls
    }));
    expect(renderAttachedRuntimeContent).toHaveBeenCalledWith(expect.objectContaining({
      page: { id: 'page-1' },
      lane: 'admin',
      container: contentEl,
      emit
    }));
  });

  it('translates dashboard drops into grid coordinates while edit mode is active', async () => {
    const contentEl = document.createElement('main');
    const emit = jest.fn().mockResolvedValue(undefined);
    const result = await renderAdminRuntimeGrid({
      page: { id: 'page-1' },
      contentEl,
      allWidgets: [{ id: 'hero' }],
      lane: 'admin',
      emit,
      widgetEmit: emit
    });
    result.gridEl.getBoundingClientRect = jest.fn(() => ({
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

    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'clientX', { value: 45 });
    Object.defineProperty(event, 'clientY', { value: 40 });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        getData: () => 'stats'
      }
    });
    result.gridEl.dispatchEvent(event);

    expect(window.addDashboardWidget).toHaveBeenCalledWith(
      { id: 'stats' },
      { x: 3, y: 10 }
    );
  });

  it('serializes admin grid changes and saves the latest layout', async () => {
    const contentEl = document.createElement('main');
    const emit = jest.fn().mockResolvedValue(undefined);
    const result = await renderAdminRuntimeGrid({
      page: { id: 'page-1' },
      contentEl,
      allWidgets: [{ id: 'hero' }],
      lane: 'admin',
      emit,
      widgetEmit: emit
    });
    const grid = result.grid as ReturnType<typeof createGrid>;
    const hero = result.gridEl.querySelector<HTMLElement>('[data-instance-id="hero-1"]');
    hero!.dataset.x = '4';

    grid.trigger('change');
    await window.saveAdminLayout?.();

    expect(window.adminCurrentLayout?.[0]).toMatchObject({
      id: 'hero-1',
      widgetId: 'hero',
      x: 4
    });
    expect(saveRuntimeLayoutForViewport).toHaveBeenCalledWith(
      emit,
      'page-1',
      'admin',
      window.adminCurrentLayout
    );
  });
});
