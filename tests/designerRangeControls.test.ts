import {
  normalizeSceneRange,
  rangeFromPointer
} from '../ui/designer/app/renderer/sceneRangeControls';

describe('designer scene range controls', () => {
  it('normalizes reversed ranges and keeps a usable gap', () => {
    expect(normalizeSceneRange(70, 20)).toEqual({ start: 20, end: 70 });
    expect(normalizeSceneRange(100, 100)).toEqual({ start: 99, end: 100 });
  });

  it('maps pointer movement to the dragged range handle', () => {
    const rect = { left: 100, width: 200 } as DOMRect;

    expect(rangeFromPointer(180, rect, 'start', { start: 10, end: 60 })).toEqual({
      start: 40,
      end: 60
    });
    expect(rangeFromPointer(150, rect, 'end', { start: 40, end: 80 })).toEqual({
      start: 40,
      end: 41
    });
  });

  it('supports compact effect lanes without letting handles cross', () => {
    const rect = { left: 20, width: 160 } as DOMRect;

    expect(rangeFromPointer(24, rect, 'end', { start: 30, end: 70 })).toEqual({
      start: 30,
      end: 31
    });
    expect(rangeFromPointer(200, rect, 'start', { start: 20, end: 80 })).toEqual({
      start: 79,
      end: 80
    });
  });
});
