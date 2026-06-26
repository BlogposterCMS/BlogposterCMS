/**
 * @jest-environment jsdom
 */

import {
  coercePercent,
  computePercentUpdate,
  heightOptionToUnits,
  metricsReady,
  percentToUnits,
  schedulePercentReplay,
  type GridLike
} from '../ui/widgets/options/widgetPercentSizing';

describe('widgetPercentSizing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('coerces percent inputs and maps percentages to grid units', () => {
    expect(coercePercent(50)).toBe(50);
    expect(coercePercent('33.333')).toBe(33.333);
    expect(coercePercent('')).toBeNull();
    expect(coercePercent('nope')).toBeNull();
    expect(percentToUnits(50, 12)).toBe(6);
    expect(percentToUnits(40, 40)).toBe(16);
    expect(percentToUnits(25, 0)).toBe(1);
    expect(heightOptionToUnits(25, 40)).toBe(10);
    expect(heightOptionToUnits(160, 40)).toBe(160);
  });

  it('computes percent updates from configured columns and percent rows', () => {
    const grid = createMockGrid({ width: 0, height: 0 }, {
      columns: 16,
      percentRows: 20,
      columnWidth: 100,
      cellHeight: 20
    });

    expect(computePercentUpdate(grid, 50, 25)).toEqual({ w: 8, h: 5 });
  });

  it('keeps compact widget heights above 100 as absolute grid rows', () => {
    const grid = createMockGrid({ width: 1200, height: 800 }, {
      columns: 12,
      rows: 80,
      columnWidth: 100,
      cellHeight: 10
    });

    expect(computePercentUpdate(grid, 50, 160)).toEqual({ w: 6, h: 160 });
  });

  it('falls back to measured dimensions when explicit grid counts are not finite', () => {
    const grid = createMockGrid({ width: 1200, height: 800 }, {
      columns: Infinity,
      rows: Infinity,
      columnWidth: 100,
      cellHeight: 20
    });

    expect(computePercentUpdate(grid, 50, 40)).toEqual({ w: 6, h: 16 });
  });

  it('replays percent sizing once metrics become ready', () => {
    const widget = document.createElement('div');
    widget.dataset.wPercent = '50';
    widget.dataset.hPercent = '40';
    document.body.appendChild(widget);

    const metrics = { width: 0, height: 0 };
    const grid = createMockGrid(metrics, {
      columns: Infinity,
      rows: Infinity,
      columnWidth: 100,
      cellHeight: 20
    });

    expect(metricsReady(metrics)).toBe(false);
    schedulePercentReplay(grid, widget);
    expect(grid.update).not.toHaveBeenCalled();

    metrics.width = 1200;
    metrics.height = 800;
    jest.advanceTimersByTime(40);

    expect(grid.update).toHaveBeenCalledWith(widget, { w: 6, h: 16 });
  });
});

function createMockGrid(
  metrics: { width: number; height: number },
  options: GridLike['options']
): GridLike & { update: jest.Mock; refreshMetrics: jest.Mock } {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 1200, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 800, configurable: true });

  const refreshMetrics = jest.fn(() => ({ width: metrics.width, height: metrics.height }));
  const update = jest.fn();

  return {
    el,
    options,
    refreshMetrics,
    update
  };
}
