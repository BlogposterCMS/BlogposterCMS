/**
 * @jest-environment jsdom
 */

import { resolveObjectSnap } from '../ui/shared/grid/snapGuides';
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

describe('CanvasGrid object snap guides', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverMock;
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };
    (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = jest.fn();
  });

  it('snaps a moving object edge to the object below and returns a horizontal guide', () => {
    const result = resolveObjectSnap(
      { id: 'active', x: 2, y: 96, w: 4, h: 2 },
      [{ id: 'below', x: 1, y: 100, w: 6, h: 3 }],
      { tolerance: 6, step: { x: 1, y: 1 } }
    );

    expect(result).toMatchObject({
      x: 2,
      y: 98,
      snapped: true
    });
    const horizontalGuide = result.guides.find(guide => guide.axis === 'y');

    expect(horizontalGuide).toMatchObject({
      axis: 'y',
      position: 100,
      sourceId: 'below',
      sourceKind: 'start',
      targetKind: 'end',
      spanStart: 1,
      spanEnd: 7
    });
  });

  it('ignores objects outside the snap tolerance', () => {
    const result = resolveObjectSnap(
      { id: 'active', x: 0, y: 0, w: 4, h: 4 },
      [{ id: 'far', x: 30, y: 40, w: 4, h: 4 }],
      { tolerance: 4, step: { x: 1, y: 1 } }
    );

    expect(result.snapped).toBe(false);
    expect(result.guides).toEqual([]);
    expect(result.y).toBe(0);
  });

  it('does not advertise a guide that would commit to a non-grid position', () => {
    const result = resolveObjectSnap(
      { id: 'active', x: 0, y: 0, w: 2, h: 2 },
      [{ id: 'half-column', x: 3.5, y: 20, w: 2, h: 2 }],
      { tolerance: 4, step: { x: 1, y: 1 } }
    );

    expect(result.x).toBe(0);
    expect(result.guides).toEqual([]);
  });

  it('snaps a moving object to match the spacing between two neighbors', () => {
    const result = resolveObjectSnap(
      { id: 'active', x: 98, y: 0, w: 10, h: 10 },
      [
        { id: 'left', x: 0, y: 0, w: 20, h: 10 },
        { id: 'right', x: 50, y: 0, w: 20, h: 10 }
      ],
      { tolerance: 6, step: { x: 1, y: 1 } }
    );

    expect(result).toMatchObject({
      x: 100,
      y: 0,
      snapped: true
    });
    const spacingGuide = result.guides.find(guide => guide.kind === 'spacing');
    expect(spacingGuide).toMatchObject({
      axis: 'x',
      kind: 'spacing',
      spacing: 30,
      sourceId: 'right',
      secondarySourceId: 'left',
      sourceKind: 'end',
      targetKind: 'start'
    });
  });

  it('keeps the live drag transform under the pointer while committing object snap on release', () => {
    const canvas = document.createElement('div');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 120 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 120 });
    document.body.appendChild(canvas);

    const grid = new CanvasGrid({
      cellHeight: 1,
      columnWidth: 1,
      columns: 120,
      enableZoom: false,
      objectSnapGuides: true,
      objectSnapTolerance: 6,
      useBoundingBox: false
    }, canvas);

    const active = grid.addWidget({ x: 0, y: 0, w: 10, h: 10 });
    active.dataset.instanceId = 'active';
    const below = grid.addWidget({ x: 0, y: 30, w: 10, h: 10 });
    below.dataset.instanceId = 'below';

    active.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    document.dispatchEvent(pointerEvent('pointermove', 10, 26));

    expect(active.style.transform).toBe('translate3d(0px, 16px, 0)');
    expect(active.dataset.y).toBe('20');
    expect(canvas.querySelectorAll('.canvas-snap-guide').length).toBeGreaterThan(0);

    document.dispatchEvent(pointerEvent('pointerup', 10, 26));

    expect(active.dataset.y).toBe('20');
    expect(active.style.transform).toBe('translate3d(0px, 20px, 0)');
    expect(canvas.querySelectorAll('.canvas-snap-guide')).toHaveLength(0);
  });

  it('moves widgets in 1px units when pixelColumns is enabled', () => {
    const canvas = document.createElement('div');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 120 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 80 });
    document.body.appendChild(canvas);

    const grid = new CanvasGrid({
      cellHeight: 1,
      columnWidth: 1,
      columns: 120,
      enableZoom: false,
      objectSnapGuides: false,
      pixelColumns: true,
      useBoundingBox: false
    }, canvas);

    const active = grid.addWidget({ x: 0, y: 0, w: 10, h: 10 });

    active.dispatchEvent(pointerEvent('pointerdown', 0, 0));
    document.dispatchEvent(pointerEvent('pointermove', 17, 13));

    expect(active.dataset.x).toBe('17');
    expect(active.dataset.y).toBe('13');
    expect(active.style.transform).toBe('translate3d(17px, 13px, 0)');

    document.dispatchEvent(pointerEvent('pointerup', 17, 13));

    expect(active.dataset.x).toBe('17');
    expect(active.dataset.y).toBe('13');
  });

  it('resizes widgets in 1px units when pixelColumns is enabled', () => {
    const canvas = document.createElement('div');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 120 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 80 });
    document.body.appendChild(canvas);

    const grid = new CanvasGrid({
      cellHeight: 1,
      columnWidth: 1,
      columns: 120,
      enableZoom: false,
      objectSnapGuides: false,
      percentageMode: true,
      pixelColumns: true,
      useBoundingBox: false
    }, canvas);

    const active = grid.addWidget({ x: 0, y: 0, w: 10, h: 10 });
    const handle = active.querySelector<HTMLElement>('.resize-handle');
    expect(handle).not.toBeNull();

    handle?.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    document.dispatchEvent(pointerEvent('pointermove', 27, 23));

    expect(active.style.width).toBe('27px');
    expect(active.style.height).toBe('23px');

    document.dispatchEvent(pointerEvent('pointerup', 27, 23));

    expect(active.getAttribute('gs-w')).toBe('27');
    expect(active.getAttribute('gs-h')).toBe('23');
    expect(active.dataset.wPercent).toBe('22.5');
  });

  it('snaps to the canvas center without requiring a visible column grid', () => {
    const canvas = document.createElement('div');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 120 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 80 });
    document.body.appendChild(canvas);

    const grid = new CanvasGrid({
      cellHeight: 1,
      columnWidth: 1,
      columns: 120,
      enableZoom: false,
      objectSnapGuides: true,
      canvasSnapGuides: true,
      objectSnapTolerance: 6,
      useBoundingBox: false
    }, canvas);

    const active = grid.addWidget({ x: 0, y: 0, w: 20, h: 10 });
    active.dataset.instanceId = 'active';

    const snap = (grid as any)._resolveObjectSnap(active, 49, 0);
    const centerGuide = snap.guides.find((guide: { axis: string; sourceId: string }) => (
      guide.axis === 'x' && guide.sourceId === 'canvas'
    ));

    expect(snap.targetX).toBe(50);
    expect(centerGuide).toMatchObject({
      axis: 'x',
      position: 60,
      sourceKind: 'center',
      targetKind: 'center'
    });
  });

  it('renders spacing guides with distance metadata', () => {
    const canvas = document.createElement('div');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 140 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 80 });
    document.body.appendChild(canvas);

    const grid = new CanvasGrid({
      cellHeight: 1,
      columnWidth: 1,
      columns: 140,
      enableZoom: false,
      objectSnapGuides: true,
      objectSnapTolerance: 6,
      useBoundingBox: false
    }, canvas);

    const left = grid.addWidget({ x: 0, y: 0, w: 20, h: 10 });
    left.dataset.instanceId = 'left';
    const right = grid.addWidget({ x: 50, y: 0, w: 20, h: 10 });
    right.dataset.instanceId = 'right';
    const active = grid.addWidget({ x: 98, y: 0, w: 10, h: 10 });
    active.dataset.instanceId = 'active';

    const snap = (grid as any)._resolveObjectSnap(active, 98, 0);
    (grid as any)._renderSnapGuides(snap.guides);

    const guide = canvas.querySelector<HTMLElement>('.canvas-snap-guide[data-snap-guide="spacing"]');
    expect(guide?.dataset.snapGuideKind).toBe('spacing');
    expect(guide?.dataset.snapGuideSource).toBe('right');
    expect(guide?.dataset.snapGuideSecondarySource).toBe('left');
    expect(guide?.dataset.snapGuideSpacing).toBe('30');
  });
});
