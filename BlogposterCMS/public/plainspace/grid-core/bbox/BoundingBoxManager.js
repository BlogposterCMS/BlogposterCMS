// public/plainspace/grid-core/bbox/BoundingBoxManager.js
// Bounding box manager with edges and handles but no mode-specific logic
import { localRect } from '../geometry.js';

export class BoundingBoxManager extends EventTarget {
  constructor(canvas, opts = {}) {
    super();
    this.canvas = canvas;
    this.widget = null;

    this.box = document.createElement('div');
    this.box.className = 'selection-box bounding-box';
    this.box.style.pointerEvents = 'none';
    this.box.style.display = 'none';
    const base = navigator.maxTouchPoints > 0 ? 14 : 10;
    this.box.style.setProperty('--edge-base', `${base}px`);
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

    this._ro = new ResizeObserver(() => this.update());
  }

  setWidget(widget) {
    if (this.widget) this._ro.unobserve(this.widget);
    this.widget = widget;
    if (widget) {
      this._ro.observe(widget);
      this.update();
      this.show();
    } else {
      this.hide();
    }
    this.dispatchEvent(new CustomEvent('widgetchange', { detail: widget }));
  }

  update() {
    if (!this.widget) return;
    const { x, y, w, h } = localRect(this.widget, this.canvas, 1);
    this.box.style.transform = `translate(${x}px, ${y}px)`;
    this.box.style.width = `${w}px`;
    this.box.style.height = `${h}px`;
  }

  show() {
    this.box.style.display = 'block';
  }

  hide() {
    this.box.style.display = 'none';
  }
}
