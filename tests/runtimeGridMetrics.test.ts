/**
 * @jest-environment jsdom
 */

import {
  DEFAULT_ADMIN_ROWS,
  computeStaticGridMetrics,
  deriveGridSize,
  measureGridMetrics
} from '../ui/runtime/main/runtimeGridMetrics';

describe('runtimeGridMetrics', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeGridEl(width = 240, height = 160): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    Object.defineProperty(el, 'clientWidth', {
      configurable: true,
      value: width
    });
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      value: height
    });
    return el;
  }

  it('prefers grid refresh metrics when a runtime grid exposes them', () => {
    const gridEl = makeGridEl();
    const metrics = {
      width: 99,
      height: 88,
      paddingLeft: 1,
      paddingTop: 2,
      paddingRight: 3,
      paddingBottom: 4
    };

    expect(measureGridMetrics(gridEl, {
      refreshMetrics: () => metrics
    })).toBe(metrics);
  });

  it('measures DOM grid dimensions minus padding and falls back to rect width', () => {
    const gridEl = makeGridEl(0, 0);
    gridEl.style.paddingLeft = '10px';
    gridEl.style.paddingRight = '6px';
    gridEl.style.paddingTop = '4px';
    gridEl.style.paddingBottom = '2px';
    gridEl.getBoundingClientRect = jest.fn(() => ({
      width: 216,
      height: 106,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 216,
      bottom: 106,
      toJSON: () => ({})
    } as DOMRect));

    expect(measureGridMetrics(gridEl)).toEqual({
      width: 200,
      height: 100,
      paddingLeft: 10,
      paddingTop: 4,
      paddingRight: 6,
      paddingBottom: 2
    });
  });

  it('derives fallback rows from percentage layouts when grid height is missing', () => {
    const gridEl = makeGridEl(480, 0);
    const grid = {
      options: {
        columnWidth: 40,
        cellHeight: 2
      }
    };

    expect(deriveGridSize(gridEl, grid, [
      { yPercent: 70, hPercent: 90 }
    ])).toEqual({
      cols: 12,
      rows: 384
    });
  });

  it('keeps admin rows as the minimum fallback size', () => {
    const gridEl = makeGridEl(120, 0);
    const grid = {
      options: {
        columns: 6,
        columnWidth: 20,
        cellHeight: 2
      }
    };

    expect(deriveGridSize(gridEl, grid, [])).toEqual({
      cols: 6,
      rows: DEFAULT_ADMIN_ROWS
    });
  });

  it('computes static grid scaling and clamps extreme percent height', () => {
    const gridEl = makeGridEl(300, 0);
    gridEl.getBoundingClientRect = jest.fn(() => ({
      width: 300,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 0,
      toJSON: () => ({})
    } as DOMRect));

    expect(computeStaticGridMetrics(gridEl, [
      { yPercent: 950, hPercent: 200 }
    ])).toEqual({
      width: 300,
      height: 3000,
      scaleX: 3,
      scaleY: 30
    });
  });
});
