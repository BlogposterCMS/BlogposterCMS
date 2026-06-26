/**
 * @jest-environment jsdom
 */
import { init as initCanvasGrid } from '../ui/runtime/main/canvasGrid';

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

  it('treats full-size widgets as exclusive full-row collision areas', () => {
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

    const full = document.createElement('div');
    full.className = 'canvas-item';
    full.dataset.instanceId = 'full';
    full.dataset.widgetSizeSlot = 'full';
    full.dataset.x = '0';
    full.dataset.y = '0';
    full.setAttribute('gs-w', '8');
    full.setAttribute('gs-h', '10');
    gridEl.appendChild(full);
    grid.makeWidget(full);

    const adjacent = document.createElement('div');
    adjacent.className = 'canvas-item';
    adjacent.dataset.instanceId = 'adjacent';
    adjacent.dataset.x = '8';
    adjacent.dataset.y = '0';
    adjacent.setAttribute('gs-w', '4');
    adjacent.setAttribute('gs-h', '4');
    gridEl.appendChild(adjacent);
    grid.makeWidget(adjacent);

    expect(adjacent.dataset.x).toBe('8');
    expect(adjacent.dataset.y).toBe('10');
  });

  it('preserves persisted percent height during edit refreshes and width-only updates', () => {
    document.body.innerHTML = '';
    const gridEl = document.createElement('div');
    gridEl.className = 'canvas-grid';
    Object.defineProperty(gridEl, 'clientWidth', { value: 1200, configurable: true });
    Object.defineProperty(gridEl, 'clientHeight', { value: 100, configurable: true });
    document.body.appendChild(gridEl);

    const grid = initCanvasGrid(
      {
        columns: 12,
        columnWidth: 100,
        cellHeight: 10,
        percentageMode: true,
        enableZoom: false,
      },
      gridEl
    );

    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.dataset.instanceId = 'stats';
    widget.dataset.x = '0';
    widget.dataset.y = '0';
    widget.dataset.xPercent = '5';
    widget.dataset.yPercent = '7';
    widget.dataset.wPercent = '30';
    widget.dataset.hPercent = '40';
    widget.setAttribute('gs-w', '4');
    widget.setAttribute('gs-h', '2');
    gridEl.appendChild(widget);

    grid.makeWidget(widget);
    grid.update(widget, {}, { silent: true });
    grid.update(widget, { w: 6 }, { silent: true });

    expect(widget.dataset.xPercent).toBe('5');
    expect(widget.dataset.yPercent).toBe('7');
    expect(widget.dataset.wPercent).toBe('50');
    expect(widget.dataset.hPercent).toBe('40');
    expect(widget.style.height).toBe('40%');
  });

  it('can render persisted percentage layouts as pixels against the inner grid area', () => {
    document.body.innerHTML = '';
    const gridEl = document.createElement('div');
    gridEl.className = 'canvas-grid';
    gridEl.style.paddingLeft = '40px';
    gridEl.style.paddingRight = '40px';
    Object.defineProperty(gridEl, 'clientWidth', { value: 1280, configurable: true });
    Object.defineProperty(gridEl, 'clientHeight', { value: 600, configurable: true });
    document.body.appendChild(gridEl);

    const grid = initCanvasGrid(
      {
        columns: 12,
        columnWidth: 100,
        cellHeight: 1,
        percentageMode: true,
        enableZoom: false,
        renderPercentLayoutAsPixels: true,
      },
      gridEl
    );

    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.dataset.instanceId = 'stats';
    widget.dataset.x = '6';
    widget.dataset.y = '0';
    widget.dataset.xPercent = '50';
    widget.dataset.yPercent = '0';
    widget.dataset.wPercent = '50';
    widget.dataset.hPercent = '160';
    widget.setAttribute('gs-w', '6');
    widget.setAttribute('gs-h', '160');
    gridEl.appendChild(widget);

    grid.makeWidget(widget);

    expect(widget.style.transform).toContain('translate3d(600px, 0px, 0)');
    expect(widget.style.width).toBe('600px');
    expect(widget.style.height).toBe('160px');
    expect(widget.dataset.wPercent).toBe('50');
    expect(widget.dataset.hPercent).toBe('160');
  });
});
