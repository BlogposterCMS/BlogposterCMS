/**
 * @jest-environment jsdom
 */
import { init as initCanvasGrid } from '../public/plainspace/main/canvasGrid.ts';

type ObserverCallback = (entries: unknown[], observer: unknown) => void;

class ResizeObserverMock {
  callback: ObserverCallback;

  constructor(callback: ObserverCallback) {
    this.callback = callback;
  }

  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

describe('Plainspace canvas hydration', () => {
  beforeAll(() => {
    // jsdom does not ship ResizeObserver; provide a lightweight stub.
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverMock;
  });

  it('resolves overlapping seeds into unique, gap-free slots', () => {
    document.body.innerHTML = '';
    const gridEl = document.createElement('div');
    gridEl.className = 'canvas-grid';
    document.body.appendChild(gridEl);

    const grid = initCanvasGrid(
      {
        columns: 12,
        columnWidth: 1,
        cellHeight: 1,
        pushOnOverlap: true,
        percentageMode: false,
      },
      gridEl
    );

    const seeds = [
      { id: 'a', w: 4, h: 10 },
      { id: 'b', w: 4, h: 10 },
      { id: 'c', w: 4, h: 10 },
      { id: 'd', w: 6, h: 8 },
    ];

    seeds.forEach(seed => {
      const el = document.createElement('div');
      el.className = 'canvas-item';
      el.dataset.instanceId = seed.id;
      el.dataset.x = '0';
      el.dataset.y = '0';
      el.setAttribute('gs-w', String(seed.w));
      el.setAttribute('gs-h', String(seed.h));
      gridEl.appendChild(el);
      grid.makeWidget(el);
    });

    const coords = grid.widgets.map(widget => ({
      id: widget.dataset.instanceId,
      x: Number(widget.dataset.x || 0),
      y: Number(widget.dataset.y || 0),
      w: Number(widget.getAttribute('gs-w') || 0),
      h: Number(widget.getAttribute('gs-h') || 0),
    }));

    const uniqueKeys = new Set(coords.map(({ x, y }) => `${x},${y}`));
    expect(uniqueKeys.size).toBe(coords.length);

    const sorted = coords.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    expect(sorted.map(({ x, y }) => `${x},${y}`)).toEqual([
      '0,0',
      '4,0',
      '8,0',
      '0,10',
    ]);

    const gridWidth = 12;
    const occupied = new Set<string>();
    sorted.forEach(({ x, y, w, h }) => {
      for (let yy = y; yy < y + h; yy += 1) {
        for (let xx = x; xx < x + w; xx += 1) {
          occupied.add(`${xx},${yy}`);
        }
      }
    });

    const maxY = Math.max(...sorted.map(({ y, h }) => y + h));
    for (let y = 0; y < maxY; y += 1) {
      let min = Infinity;
      let max = -1;
      for (let x = 0; x < gridWidth; x += 1) {
        if (occupied.has(`${x},${y}`)) {
          if (min === Infinity) min = x;
          max = x;
        }
      }
      if (min !== Infinity) {
        for (let x = min; x <= max; x += 1) {
          expect(occupied.has(`${x},${y}`)).toBe(true);
        }
      }
    }
  });

  it('keeps pushed widgets near the collision origin even when earlier gaps exist', () => {
    document.body.innerHTML = '';
    const gridEl = document.createElement('div');
    gridEl.className = 'canvas-grid';
    document.body.appendChild(gridEl);

    const grid = initCanvasGrid(
      {
        columns: 12,
        columnWidth: 1,
        cellHeight: 1,
        pushOnOverlap: true,
        percentageMode: false,
      },
      gridEl
    );

    const target = document.createElement('div');
    target.className = 'canvas-item';
    target.dataset.instanceId = 'target';
    target.dataset.x = '0';
    target.dataset.y = '20';
    target.setAttribute('gs-w', '4');
    target.setAttribute('gs-h', '6');
    gridEl.appendChild(target);
    grid.makeWidget(target);

    const active = document.createElement('div');
    active.className = 'canvas-item';
    active.dataset.instanceId = 'active';
    active.dataset.x = '0';
    active.dataset.y = '0';
    active.setAttribute('gs-w', '4');
    active.setAttribute('gs-h', '10');
    gridEl.appendChild(active);
    grid.makeWidget(active);

    grid.update(active, { y: 15 }, { silent: true });

    expect(target.dataset.y).toBe('25');
    expect(target.dataset.x).toBe('0');
  });
});
