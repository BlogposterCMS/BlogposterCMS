// public/plainspace/main/BoundingBoxManager.js
import { localRect } from './grid-utils.js';

export class BoundingBoxManager extends EventTarget {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.widget = null;
    this.MIN_W = 32;
    this.MIN_H = 32;

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

  addHitLayer(widget) {
    if (!widget || widget.querySelector('.hit-layer')) return null;
    const shield = document.createElement('div');
    shield.className = 'hit-layer';
    Object.assign(shield.style, {
      position: 'absolute',
      inset: '0',
      background: 'transparent',
      cursor: 'move',
      pointerEvents: 'auto',
      zIndex: '5'
    });
    widget.style.position = 'relative';
    widget.appendChild(shield);

    const toggle = () => {
      const editing = widget.classList.contains('editing');
      const selected = widget.classList.contains('selected');
      shield.style.pointerEvents = editing || selected ? 'none' : 'auto';
      shield.style.cursor = editing ? 'text' : 'move';
    };
    widget.addEventListener('editStart', toggle);
    widget.addEventListener('editEnd', toggle);
    widget.addEventListener('selected', toggle);
    widget.addEventListener('deselected', toggle);
    return shield;
  }

  setWidget(widget) {
    if (this.widget === widget) return;
    if (this.widget) {
      this.widget.removeEventListener('dragmove', this._updateHandler, true);
      this.widget.removeEventListener('resizemove', this._updateHandler, true);
      this._ro.unobserve(this.widget);
    }
    this.widget = widget;
    if (widget) {
      this._ro.observe(widget);
      widget.addEventListener('dragmove', this._updateHandler, true);
      widget.addEventListener('resizemove', this._updateHandler, true);
      this.update();
      this.show();
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

  setDisabled(flag) {
    this.box.classList.toggle('disabled', flag);
    if (flag) this.hide();
  }
}
