/**
 * @jest-environment jsdom
 */

import { mountRuntimeGridWidgets } from '../ui/runtime/main/runtimeGridWidgetMounting';
import { renderRuntimeCanvasWidget } from '../ui/runtime/main/runtimeWidgetMounting';

jest.mock('../ui/runtime/main/runtimeWidgetMounting', () => ({
  renderRuntimeCanvasWidget: jest.fn()
}));

describe('runtimeGridWidgetMounting', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    (renderRuntimeCanvasWidget as jest.Mock).mockResolvedValue(undefined);
  });

  it('projects layout items, skips unknown widgets, and mounts runtime widgets', async () => {
    const gridEl = document.createElement('section');
    const grid = {
      widgets: [] as HTMLElement[],
      makeWidget: jest.fn((el: HTMLElement) => {
        grid.widgets.push(el);
      })
    };
    const emit = jest.fn().mockResolvedValue(undefined);

    await mountRuntimeGridWidgets({
      gridEl,
      grid,
      layout: [
        {
          id: 'hero-1',
          widgetId: 'hero',
          xPercent: 10,
          yPercent: 20,
          wPercent: 30,
          hPercent: 40
        },
        {
          id: 'missing-1',
          widgetId: 'missing'
        }
      ],
      allWidgets: [{ id: 'hero', metadata: { label: 'Hero' } }],
      lane: 'public',
      widgetEmit: emit,
      scaleX: 2,
      scaleY: 2,
      percentDivisor: 1,
      includeLayoutMetadata: true,
      deferHydration: false
    });

    const wrapper = gridEl.querySelector<HTMLElement>('.canvas-item');
    expect(grid.makeWidget).toHaveBeenCalledTimes(1);
    expect(wrapper?.dataset.widgetId).toBe('hero');
    expect(wrapper?.dataset.instanceId).toBe('hero-1');
    expect(wrapper?.dataset.x).toBe('20');
    expect(wrapper?.dataset.y).toBe('40');
    expect(wrapper?.getAttribute('gs-w')).toBe('60');
    expect(wrapper?.getAttribute('gs-h')).toBe('80');
    expect(wrapper?.dataset.xPercent).toBe('10');
    expect(renderRuntimeCanvasWidget).toHaveBeenCalledWith(expect.objectContaining({
      wrapper,
      lane: 'public',
      emit
    }));
  });

  it('mounts stable widget shells before deferred hydration starts', async () => {
    jest.useFakeTimers();
    const originalRaf = window.requestAnimationFrame;
    let rafCallback: FrameRequestCallback | null = null;
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: jest.fn((callback: FrameRequestCallback) => {
        rafCallback = callback;
        return 1;
      })
    });

    const gridEl = document.createElement('section');
    const grid = {
      widgets: [] as HTMLElement[],
      makeWidget: jest.fn((el: HTMLElement) => {
        grid.widgets.push(el);
      })
    };

    try {
      const pending = mountRuntimeGridWidgets({
        gridEl,
        grid,
        layout: [{ id: 'hero-1', widgetId: 'hero', x: 0, y: 0, w: 8, h: 12 }],
        allWidgets: [{ id: 'hero', metadata: { label: 'Hero' } }],
        lane: 'public',
        widgetEmit: jest.fn().mockResolvedValue(undefined),
        scaleX: 12,
        scaleY: 12
      });

      await Promise.resolve();

      const wrapper = gridEl.querySelector<HTMLElement>('.canvas-item');
      expect(wrapper).not.toBeNull();
      expect(wrapper?.dataset.widgetHydrationState).toBe('shell');
      expect(renderRuntimeCanvasWidget).not.toHaveBeenCalled();

      rafCallback?.(0);
      jest.runOnlyPendingTimers();
      await pending;

      expect(renderRuntimeCanvasWidget).toHaveBeenCalledWith(expect.objectContaining({
        wrapper,
        lane: 'public'
      }));
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        value: originalRaf
      });
      jest.useRealTimers();
    }
  });
});
