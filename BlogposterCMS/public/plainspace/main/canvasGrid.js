// public//plainspace/main/canvasGrid.js
// Lightweight drag & resize grid for the builder
import { bindGlobalListeners } from './globalEvents.js';
import { BoundingBoxManager } from './BoundingBoxManager.js';
import { snapToGrid, elementRect, rectsCollide } from './grid-utils.js';

export class CanvasGrid {
  constructor(options = {}, el) {
    this.options = Object.assign(
      {
        cellHeight: 5,
        columnWidth: 5,
        columns: Infinity,
        rows: Infinity,
        pushOnOverlap: false,
        percentageMode: false
      },
      options
    );
    this.staticGrid = Boolean(this.options.staticGrid);
    this.pushOnOverlap = Boolean(this.options.pushOnOverlap);
    if (Number.isFinite(this.options.column)) {
      this.options.columns = this.options.column;
    }
    this.el = typeof el === 'string' ? document.querySelector(el) : el;
    this.el.classList.add('canvas-grid');
    this.widgets = [];
    this.activeEl = null;
    this.bboxManager = new BoundingBoxManager(this.el);
    this.bbox = this.bboxManager.box;
    this._bindResize();
    this._resizeObserver = new ResizeObserver(entries => {
      if (this.activeEl && entries.some(e => e.target === this.activeEl)) {
        this._updateBBox();
      }
    });
    this._emitter = new EventTarget();
    bindGlobalListeners(this.el, (evt, e) => this._emit(evt, e));
    this._updateGridHeight();
    if (this.options.percentageMode) {
      window.addEventListener('resize', () => {
        this.widgets.forEach(w => this._applyPosition(w, false));
      });
    }
  }

  on(evt, cb) {
    this._emitter.addEventListener(evt, e => cb(e.detail));
  }

  _emit(evt, detail) {
    this._emitter.dispatchEvent(new CustomEvent(evt, { detail }));
  }

  _updateGridHeight() {
    const { cellHeight } = this.options;
    const rows = this.widgets.reduce((m, w) => {
      const y = +w.dataset.y || 0;
      const h = +w.getAttribute('gs-h') || 1;
      return Math.max(m, y + h);
    }, 0);
    const min = parseFloat(getComputedStyle(this.el).minHeight) || 0;
    const height = Math.max(rows * cellHeight, min);
    this.el.style.height = `${height}px`;
  }

  _applyPosition(el, recalc = true) {
    const { columnWidth, cellHeight, columns, rows } = this.options;
    let x = +el.dataset.x || 0;
    let y = +el.dataset.y || 0;
    let w = +el.getAttribute('gs-w') || 1;
    let h = +el.getAttribute('gs-h') || 1;

    w = Math.max(1, w);
    h = Math.max(1, h);

    if (Number.isFinite(columns)) {
      if (w > columns) w = columns;
      if (x < 0) x = 0;
      if (x + w > columns) x = columns - w;
    } else if (x < 0) {
      x = 0;
    }

    if (Number.isFinite(rows)) {
      if (h > rows) h = rows;
      if (y < 0) y = 0;
      if (y + h > rows) y = rows - h;
    } else if (y < 0) {
      y = 0;
    }

    el.dataset.x = x;
    el.dataset.y = y;
    el.setAttribute('gs-w', w);
    el.setAttribute('gs-h', h);
    const layer = +el.dataset.layer || 0;
    el.style.zIndex = layer.toString();

    el.style.position = 'absolute';
    el.style.transform =
      `translate3d(${x * columnWidth}px, ${y * cellHeight}px, 0)`;
    if (this.options.percentageMode) {
      const gridW = this.el.clientWidth || 1;
      const gridH = this.el.clientHeight || 1;
      if (recalc) {
        const wPercent = Math.min((w * columnWidth / gridW) * 100, 100);
        const hPercent = Math.min((h * cellHeight / gridH) * 100, 100);
        el.dataset.wPercent = wPercent;
        el.dataset.hPercent = hPercent;
      }
      const wPercent = el.dataset.wPercent || 0;
      const hPercent = el.dataset.hPercent || 0;
      el.style.width = `${wPercent}%`;
      el.style.height = `${hPercent}%`;
    } else {
      el.style.width = `${w * columnWidth}px`;
      el.style.height = `${h * cellHeight}px`;
    }
  }

  makeWidget(el) {
    this._applyPosition(el);
    this._enableDrag(el);
    this.widgets.push(el);
    if (this.pushOnOverlap) this._resolveCollisions(el);
    this._updateGridHeight();
    this._emit('change', el);
  }

  addWidget(opts = {}) {
    const el = document.createElement('div');
    el.className = 'canvas-item';
    el.dataset.x = opts.x || 0;
    el.dataset.y = opts.y || 0;
    el.setAttribute('gs-w', opts.w || 1);
    el.setAttribute('gs-h', opts.h || 1);
    this.el.appendChild(el);
    this.makeWidget(el);
    return el;
  }

  removeWidget(el) {
    if (el.parentNode === this.el) {
      if (this.activeEl === el) this.clearSelection();
      el.remove();
      this._updateGridHeight();
      this._emit('change', el);
    }
  }

  update(el, opts = {}) {
    if (!el) return;
    if (opts.x != null) el.dataset.x = opts.x;
    if (opts.y != null) el.dataset.y = opts.y;
    if (opts.w != null) el.setAttribute('gs-w', opts.w);
    if (opts.h != null) el.setAttribute('gs-h', opts.h);
    if (opts.layer != null) el.dataset.layer = opts.layer;
    if (opts.locked != null) el.setAttribute('gs-locked', opts.locked);
    if (opts.noMove != null) el.setAttribute('gs-no-move', opts.noMove);
    if (opts.noResize != null) el.setAttribute('gs-no-resize', opts.noResize);
    const recalc = opts.w != null || opts.h != null;
    this._applyPosition(el, recalc);
    if (this.pushOnOverlap) this._resolveCollisions(el);
    if (el === this.activeEl) this._updateBBox();
    this._updateGridHeight();
    this._emit('change', el);
  }

