/**
 * @jest-environment jsdom
 */

jest.mock('/ui/runtime/main/canvasGrid.js', () => ({
  init: jest.fn()
}));

import { getCurrentLayout, initGrid } from '../ui/designer/app/managers/gridManager';

const { init: initCanvasGrid } = jest.requireMock('/ui/runtime/main/canvasGrid.js');

class ResizeObserverMock {
  static callbacks: ResizeObserverCallback[] = [];

  constructor(callback: ResizeObserverCallback) {
    ResizeObserverMock.callbacks.push(callback);
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('designer grid manager workarea serialization', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    ResizeObserverMock.callbacks = [];
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverMock;
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };
    (initCanvasGrid as jest.Mock).mockReset();
    (initCanvasGrid as jest.Mock).mockReturnValue({
      options: { columns: 12 },
      widgets: [],
      on: jest.fn(),
      update: jest.fn()
    });
  });

  it('enables CanvasGrid object snap guides for Design Studio placement', () => {
    const gridEl = document.createElement('div');
    const viewportEl = document.createElement('section');
    Object.defineProperty(viewportEl, 'clientWidth', { value: 1280, configurable: true });
    viewportEl.appendChild(gridEl);
    document.body.appendChild(viewportEl);

    initGrid(gridEl, {}, jest.fn(), { enableZoom: false, scrollContainer: viewportEl });

    expect(initCanvasGrid).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: 1280,
        columnWidth: 1,
        objectSnapGuides: true,
        canvasSnapGuides: true,
        objectSnapTolerance: 6,
        pixelColumns: true,
        percentageMode: true,
        renderPercentLayoutAsPixels: true,
        preservePixelWidgetSize: true,
        responsivePlacement: true,
        responsiveViewportWidth: 1280
      }),
      gridEl
    );
  });

  it('persists the nearest layout container id on widget placements', () => {
    const workarea = document.createElement('section');
    workarea.className = 'layout-container';
    workarea.dataset.nodeId = 'hero-workarea';

    const grid = document.createElement('div');
    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.dataset.instanceId = 'w1';
    widget.dataset.widgetId = 'textBox';
    widget.dataset.xPercent = '10';
    widget.dataset.yPercent = '20';
    widget.dataset.wPercent = '30';
    widget.dataset.hPercent = '40';
    widget.dataset.responsivePlacement = JSON.stringify({
      version: 1,
      base: { centerXPercent: 25, yPx: 20, widthPx: 300, heightPx: 120 },
      rules: []
    });
    grid.appendChild(widget);
    workarea.appendChild(grid);
    document.body.appendChild(workarea);

    expect(getCurrentLayout(grid, {})[0]).toMatchObject({
      id: 'w1',
      widgetId: 'textBox',
      workareaId: 'hero-workarea',
      code: {
        meta: {
          workareaId: 'hero-workarea',
          responsivePlacement: expect.objectContaining({
            version: 1,
            base: expect.objectContaining({ widthPx: 300 })
          })
        }
      }
    });
  });

  it('keeps the shared page zoom target content-height driven as Sections are appended', () => {
    const viewport = document.createElement('main');
    const pageRoot = document.createElement('div');
    const section = document.createElement('section');
    pageRoot.appendChild(section);
    viewport.appendChild(pageRoot);
    document.body.appendChild(viewport);
    const syncSizer = jest.fn();
    (initCanvasGrid as jest.Mock).mockReturnValue({
      options: { columns: 1280 },
      widgets: [],
      on: jest.fn(),
      update: jest.fn(),
      _syncSizer: syncSizer
    });

    initGrid(section, {}, jest.fn(), {
      scrollContainer: viewport,
      zoomTarget: pageRoot,
      enableZoom: true,
      dynamicZoomTargetHeight: true
    });

    expect(pageRoot.style.height).toBe('auto');
    expect(pageRoot.dataset.dynamicCanvasHeight).toBe('true');
    expect(syncSizer).toHaveBeenCalled();

    ResizeObserverMock.callbacks.forEach(callback => callback([], {} as ResizeObserver));
    expect(syncSizer.mock.calls.length).toBeGreaterThan(1);
  });
});
