/**
 * @jest-environment jsdom
 */

import { applyWidgetOptions } from '../public/plainspace/main/widgetOptions';

describe('applyWidgetOptions percent sizing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('maps percent metadata to grid units even before metrics resolve', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-item';
    document.body.appendChild(wrapper);

    const metrics = { width: 0, height: 0 };
    const grid = createMockGrid(metrics);

    applyWidgetOptions(wrapper, { width: 50, height: 40 }, grid as unknown as Parameters<typeof applyWidgetOptions>[2]);

    expect(grid.refreshMetrics).toHaveBeenCalled();
    expect(grid.update).toHaveBeenCalledTimes(1);
    expect(wrapper.getAttribute('gs-w')).toBe('6');
    expect(wrapper.getAttribute('gs-h')).toBe('16');

    grid.update.mockClear();
    metrics.width = 1200;
    metrics.height = 800;

    jest.advanceTimersByTime(40);

    expect(grid.update).toHaveBeenCalledTimes(1);
    expect(wrapper.getAttribute('gs-w')).toBe('6');
    expect(wrapper.getAttribute('gs-h')).toBe('16');
  });
});

function createMockGrid(metrics: { width: number; height: number }) {
  const el = document.createElement('div');
  el.id = 'mock-grid';
  Object.defineProperty(el, 'clientWidth', { value: 1200, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 800, configurable: true });

  const refreshMetrics = jest.fn(() => ({ width: metrics.width, height: metrics.height }));
  const update = jest.fn((element: HTMLElement, opts: { w?: number; h?: number } = {}) => {
    if (typeof opts.w === 'number') {
      element.setAttribute('gs-w', String(opts.w));
    }
    if (typeof opts.h === 'number') {
      element.setAttribute('gs-h', String(opts.h));
    }
  });

  return {
    el,
    options: { columns: Infinity, rows: Infinity, columnWidth: 100, cellHeight: 20 },
    refreshMetrics,
    update
  };
}
