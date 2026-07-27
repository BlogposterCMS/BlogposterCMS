/**
 * @jest-environment jsdom
 */

import {
  bindLayoutWidgetSelection,
  layoutWidgetSelectionTarget,
  syncLayoutSurfaceInteractions
} from '../ui/designer/app/managers/layoutInteractionMode';
import { CanvasGrid } from '../ui/shared/grid/canvasGrid';

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

function surfaceWithWidget(mode = 'free', layer = '1') {
  const surface = document.createElement('section');
  surface.className = 'layout-grid-surface';
  surface.dataset.layoutMode = mode;
  const widget = document.createElement('div');
  widget.className = 'canvas-item';
  widget.dataset.layer = layer;
  surface.appendChild(widget);
  return { surface, widget };
}

describe('Designer layout surface interaction modes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverMock;
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };
    (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = jest.fn();
  });

  it('removes temporary Auto/Grid locks immediately when returning to Free', () => {
    const { surface, widget } = surfaceWithWidget('stack');

    syncLayoutSurfaceInteractions([{ surface }], 1);
    expect(widget.getAttribute('gs-no-move')).toBe('true');
    expect(widget.getAttribute('gs-no-resize')).toBe('true');
    expect(widget.classList.contains('auto-layout-item')).toBe(true);

    surface.dataset.layoutMode = 'free';
    syncLayoutSurfaceInteractions([{ surface }], 1);

    expect(widget.hasAttribute('gs-no-move')).toBe(false);
    expect(widget.hasAttribute('gs-no-resize')).toBe(false);
    expect(widget.classList.contains('auto-layout-item')).toBe(false);
  });

  it('preserves explicit locks and inactive-layer editing boundaries', () => {
    const { surface, widget } = surfaceWithWidget('free', '2');
    widget.setAttribute('contenteditable', 'true');

    syncLayoutSurfaceInteractions([{ surface }], 1);
    expect(widget.classList.contains('inactive-layer')).toBe(true);
    expect(widget.getAttribute('contenteditable')).toBe('false');

    widget.dataset.layer = '1';
    widget.setAttribute('gs-locked', 'true');
    syncLayoutSurfaceInteractions([{ surface }], 1);

    expect(widget.classList.contains('inactive-layer')).toBe(false);
    expect(widget.getAttribute('contenteditable')).toBe('true');
    expect(widget.getAttribute('gs-no-move')).toBe('true');
    expect(widget.getAttribute('gs-no-resize')).toBe('true');
  });

  it('treats a nested Container as an active parent-grid item', () => {
    const { surface, widget: container } = surfaceWithWidget('free', '0');
    container.classList.add('layout-grid-container');

    syncLayoutSurfaceInteractions([{ surface }], 1);

    expect(container.classList.contains('inactive-layer')).toBe(false);
    expect(container.hasAttribute('gs-no-move')).toBe(false);
    expect(container.hasAttribute('gs-no-resize')).toBe(false);
  });

  it('restores real CanvasGrid dragging after a surface returns to Free', () => {
    const surface = document.createElement('section');
    surface.className = 'layout-grid-surface';
    surface.dataset.layoutMode = 'stack';
    Object.defineProperty(surface, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(surface, 'clientHeight', { configurable: true, value: 240 });
    document.body.appendChild(surface);

    const grid = new CanvasGrid({
      cellHeight: 1,
      columnWidth: 1,
      columns: 320,
      enableZoom: false,
      objectSnapGuides: false,
      pixelColumns: true,
      useBoundingBox: false
    }, surface);
    const widget = grid.addWidget({ x: 0, y: 0, w: 80, h: 40 });
    widget.dataset.layer = '1';

    syncLayoutSurfaceInteractions([{ surface }], 1);
    widget.dispatchEvent(pointerEvent('pointerdown', 0, 0));
    document.dispatchEvent(pointerEvent('pointermove', 24, 18));
    document.dispatchEvent(pointerEvent('pointerup', 24, 18));
    expect(widget.dataset.x).toBe('0');
    expect(widget.dataset.y).toBe('0');

    surface.dataset.layoutMode = 'free';
    syncLayoutSurfaceInteractions([{ surface }], 1);
    widget.dispatchEvent(pointerEvent('pointerdown', 0, 0));
    document.dispatchEvent(pointerEvent('pointermove', 24, 18));
    document.dispatchEvent(pointerEvent('pointerup', 24, 18));

    expect(widget.dataset.x).toBe('24');
    expect(widget.dataset.y).toBe('18');
    expect(widget.style.transform).toBe('translate3d(24px, 18px, 0)');
  });

  it.each(['stack', 'row', 'grid'])(
    'keeps active-layer widgets selectable while %s owns placement',
    mode => {
      const root = document.createElement('main');
      const { surface, widget } = surfaceWithWidget(mode, '1');
      const content = document.createElement('span');
      widget.appendChild(content);
      root.appendChild(surface);
      document.body.appendChild(root);
      const onSelect = jest.fn();

      syncLayoutSurfaceInteractions([{ surface }], 1);
      expect(widget.getAttribute('gs-no-move')).toBe('true');
      expect(layoutWidgetSelectionTarget({ target: content }, 1)).toBe(widget);

      const unbind = bindLayoutWidgetSelection({
        layoutRoot: root,
        getActiveLayer: () => 1,
        onSelect
      });
      content.dispatchEvent(pointerEvent('pointerdown', 12, 12));

      expect(onSelect).toHaveBeenCalledWith(widget, expect.any(MouseEvent));
      unbind();
    }
  );

  it('keeps inactive-layer widgets outside the shared selection path', () => {
    const { surface, widget } = surfaceWithWidget('grid', '2');
    const content = document.createElement('span');
    widget.appendChild(content);
    document.body.appendChild(surface);

    syncLayoutSurfaceInteractions([{ surface }], 1);

    expect(layoutWidgetSelectionTarget({ target: content }, 1)).toBeNull();
  });
});