  _bindResize() {
    let startX, startY, startW, startH, startGX, startGY, pos;
    const move = e => {
      const el = this.activeEl;
      if (!el || pos == null) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let w = startW, h = startH;
      let gx = startGX, gy = startGY;
      if (pos.includes('e')) w += dx;
      if (pos.includes('s')) h += dy;
      if (pos.includes('w')) { w -= dx; gx += Math.round(dx / this.options.columnWidth); }
      if (pos.includes('n')) { h -= dy; gy += Math.round(dy / this.options.cellHeight); }
      w = Math.max(20, w);
      h = Math.max(20, h);
      const opts = { w: Math.round(w / this.options.columnWidth), h: Math.round(h / this.options.cellHeight) };
      if (pos.includes('w')) opts.x = gx;
      if (pos.includes('n')) opts.y = gy;
      this.update(el, opts);
      el.dispatchEvent(new Event('resizemove', { bubbles: true }));
    };
    const up = () => {
      if (pos != null) this._emit('resizestop', this.activeEl);
      pos = null;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    Object.values(this.bboxManager.handles).forEach(h => {
      h.addEventListener('mousedown', e => {
        const el = this.activeEl;
        if (!el || this.staticGrid) return;
        if (el.getAttribute('gs-locked') === 'true' ||
            el.getAttribute('gs-no-resize') === 'true') {
          return;
        }
        e.stopPropagation();
        pos = h.dataset.pos;
        const rect = el.getBoundingClientRect();
        startX = e.clientX; startY = e.clientY;
        startW = rect.width; startH = rect.height;
        startGX = +el.dataset.x || 0;
        startGY = +el.dataset.y || 0;
        this._emit('resizestart', el);
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    });
  }

  _enableDrag(el) {
    let startX, startY, startGX, startGY, dragging = false;
    let targetX = 0, targetY = 0;
    const move = e => {
      if (!dragging) return;
      targetX = startGX * this.options.columnWidth + (e.clientX - startX);
      targetY = startGY * this.options.cellHeight + (e.clientY - startY);
      const snap = snapToGrid(targetX, targetY, this.options.columnWidth, this.options.cellHeight);
      el.style.transform =
        `translate3d(${snap.x * this.options.columnWidth}px, ${snap.y * this.options.cellHeight}px, 0)`;
      this._updateBBox();
      el.dispatchEvent(new Event('dragmove', { bubbles: true }));
    };
    const up = () => {
      dragging = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      const snap = snapToGrid(targetX, targetY, this.options.columnWidth, this.options.cellHeight);
      this.update(el, { x: snap.x, y: snap.y });
      this._emit('dragstop', el);
    };
    el.addEventListener('mousedown', e => {
      if (e.target.closest('.bbox-handle')) return;
      if (this.staticGrid) return;
      if (el.getAttribute('gs-locked') === 'true' || el.getAttribute('gs-no-move') === 'true') return;
      e.preventDefault();
      this.select(el);
      startX = e.clientX; startY = e.clientY;
      startGX = +el.dataset.x || 0;
      startGY = +el.dataset.y || 0;
      targetX = startGX * this.options.columnWidth;
      targetY = startGY * this.options.cellHeight;
      dragging = true;
      this._emit('dragstart', el);
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  // snapToGrid, elementRect and rectsCollide are imported from grid-utils.js

  _pushWidget(widget, moved = new Set()) {
    if (moved.has(widget)) return;
    moved.add(widget);
    const rect = elementRect(widget);
    this.widgets.forEach(other => {
      if (other === widget) return;
      const oRect = elementRect(other);
      if (rectsCollide(rect, oRect)) {
        const newY = rect.y + rect.h;
        if (oRect.y < newY) {
          other.dataset.y = newY;
          this._applyPosition(other, false);
          this._pushWidget(other, moved);
        }
      }
    });
  }

  _resolveCollisions(el) {
    this._pushWidget(el);
  }

  _updateBBox() {
    if (!this.activeEl || this.staticGrid) return;
    const manager = this.bboxManager;
    manager.update();
    const noResize = this.activeEl.getAttribute('gs-no-resize') === 'true';
    const noMove = this.activeEl.getAttribute('gs-no-move') === 'true';
    const disabled = noResize && noMove;
    manager.setDisabled(disabled);
  }

  select(el) {
    if (this.activeEl) {
      this._resizeObserver.unobserve(this.activeEl);
      this.activeEl.classList.remove('selected');
    }
    this.activeEl = el;
    if (el) {
      el.classList.add('selected');
      this._resizeObserver.observe(el);
    }
    this.bboxManager.setWidget(el);
    this._updateBBox();
  }

  clearSelection() {
    if (this.activeEl) {
      this._resizeObserver.unobserve(this.activeEl);
      this.activeEl.classList.remove('selected');
    }
    this.activeEl = null;
    this.bboxManager.setWidget(null);
  }


  setStatic(flag = true) {
    this.staticGrid = Boolean(flag);
    if (this.staticGrid) this.clearSelection();
    this.el.classList.toggle('static-grid', this.staticGrid);
    this._emit('staticchange', this.staticGrid);
  }

  removeAll() {
    this.widgets.slice().forEach(w => this.removeWidget(w));
  }
}

export function init(options, el) {
  return new CanvasGrid(options, el);
}
