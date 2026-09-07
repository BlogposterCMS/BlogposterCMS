/**
 * @jest-environment jsdom
 */

import {
  mountRuntimeGridWidgets,
  reflowRuntimeGridWidgets
} from '../ui/runtime/main/runtimeGridWidgetMounting';
import { renderRuntimeCanvasWidget } from '../ui/runtime/main/runtimeWidgetMounting';

jest.mock('../ui/runtime/main/runtimeWidgetMounting', () => ({
  renderRuntimeCanvasWidget: jest.fn()
}));

describe('runtimeGridWidgetMounting', () => {
  it('collects public shells for the outer scheduler while admin still hydrates directly', async () => {
    for (const lane of ['public', 'admin']) {
      jest.clearAllMocks();
      const gridEl = document.createElement('section');
      document.body.append(gridEl);
      const publicHydrationJobs: any[] = [];
      await mountRuntimeGridWidgets({
        gridEl, grid: { makeWidget: jest.fn() },
        layout: [{ id: 'one', widgetId: 'hero', x: 0, y: 0, w: 100, h: 100 }],
        allWidgets: [{ id: 'hero' }], lane, widgetEmit: jest.fn(),
        scaleX: 1, scaleY: 1, deferHydration: false, publicHydrationJobs
      });
      expect(publicHydrationJobs).toHaveLength(lane === 'public' ? 1 : 0);
      expect(renderRuntimeCanvasWidget).toHaveBeenCalledTimes(lane === 'public' ? 0 : 1);
      if (lane === 'public') {
        expect(gridEl.querySelector('[aria-busy="true"]')).not.toBeNull();
        await publicHydrationJobs[0].render();
        expect(renderRuntimeCanvasWidget).toHaveBeenCalledTimes(1);
      }
    }
  });
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

  it('reprojects fixed responsive geometry when the runtime canvas width changes', async () => {
    const gridEl = document.createElement('section');
    const grid = {
      widgets: [] as HTMLElement[],
      makeWidget: jest.fn((el: HTMLElement) => grid.widgets.push(el)),
      update: jest.fn(),
      _applyPosition: jest.fn()
    };
    const layout = [{
      id: 'hero-responsive',
      widgetId: 'hero',
      responsivePlacement: {
        version: 1,
        base: {
          centerXPercent: 75,
          yPx: 120,
          widthPx: 427,
          heightPx: 498
        },
        rules: []
      }
    }];

    await mountRuntimeGridWidgets({
      gridEl,
      grid,
      layout,
      allWidgets: [{ id: 'hero', metadata: { label: 'Hero' } }],
      lane: 'public',
      widgetEmit: jest.fn().mockResolvedValue(undefined),
      scaleX: 3.9,
      scaleY: 8,
      percentDivisor: 1,
      deferHydration: false
    });

    const wrapper = gridEl.querySelector<HTMLElement>('.canvas-item')!;
    expect(wrapper.dataset.x).toBe('-18');

    reflowRuntimeGridWidgets({
      gridEl,
      grid,
      scaleX: 12.8,
      scaleY: 8,
      percentDivisor: 1
    });

    expect(wrapper.dataset.x).toBe('747');
    expect(grid._applyPosition).toHaveBeenLastCalledWith(
      wrapper,
      { x: false, y: false, w: false, h: false }
    );
    expect(grid.update).not.toHaveBeenCalled();
  });
});
