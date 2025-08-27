// public/plainspace/main/BoundingBoxManager.js
import { localRect } from './grid-utils.js';

export class BoundingBoxManager extends EventTarget {
  constructor(canvas, opts = {}) {
    super();
    this.canvas = canvas;
    this.widget = null;
    this.MIN_W = 32;
    this.MIN_H = 32;

    this.box = document.createElement('div');
    this.box.className = 'selection-box bounding-box';
    this.box.style.pointerEvents = 'none';
    this.box.style.display = 'none';
    const base = navigator.maxTouchPoints > 0 ? 14 : 10;
    this.box.style.setProperty('--edge-base', `${base}px`);
    // CSS definiert bereits "position:absolute" für relative Platzierung im Canvas
    this.canvas.appendChild(this.box);

    this.edges = {};
    ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'].forEach(p => {
      const edge = document.createElement('div');
      edge.className = `bbox-edge ${p}`;
      edge.dataset.pos = p;
      this.box.appendChild(edge);
      this.edges[p] = edge;
    });

    this.handles = {};
    if (opts.handles !== false) {
      const positions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      positions.forEach(p => {
        const h = document.createElement('div');
        h.className = `bbox-handle ${p}`;
        h.dataset.pos = p;
        this.box.appendChild(h);
        this.handles[p] = h;
        h.style.pointerEvents = 'auto';
        h.style.touchAction = 'none';
      });
    }

    this._scheduled = false;
    this._updateHandler = () => {
      if (this._scheduled) return;
      this._scheduled = true;
      requestAnimationFrame(() => {
        this._scheduled = false;
        this.update();
      });
    };
    this._ro = new ResizeObserver(this._updateHandler);
    this._onLoad = null;
    this.canvas.addEventListener('scroll', this._updateHandler, true);
    this.canvas.addEventListener('zoom', this._updateHandler, true);
  }

  setWidget(widget) {
    if (this.widget === widget) return;
    if (this._onLoad) {
      window.removeEventListener('load', this._onLoad);
      this._onLoad = null;
    }
    if (this.widget) {
      this.widget.removeEventListener('dragmove', this._updateHandler, true);
      this.widget.removeEventListener('resizemove', this._updateHandler, true);
      this.widget.removeEventListener('transitionend', this._updateHandler, true);
      this.widget.removeEventListener('animationend', this._updateHandler, true);
      this._ro.unobserve(this.widget);
    }
    this.widget = widget;
    if (widget) {
      if (!widget.isConnected) {
        requestAnimationFrame(() => this.setWidget(widget));
        return;
      }
      const observe = () => {
        this._ro.observe(widget);
        widget.addEventListener('dragmove', this._updateHandler, true);
        widget.addEventListener('resizemove', this._updateHandler, true);
        widget.addEventListener('transitionend', this._updateHandler, true);
        widget.addEventListener('animationend', this._updateHandler, true);
        this.update();
        this.show();
        requestAnimationFrame(() => this.update());
      };
      if (document.readyState === 'complete') {
        observe();
      } else {
        this._onLoad = () => {
          observe();
          this._onLoad = null;
        };
        window.addEventListener('load', this._onLoad, { once: true });
      }
    } else {
      this.hide();
    }
    this.dispatchEvent(new CustomEvent('widgetchange', { detail: widget }));
  }

  update() {
    if (!this.widget) return;
    if (this.canvas.classList.contains('pixel-grid')) {
      const { x, y, w, h } = localRect(this.widget, this.canvas, 1);
      const dpr = window.devicePixelRatio || 1;
      const rx = Math.round(x * dpr) / dpr;
      const ry = Math.round(y * dpr) / dpr;
      const width = Math.round(w * dpr) / dpr;
      const height = Math.round(h * dpr) / dpr;
      this.box.style.transform = `translate(${rx}px, ${ry}px)`;
      this.box.style.width = `${width}px`;
      this.box.style.height = `${height}px`;
      this.box.style.setProperty('--inv-scale', '1');
      return;
    }
    const scale = parseFloat(
      getComputedStyle(this.canvas).getPropertyValue('--canvas-scale') || '1'
    );
    const { x, y, w, h } = localRect(this.widget, this.canvas, scale);
    const dpr = window.devicePixelRatio || 1;
    const rx = Math.round(x * dpr) / dpr;
    const ry = Math.round(y * dpr) / dpr;
    const width = Math.round(Math.max(w, this.MIN_W) * dpr) / dpr;
    const height = Math.round(Math.max(h, this.MIN_H) * dpr) / dpr;
    this.box.style.transform = `translate(${rx}px, ${ry}px)`;
    this.box.style.width = `${width}px`;
    this.box.style.height = `${height}px`;
    this.box.style.setProperty('--inv-scale', String(1 / scale));
  }

  show() {
    this.canvas.appendChild(this.box);
    this.box.style.display = 'block';
  }

  hide() {
    this.box.style.display = 'none';
  }

  checkSize() {
    if (!this.widget) return false;
    const prevW = parseFloat(this.box.style.width) || 0;
    const prevH = parseFloat(this.box.style.height) || 0;
    if (this.canvas.classList.contains('pixel-grid')) {
      const { w, h } = localRect(this.widget, this.canvas, 1);
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(w * dpr) / dpr;
      const height = Math.round(h * dpr) / dpr;
      if (Math.abs(width - prevW) > 0.5 || Math.abs(height - prevH) > 0.5) {
        this.update();
        return true;
      }
      return false;
    }
    const scale = parseFloat(
      getComputedStyle(this.canvas).getPropertyValue('--canvas-scale') || '1'
    );
    const { w, h } = localRect(this.widget, this.canvas, scale);
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(Math.max(w, this.MIN_W) * dpr) / dpr;
    const height = Math.round(Math.max(h, this.MIN_H) * dpr) / dpr;
    if (Math.abs(width - prevW) > 0.5 || Math.abs(height - prevH) > 0.5) {
      this.update();
      return true;
    }
    return false;
  }

  setDisabled(flag) {
    this.box.classList.toggle('disabled', flag);
    Object.values(this.edges).forEach(edge => {
      edge.style.pointerEvents = flag ? 'none' : 'auto';
    });
    if (flag) this.hide();
  }
}
