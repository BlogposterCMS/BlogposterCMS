// public/plainspace/main/BoundingBoxManager.js
import { localRect } from './grid-utils.js';

export class BoundingBoxManager extends EventTarget {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.widget = null;
    this.MIN_W = 32;
    this.MIN_H = 32;
    this._checkTimer = null;

    this.box = document.createElement('div');
    this.box.className = 'selection-box bounding-box';
    this.box.style.pointerEvents = 'none';
    this.box.style.display = 'none';
    this.canvas.appendChild(this.box);

    this.handles = {};
    const positions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    positions.forEach(p => {
      const h = document.createElement('div');
      h.className = `bbox-handle ${p}`;
      h.dataset.pos = p;
      this.box.appendChild(h);
      this.handles[p] = h;
    });

    this._updateHandler = () => this.update();
    this._ro = new ResizeObserver(this._updateHandler);
    this.canvas.addEventListener('scroll', this._updateHandler, true);
    this.canvas.addEventListener('zoom', this._updateHandler, true);
  }

  setWidget(widget) {
    if (this.widget === widget) return;
    if (this.widget) {
      this.widget.removeEventListener('dragmove', this._updateHandler, true);
      this.widget.removeEventListener('resizemove', this._updateHandler, true);
      this._ro.unobserve(this.widget);
    }
    clearInterval(this._checkTimer);
    this._checkTimer = null;
    this.widget = widget;
    if (widget) {
      if (!widget.isConnected) {
        requestAnimationFrame(() => this.setWidget(widget));
        return;
      }
      this._ro.observe(widget);
      widget.addEventListener('dragmove', this._updateHandler, true);
      widget.addEventListener('resizemove', this._updateHandler, true);
      this.update();
      this.show();
      requestAnimationFrame(() => this.checkSize());
      this._checkTimer = setInterval(() => this.checkSize(), 500);
    } else {
      this.hide();
    }
    this.dispatchEvent(new CustomEvent('widgetchange', { detail: widget }));
  }

  update() {
    if (!this.widget) return;
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

  show() {
    this.box.style.display = 'block';
  }

  hide() {
    this.box.style.display = 'none';
  }

  checkSize() {
    if (!this.widget) return false;
    const prevW = parseFloat(this.box.style.width) || 0;
    const prevH = parseFloat(this.box.style.height) || 0;
    const scale = parseFloat(
      getComputedStyle(this.canvas).getPropertyValue('--canvas-scale') || '1'
    );
    const { w, h } = localRect(this.widget, this.canvas, scale);
    const width = Math.max(w, this.MIN_W);
    const height = Math.max(h, this.MIN_H);
    if (Math.abs(width - prevW) > 0.5 || Math.abs(height - prevH) > 0.5) {
      this.update();
      return true;
    }
    return false;
  }

  setDisabled(flag) {
    this.box.classList.toggle('disabled', flag);
    if (flag) this.hide();
  }
}
