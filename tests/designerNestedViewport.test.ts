/** @jest-environment jsdom */
jest.mock('/ui/runtime/main/canvasGrid.js', () => ({}));
import { CanvasGrid } from '../ui/shared/grid/canvasGrid';
import { getCurrentLayout } from '../ui/designer/app/managers/gridManager';
import fs from 'fs';
import path from 'path';

describe('Designer nested viewport editing', () => {
  it('keeps authored page height independent of the scaled scroll wrapper', () => {
    const css = fs.readFileSync(path.join(__dirname, '../apps/designer/assets/css/designer.css'), 'utf8');
    const pageRule = css.match(/#layoutRoot\.layout-page-root\s*\{([^}]+)\}/)?.[1];
    expect(pageRule).toMatch(/min-height:\s*0;/);
  });
  beforeEach(() => {
    document.body.replaceChildren();
    globalThis.ResizeObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 1;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('round-trips a mobile correction with local coordinates and preserves desktop placement', () => {
    const root = document.createElement('div');
    root.className = 'layout-grid-surface layout-grid-container';
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 480 });
    Object.defineProperty(root, 'clientHeight', { value: 300 });
    document.body.append(root);
    const grid = new CanvasGrid({
      columns: 480, columnWidth: 1, cellHeight: 1, pixelColumns: true,
      responsivePlacement: true, responsiveViewportWidth: 1280
    }, root);
    const widget = document.createElement('article');
    widget.className = 'canvas-item';
    widget.dataset.widgetId = 'textBox';
    widget.dataset.instanceId = 'test';
    root.append(widget);
    grid.makeWidget(widget, { silent: true });
    grid.update(widget, { x: 190, y: 20, w: 100, h: 50 });
    grid.setResponsiveViewport(390);
    grid.update(widget, { x: 80, y: 30, w: 100, h: 50 });
    expect(grid.getResponsivePlacementState(widget).activeRule).toMatchObject({ minWidth: 320, maxWidth: 600 });
    const saved = getCurrentLayout(root, {})[0];
    expect(saved.code.meta.responsivePlacement.rules).toHaveLength(2);
    // Reload the serialized contract, then revisit both widths.
    widget.dataset.responsivePlacement = JSON.stringify(saved.code.meta.responsivePlacement);
    grid.setResponsiveViewport(1280);
    expect(widget.dataset.x).toBe('190');
    expect(widget.dataset.y).toBe('20');
    grid.setResponsiveViewport(390);
    expect(widget.dataset.x).toBe('80');
    expect(widget.dataset.y).toBe('30');
    expect(grid.options.columns).toBe(480);
    // Resizing only the container must not select a different page breakpoint.
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 400 });
    grid.refreshMetrics();
    grid._syncColumnWidthFromWidth(400);
    expect(grid.responsiveViewportWidth).toBe(390);
  });
});
