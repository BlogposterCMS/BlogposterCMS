// apps/designer/main/pixelGrid.js
// Pixel-based drag & resize grid for the builder
import { CanvasGrid } from '/plainspace/main/canvasGrid.js';

export class PixelGrid extends CanvasGrid {
  constructor(options = {}, el) {
    const defaults = {
      // 1px baseline grid for precise alignment
      cellHeight: 1,
      columnWidth: 1,
      columns: Infinity,
      rows: Infinity,
      pushOnOverlap: true,
      percentageMode: false
    };
    super(Object.assign(defaults, options), el);
    this.el.classList.add('pixel-grid');
    this.el.classList.remove('canvas-grid');
  }
}

export function init(options, el) {
  return new PixelGrid(options, el);
}
