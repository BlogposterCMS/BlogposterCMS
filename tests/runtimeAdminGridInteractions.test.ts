/**
 * @jest-environment jsdom
 */

import { saveRuntimeLayoutForViewport } from '../ui/runtime/main/runtimePageData';
import {
  bindAdminDropTarget,
  bindAdminLayoutPersistence,
  createAdminDashboardController,
  exposeAdminGridGlobals
} from '../ui/runtime/main/runtimeAdminGridInteractions';

jest.mock('../ui/runtime/main/runtimePageData', () => ({
  saveRuntimeLayoutForViewport: jest.fn()
}));

describe('runtimeAdminGridInteractions', () => {
  const halfWidget = {
    id: 'stats',
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
        }
      }
    }
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: jest.fn(() => null)
    });
    jest.clearAllMocks();
    delete window.adminGrid;
    delete window.adminCurrentLayout;
    delete window.adminPageContext;
    delete window.addDashboardWidget;
    delete window.saveAdminLayout;
    delete window.availableWidgets;
    delete window.__dashboardDraggingWidgetId;
    (saveRuntimeLayoutForViewport as jest.Mock).mockResolvedValue(undefined);
  });

  it('adds dropped widgets through the dashboard flow add hook', () => {
    const gridEl = document.createElement('div');
    const grid = createAdminDashboardController(gridEl);
    gridEl.getBoundingClientRect = jest.fn(() => ({
      width: 120,
      height: 100,
      top: 0,
      right: 120,
      bottom: 100,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }));
    document.body.classList.add('dashboard-edit-mode');
    window.availableWidgets = [halfWidget];
    window.addDashboardWidget = jest.fn();

    bindAdminDropTarget(gridEl, grid);
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'clientX', { value: 75 });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        getData: (type: string) => (type === 'text/plain' ? 'stats' : '')
      }
    });
    gridEl.dispatchEvent(event);

    expect(window.addDashboardWidget).toHaveBeenCalledWith(halfWidget, { column: 7 });
  });

  it('keeps page-sized widgets exclusive within the dashboard flow', () => {
    const gridEl = document.createElement('div');
    const first = document.createElement('article');
    first.className = 'dashboard-widget';
    first.dataset.dashboardSlot = 'half';
    const page = document.createElement('article');
    page.className = 'dashboard-widget';
    page.dataset.dashboardSlot = 'page';
    const grid = createAdminDashboardController(gridEl);

    gridEl.appendChild(first);
    grid.registerWidget(first);
    gridEl.appendChild(page);
    grid.registerWidget(page);

    expect(first.isConnected).toBe(false);
    expect(grid.widgets).toEqual([page]);
    expect(page.dataset.dashboardOrder).toBe('0');
  });

  it('cleans the registered widget list when a widget changes to the page slot', () => {
    const gridEl = document.createElement('div');
    const first = document.createElement('article');
    first.className = 'dashboard-widget';
    first.dataset.dashboardSlot = 'half';
    const second = document.createElement('article');
    second.className = 'dashboard-widget';
    second.dataset.dashboardSlot = 'half';
    gridEl.append(first, second);
    const grid = createAdminDashboardController(gridEl);
    grid.registerWidget(first);
    grid.registerWidget(second);

    grid.updateSlot(second, 'page');

    expect(first.isConnected).toBe(false);
    expect(grid.widgets).toEqual([second]);
    expect(second.dataset.dashboardSlot).toBe('page');
  });

  it('moves widgets within the flow and applies a raster column', () => {
    const gridEl = document.createElement('div');
    const first = document.createElement('article');
    first.className = 'dashboard-widget';
    first.dataset.instanceId = 'first';
    first.dataset.dashboardSlot = 'half';
    first.dataset.dashboardSupportedSlots = 'half,full';
    const second = document.createElement('article');
    second.className = 'dashboard-widget';
    second.dataset.instanceId = 'second';
    second.dataset.dashboardSlot = 'half';
    second.dataset.dashboardSupportedSlots = 'half,full';
    gridEl.append(first, second);
    const grid = createAdminDashboardController(gridEl);
    grid.registerWidget(first);
    grid.registerWidget(second);

    grid.moveWidget(second, first, 'before', 4);

    expect(Array.from(gridEl.querySelectorAll('.dashboard-widget'))).toEqual([second, first]);
    expect(second.dataset.dashboardOrder).toBe('0');
    expect(second.dataset.dashboardColumn).toBe('4');
    expect(second.style.getPropertyValue('--dashboard-column-start')).toBe('4');
    expect(first.dataset.dashboardOrder).toBe('10');
  });

  it('previews existing widget reordering while pointer dragging and commits on release', () => {
    const gridEl = createMeasuredGrid();
    const first = createDashboardWidget('first');
    const second = createDashboardWidget('second');
    mockRect(first, { left: 0, top: 0, width: 100, height: 120 });
    mockRect(second, { left: 0, top: 140, width: 100, height: 120 });
    second.setPointerCapture = jest.fn();
    second.releasePointerCapture = jest.fn();
    gridEl.append(first, second);
    const grid = createAdminDashboardController(gridEl);
    grid.registerWidget(first);
    grid.registerWidget(second);
    document.body.classList.add('dashboard-edit-mode');
    bindAdminDropTarget(gridEl, grid);
    (document.elementFromPoint as jest.Mock).mockImplementation((_x, y) => (
      y < 100 ? first : second
    ));

    second.dispatchEvent(createPointerEvent('pointerdown', {
      clientX: 10,
      clientY: 150,
      pointerId: 7
    }));
    window.dispatchEvent(createPointerEvent('pointermove', {
      clientX: 20,
      clientY: 20,
      pointerId: 7
    }));

    const placeholder = gridEl.querySelector<HTMLElement>('.dashboard-drop-placeholder');
    const preview = document.body.querySelector<HTMLElement>('.dashboard-drag-preview');
    expect(placeholder).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(preview?.style.transform).toContain('10px, 10px');
    expect(preview?.textContent).toContain('second');
    expect(gridEl.classList.contains('is-dashboard-snap-active')).toBe(true);
    expect(gridEl.style.getPropertyValue('--dashboard-snap-column')).toBe('3');
    expect(gridEl.style.getPropertyValue('--dashboard-snap-span')).toBe('6');
    expect(Array.from(gridEl.children)).toEqual([placeholder, first, second]);

    window.dispatchEvent(createPointerEvent('pointerup', {
      clientX: 20,
      clientY: 20,
      pointerId: 7
    }));

    expect(gridEl.querySelector('.dashboard-drop-placeholder')).toBeNull();
    expect(document.body.querySelector('.dashboard-drag-preview')).toBeNull();
    expect(gridEl.classList.contains('is-dashboard-snap-active')).toBe(false);
    expect(Array.from(gridEl.querySelectorAll('.dashboard-widget'))).toEqual([second, first]);
    expect(second.classList.contains('is-dragging')).toBe(false);
    expect(second.draggable).toBe(false);
    expect(second.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(second.dataset.dashboardOrder).toBe('0');
    expect(first.dataset.dashboardOrder).toBe('10');
  });

  it('drops new panel widgets at the previewed dashboard position', () => {
    const gridEl = createMeasuredGrid();
    const first = createDashboardWidget('first');
    const second = createDashboardWidget('second');
    mockRect(first, { left: 0, top: 0, width: 100, height: 120 });
    gridEl.append(first, second);
    const grid = createAdminDashboardController(gridEl);
    grid.registerWidget(first);
    grid.registerWidget(second);
    document.body.classList.add('dashboard-edit-mode');
    window.availableWidgets = [halfWidget];
    window.__dashboardDraggingWidgetId = 'stats';
    window.addDashboardWidget = jest.fn();
    bindAdminDropTarget(gridEl, grid);

    first.dispatchEvent(createDragEvent('dragover', {
      clientX: 35,
      clientY: 20,
      types: ['text/plain']
    }));

    const placeholder = gridEl.querySelector<HTMLElement>('.dashboard-drop-placeholder');
    const preview = document.body.querySelector<HTMLElement>('.dashboard-drag-preview');
    expect(placeholder).not.toBeNull();
    expect(preview?.textContent).toBe('stats');
    expect(placeholder?.dataset.dashboardColumn).toBe('4');
    expect(gridEl.style.getPropertyValue('--dashboard-snap-column')).toBe('4');
    expect(Array.from(gridEl.children)).toEqual([placeholder, first, second]);

    first.dispatchEvent(createDragEvent('drop', {
      clientX: 35,
      clientY: 20,
      getData: type => (type === 'text/plain' ? 'stats' : '')
    }));

    expect(window.addDashboardWidget).toHaveBeenCalledWith(halfWidget, {
      column: 4,
      beforeInstanceId: 'first'
    });
    expect(gridEl.querySelector('.dashboard-drop-placeholder')).toBeNull();
    expect(window.__dashboardDraggingWidgetId).toBeUndefined();
  });

  it('exposes admin grid globals for dashboard flow mode', () => {
    const gridEl = document.createElement('div');
    const grid = createAdminDashboardController(gridEl);
    const setStaticSpy = jest.spyOn(grid, 'setStatic');

    exposeAdminGridGlobals(grid, 'page-1', 'admin', [{ id: 'hero-1' }]);

    expect(setStaticSpy).toHaveBeenCalledWith(true);
    expect(document.body.classList.contains('grid-mode')).toBe(true);
    expect(document.body.classList.contains('dashboard-flow-mode')).toBe(true);
    expect(window.adminGrid).toBe(grid);
    expect(window.adminPageContext).toEqual({ pageId: 'page-1', lane: 'admin' });
    expect(window.adminCurrentLayout).toEqual([{ id: 'hero-1' }]);
  });

  it('serializes dashboard slot changes and saves the latest layout', async () => {
    const gridEl = document.createElement('div');
    const grid = createAdminDashboardController(gridEl);
    const wrapper = document.createElement('article');
    wrapper.className = 'dashboard-widget';
    wrapper.dataset.instanceId = 'hero-1';
    wrapper.dataset.widgetId = 'hero';
    wrapper.dataset.dashboardSlot = 'half';
    wrapper.dataset.dashboardColumn = '4';
    gridEl.appendChild(wrapper);
    grid.registerWidget(wrapper);
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
    grid.emitChange(wrapper);
    await window.saveAdminLayout?.();

    expect(window.adminCurrentLayout?.[0]).toMatchObject({
      id: 'hero-1',
      widgetId: 'hero',
      slot: 'half',
      column: 4,
      order: 0,
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

function createDashboardWidget(instanceId: string): HTMLElement {
  const widget = document.createElement('article');
  widget.className = 'dashboard-widget';
  widget.dataset.instanceId = instanceId;
  widget.dataset.widgetId = instanceId;
  widget.dataset.dashboardSlot = 'half';
  widget.dataset.dashboardSupportedSlots = 'half,full';
  return widget;
}

function createMeasuredGrid(): HTMLElement {
  const gridEl = document.createElement('div');
  mockRect(gridEl, { left: 0, top: 0, width: 120, height: 300 });
  return gridEl;
}

function mockRect(
  el: HTMLElement,
  rect: { left: number; top: number; width: number; height: number }
): void {
  el.getBoundingClientRect = jest.fn(() => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({})
  }));
}

function createDragEvent(
  type: string,
  options: {
    clientX?: number;
    clientY?: number;
    types?: string[];
    getData?: (type: string) => string;
    setData?: (type: string, value: string) => void;
  } = {}
): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'clientX', { value: options.clientX ?? 0 });
  Object.defineProperty(event, 'clientY', { value: options.clientY ?? 0 });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: options.types || [],
      effectAllowed: 'move',
      dropEffect: 'move',
      getData: options.getData || (() => ''),
      setData: options.setData || jest.fn()
    }
  });
  return event;
}

function createPointerEvent(
  type: string,
  options: {
    button?: number;
    clientX?: number;
    clientY?: number;
    pointerId?: number;
  } = {}
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperty(event, 'button', { value: options.button ?? 0 });
  Object.defineProperty(event, 'clientX', { value: options.clientX ?? 0 });
  Object.defineProperty(event, 'clientY', { value: options.clientY ?? 0 });
  Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 });
  return event;
}
