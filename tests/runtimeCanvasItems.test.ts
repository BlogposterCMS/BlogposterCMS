/**
 * @jest-environment jsdom
 */

import {
  createRuntimeCanvasItem,
  mountRuntimeCanvasContent,
  resolveRuntimeCanvasRect
} from '../ui/runtime/main/runtimeCanvasItems';

describe('runtimeCanvasItems', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates canvas wrappers with grid attributes, widget identity, and placeholders', () => {
    const { wrapper, placeholder } = createRuntimeCanvasItem({
      def: { id: 'hero', metadata: { label: 'Hero block' } },
      item: {
        id: 'hero-1',
        scene_id: 'scene-hero',
        sceneTitle: 'Hero'
      },
      x: 2,
      y: 3,
      w: 4,
      h: 5,
      minW: 1,
      minH: 2
    });

    expect(wrapper.classList.contains('canvas-item')).toBe(true);
    expect(wrapper.classList.contains('loading')).toBe(true);
    expect(wrapper.dataset.x).toBe('2');
    expect(wrapper.dataset.y).toBe('3');
    expect(wrapper.getAttribute('gs-w')).toBe('4');
    expect(wrapper.getAttribute('gs-h')).toBe('5');
    expect(wrapper.getAttribute('gs-min-w')).toBe('1');
    expect(wrapper.getAttribute('gs-min-h')).toBe('2');
    expect(wrapper.dataset.widgetId).toBe('hero');
    expect(wrapper.dataset.instanceId).toBe('hero-1');
    expect(wrapper.dataset.widgetHydrationState).toBe('shell');
    expect(wrapper.getAttribute('aria-busy')).toBe('true');
    expect(wrapper.dataset.sceneId).toBe('scene-hero');
    expect(wrapper.dataset.sceneTitle).toBe('Hero');
    expect(placeholder.className).toBe('widget-placeholder');
    expect(placeholder.textContent).toBe('Hero block');
    expect(placeholder.dataset.widgetHydrationState).toBe('shell');
    expect(placeholder.getAttribute('role')).toBe('status');
    expect(wrapper.firstElementChild).toBe(placeholder);
  });

  it('marks the supported widget size slot declared by the widget contract', () => {
    const { wrapper: wideWrapper } = createRuntimeCanvasItem({
      def: {
        id: 'stats',
        metadata: {
          layout: {
            supportedSlots: [
              { name: 'compact', minCols: 4, maxCols: 5, minRows: 8 },
              { name: 'wide', minCols: 6, maxCols: 12, minRows: 10 }
            ],
            heightMode: 'scroll'
          }
        }
      },
      item: { id: 'stats-1' },
      x: 0,
      y: 0,
      w: 8,
      h: 12
    });
    const { wrapper: unsupportedWrapper } = createRuntimeCanvasItem({
      def: {
        id: 'tiny',
        layout: {
          supportedSlots: [{ name: 'wide', minCols: 6, minRows: 10 }]
        }
      },
      item: { id: 'tiny-1' },
      x: 0,
      y: 0,
      w: 3,
      h: 4
    });

    expect(wideWrapper.dataset.widgetSizeSlot).toBe('wide');
    expect(wideWrapper.dataset.widgetHeightMode).toBe('scroll');
    expect(wideWrapper.dataset.widgetSizeError).toBeUndefined();
    expect(unsupportedWrapper.dataset.widgetSizeSlot).toBe('unsupported');
    expect(unsupportedWrapper.dataset.widgetSizeError).toBe('WIDGET_SIZE_UNSUPPORTED');
  });

  it('marks full-size widgets for page-level height handling', () => {
    const { wrapper } = createRuntimeCanvasItem({
      def: {
        id: 'full-report',
        metadata: {
          layout: {
            supportedSlots: [{ name: 'full', minCols: 12, maxCols: 12 }],
            heightMode: 'scroll'
          }
        }
      },
      item: { id: 'full-report-1' },
      x: 0,
      y: 0,
      w: 12,
      h: 40
    });

    expect(wrapper.dataset.widgetSizeSlot).toBe('full');
    expect(wrapper.dataset.widgetHeightMode).toBe('auto');
  });

  it('copies percent, layer, rotation, and opacity metadata when requested', () => {
    const { wrapper } = createRuntimeCanvasItem({
      def: { id: 'stats' },
      item: {
        id: 'stats-1',
        xPercent: 10,
        yPercent: '20',
        wPercent: 30,
        hPercent: '40',
        layer: '5',
        zIndex: '9',
        rotation_deg: '12.5',
        opacity: '45'
      },
      x: 1,
      y: 2,
      w: 3,
      h: 4,
      includeLayoutMetadata: true
    });

    expect(wrapper.dataset.xPercent).toBe('10');
    expect(wrapper.dataset.yPercent).toBe('20');
    expect(wrapper.dataset.wPercent).toBe('30');
    expect(wrapper.dataset.hPercent).toBe('40');
    expect(wrapper.dataset.layer).toBe('5');
    expect(wrapper.dataset.rotationDeg).toBe('12.5');
    expect(wrapper.style.opacity).toBe('0.45');
  });

  it('resolves percent layout items against grid columns and rows', () => {
    expect(resolveRuntimeCanvasRect(
      {
        xPercent: 25,
        yPercent: '50',
        wPercent: 33,
        hPercent: '10'
      },
      { scaleX: 12, scaleY: 100 }
    )).toEqual({
      x: 3,
      y: 50,
      w: 4,
      h: 10
    });
  });

  it('keeps admin heights above the percent range as absolute rows', () => {
    expect(resolveRuntimeCanvasRect(
      {
        xPercent: 50,
        yPercent: 160,
        wPercent: 50,
        hPercent: 160
      },
      {
        scaleX: 12,
        scaleY: 900,
        heightProjectionMode: 'absoluteRowsAbovePercentRange'
      }
    )).toEqual({
      x: 6,
      y: 160,
      w: 6,
      h: 160
    });
  });

  it('resolves static-grid percent layout items with precomputed scales', () => {
    expect(resolveRuntimeCanvasRect(
      {
        xPercent: 10,
        yPercent: 20,
        wPercent: 0,
        hPercent: 'bad',
        x: 9,
        w: 9
      },
      {
        scaleX: 8,
        scaleY: 6,
        percentDivisor: 1
      }
    )).toEqual({
      x: 80,
      y: 120,
      w: 1,
      h: 1
    });
  });

  it('keeps absolute coordinates and configurable defaults when percentages are absent', () => {
    expect(resolveRuntimeCanvasRect(
      {
        x: '2',
        y: 3
      },
      {
        scaleX: 12,
        scaleY: 100,
        defaultW: 6,
        defaultH: 20
      }
    )).toEqual({
      x: '2',
      y: 3,
      w: 6,
      h: 20
    });
  });

  it('normalizes full-only widgets to the full grid width before slot validation', () => {
    const def = {
      id: 'full-report',
      metadata: {
        layout: {
          supportedSlots: [{ name: 'full', minCols: 12, maxCols: 12 }]
        }
      }
    };
    const rect = resolveRuntimeCanvasRect(
      {
        x: 4,
        y: 2,
        w: 8,
        h: 10
      },
      {
        scaleX: 12,
        scaleY: 100,
        def
      }
    );
    const { wrapper } = createRuntimeCanvasItem({
      def,
      item: { id: 'full-report-1' },
      ...rect
    });

    expect(rect).toEqual({
      x: 0,
      y: 2,
      w: 12,
      h: 10
    });
    expect(wrapper.dataset.widgetSizeSlot).toBe('full');
    expect(wrapper.dataset.widgetSizeError).toBeUndefined();
  });

  it('keeps dynamic public wrappers free of layout-only metadata by default', () => {
    const { wrapper } = createRuntimeCanvasItem({
      def: { id: 'text' },
      item: {
        id: 'text-1',
        xPercent: 10,
        zIndex: 4,
        rotationDeg: 9
      },
      x: 1,
      y: 1,
      w: 6,
      h: 4
    });

    expect(wrapper.dataset.xPercent).toBeUndefined();
    expect(wrapper.dataset.layer).toBeUndefined();
    expect(wrapper.dataset.rotationDeg).toBeUndefined();
  });

  it('mounts content, removes placeholders, and applies item appearance', () => {
    const { wrapper, placeholder } = createRuntimeCanvasItem({
      def: { id: 'card' },
      item: {
        id: 'card-1',
        opacity: 50,
        radius: 8
      },
      x: 0,
      y: 0,
      w: 8,
      h: 4
    });

    const content = mountRuntimeCanvasContent(wrapper, placeholder);

    expect(content.className).toBe('canvas-item-content');
    expect(wrapper.contains(placeholder)).toBe(false);
    expect(wrapper.lastElementChild).toBe(content);
    expect(wrapper.style.opacity).toBe('0.5');
    expect(content.style.borderRadius).toBe('8px');
  });
});
