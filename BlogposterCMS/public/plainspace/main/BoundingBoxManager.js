// public/plainspace/main/BoundingBoxManager.js
import { localRect } from './grid-utils.js';

export class BoundingBoxManager {
  constructor(widget, canvas) {
    this.widget = widget;
    this.canvas = canvas;
    this.MIN_W = 32;
    this.MIN_H = 32;

    this.box = document.createElement('div');
    this.box.className = 'selection-box';
    this.box.style.pointerEvents = 'none';
    this.canvas.appendChild(this.box);

    this._observeWidget();
    this.update();
  }

  _observeWidget() {
    this._ro = new ResizeObserver(() => this.update());
    this._ro.observe(this.widget);

    this.widget.addEventListener('dragmove', () => this.update(), true);
    this.widget.addEventListener('resizemove', () => this.update(), true);
    this.canvas.addEventListener('scroll', () => this.update(), true);
    this.canvas.addEventListener('zoom', () => this.update(), true);
  }

  disconnect() {
    this._ro?.disconnect();
  }

  update() {
    const scale = parseFloat(
      getComputedStyle(this.canvas).getPropertyValue('--canvas-scale') || '1'
    );
    const { x, y, w, h } = localRect(this.widget, this.canvas, scale);
    const width = Math.max(w, this.MIN_W);
    const height = Math.max(h, this.MIN_H);
    this.box.style.transform = `translate(${x}px, ${y}px)`;
    this.box.style.width = `${width}px`;
    this.box.style.height = `${height}px`;
    this.box.style.setProperty('--inv-scale', String(1 / scale));
  }
}
