// apps/designer/main/pixelGrid.js
// Pixel-based drag & resize grid for the builder
import { bindGlobalListeners } from '/plainspace/grid-core/globalEvents.js';
import { BoundingBoxManager } from '/plainspace/grid-core/bbox/BoundingBoxManager.js';
import { snapToGrid, elementRect, rectsCollide } from '/plainspace/grid-core/geometry.js';

export class PixelGrid {
  constructor(options = {}, el) {
    this.options = Object.assign(
      {
        // 1px baseline grid for pixel-perfect alignment
        cellHeight: 1,
        columnWidth: 1,
        columns: Infinity,
        rows: Infinity,
        pushOnOverlap: false,
        percentageMode: false,
        liveSnap: false,
        liveSnapResize: false,
        bboxHandles: true
      },
      options
    );
    this.staticGrid = Boolean(this.options.staticGrid);
    this.pushOnOverlap = Boolean(this.options.pushOnOverlap);
    if (Number.isFinite(this.options.column)) {
      this.options.columns = this.options.column;
    }
    this.el = typeof el === 'string' ? document.querySelector(el) : el;
    this.el.classList.add('pixel-grid');
    this.widgets = [];
    this.activeEl = null;
    this.useBoundingBox = this.options.useBoundingBox !== false;
    this.bboxHandles = this.options.bboxHandles !== false;
    if (this.useBoundingBox) {
      this.bboxManager = new BoundingBoxManager(this.el, {
        handles: this.bboxHandles
      });
      this.bbox = this.bboxManager.box;
      this._bindResize();
    } else {
      this.bboxManager = null;
      this.bbox = null;
    }
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
    if (!this.useBoundingBox) {
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      handle.slot = 'resize-handle';
      el.appendChild(handle);
      this._bindResize(el);
    }
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

  update(el, opts = {}, meta = {}) {
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
    if (!meta.silent) this._emit('change', el);
  }

  _bindResize(el) {
    if (this.useBoundingBox && !el) {
      if (!this.bboxManager) return;
      const parts = this.bboxManager.box.querySelectorAll('.bbox-edge, .bbox-handle');
      let startX, startY, startW, startH, startGX, startGY, pos;

      const startResize = e => {
        const widget = this.activeEl;
        if (!widget || this.staticGrid) return;
        if (widget.getAttribute('gs-locked') === 'true' ||
            widget.getAttribute('gs-no-resize') === 'true') {
          return;
        }
        pos = e.currentTarget.dataset.pos;
        if (!pos) return;
        e.stopPropagation();
        const rect = widget.getBoundingClientRect();
        startX = e.clientX; startY = e.clientY;
        startW = rect.width; startH = rect.height;
        startGX = +widget.dataset.x || 0;
        startGY = +widget.dataset.y || 0;
        const startPX = startGX * this.options.columnWidth;
        const startPY = startGY * this.options.cellHeight;
        let curW = startW, curH = startH, curPX = startPX, curPY = startPY;
        const live = this.options.liveSnapResize;
        let _resizeRAF = null, _lastEvt;
        const move = ev => {
          _lastEvt = ev;
          if (_resizeRAF) return;
          _resizeRAF = requestAnimationFrame(() => {
            _resizeRAF = null;
            const e = _lastEvt; _lastEvt = null;
            if (!e) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (live) {
              let w = startW, hVal = startH;
              let gx = startGX, gy = startGY;
              if (pos.includes('e')) w += dx;
              if (pos.includes('s')) hVal += dy;
              if (pos.includes('w')) { w -= dx; gx += Math.round(dx / this.options.columnWidth); }
              if (pos.includes('n')) { hVal -= dy; gy += Math.round(dy / this.options.cellHeight); }
              w = Math.max(20, w);
              hVal = Math.max(20, hVal);
              const opts = {
                w: Math.round(w / this.options.columnWidth),
                h: Math.round(hVal / this.options.cellHeight)
              };
              if (pos.includes('w')) opts.x = gx;
              if (pos.includes('n')) opts.y = gy;
              this.update(widget, opts, { silent: true });
            } else {
              let w = startW, hVal = startH;
              let px = startPX, py = startPY;
              if (pos.includes('e')) w += dx;
              if (pos.includes('s')) hVal += dy;
              if (pos.includes('w')) { w -= dx; px += dx; }
              if (pos.includes('n')) { hVal -= dy; py += dy; }
              const minW = (+widget.getAttribute('gs-min-w') || 1) * this.options.columnWidth;
              const minH = (+widget.getAttribute('gs-min-h') || 1) * this.options.cellHeight;
              if (w < minW) { px += w - minW; w = minW; }
              if (hVal < minH) { py += hVal - minH; hVal = minH; }
              curW = w; curH = hVal; curPX = px; curPY = py;
              widget.style.width = `${w}px`;
              widget.style.height = `${hVal}px`;
              widget.style.transform = `translate3d(${px}px, ${py}px, 0)`;
            }
            widget.dispatchEvent(new Event('resizemove', { bubbles: true }));
          });
        };
        const up = ev => {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          e.currentTarget?.releasePointerCapture?.(ev.pointerId);
          if (!live) {
            const snapW = Math.round(curW / this.options.columnWidth);
            const snapH = Math.round(curH / this.options.cellHeight);
            const snapX = Math.round(curPX / this.options.columnWidth);
            const snapY = Math.round(curPY / this.options.cellHeight);
            widget.style.removeProperty('width');
            widget.style.removeProperty('height');
            widget.style.removeProperty('transform');
            this.update(widget, { w: snapW, h: snapH, x: snapX, y: snapY });
          }
          if (pos != null) this._emit('resizestop', this.activeEl);
          pos = null;
        };
        this._emit('resizestart', widget);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        e.currentTarget?.setPointerCapture?.(e.pointerId);
      };

      parts.forEach(part => part.addEventListener('pointerdown', startResize, { passive: false }));
    } else if (!this.useBoundingBox && el) {
      const handle = el.querySelector('.resize-handle');
      if (!handle) return;
      let startX, startY, startW, startH, startGX, startGY;
      handle.addEventListener('pointerdown', e => {
        if (this.staticGrid) return;
        if (el.getAttribute('gs-locked') === 'true' ||
            el.getAttribute('gs-no-resize') === 'true') {
          return;
        }
        e.stopPropagation();
        this.select(el);
        const rect = el.getBoundingClientRect();
        startX = e.clientX; startY = e.clientY;
        startW = rect.width; startH = rect.height;
        startGX = +el.dataset.x || 0;
        startGY = +el.dataset.y || 0;
        const startPX = startGX * this.options.columnWidth;
        const startPY = startGY * this.options.cellHeight;
        let curW = startW, curH = startH, curPX = startPX, curPY = startPY;
        const live = this.options.liveSnapResize;
        let _resizeRAF = null, _lastEvt;
        const move = ev => {
          _lastEvt = ev;
          if (_resizeRAF) return;
          _resizeRAF = requestAnimationFrame(() => {
            _resizeRAF = null;
            const e = _lastEvt; _lastEvt = null;
            if (!e) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (live) {
              let w = startW + dx;
              let hVal = startH + dy;
              const minW = (+el.getAttribute('gs-min-w') || 1) * this.options.columnWidth;
              const minH = (+el.getAttribute('gs-min-h') || 1) * this.options.cellHeight;
              w = Math.max(minW, w);
              hVal = Math.max(minH, hVal);
              this.update(
                el,
                {
                  w: Math.round(w / this.options.columnWidth),
                  h: Math.round(hVal / this.options.cellHeight)
                },
                { silent: true }
              );
            } else {
              let w = startW + dx;
              let hVal = startH + dy;
              let px = startPX;
              let py = startPY;
              const minW = (+el.getAttribute('gs-min-w') || 1) * this.options.columnWidth;
              const minH = (+el.getAttribute('gs-min-h') || 1) * this.options.cellHeight;
              if (w < minW) w = minW;
              if (hVal < minH) hVal = minH;
              curW = w; curH = hVal; curPX = px; curPY = py;
              el.style.width = `${w}px`;
              el.style.height = `${hVal}px`;
              el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
            }
            el.dispatchEvent(new Event('resizemove', { bubbles: true }));
          });
        };
        const up = ev => {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          handle?.releasePointerCapture?.(ev.pointerId);
          if (!live) {
            const snapW = Math.round(curW / this.options.columnWidth);
            const snapH = Math.round(curH / this.options.cellHeight);
            const snapX = Math.round(curPX / this.options.columnWidth);
            const snapY = Math.round(curPY / this.options.cellHeight);
            el.style.removeProperty('width');
            el.style.removeProperty('height');
            el.style.removeProperty('transform');
            this.update(el, { w: snapW, h: snapH, x: snapX, y: snapY });
          }
          this._emit('resizestop', el);
        };
        this._emit('resizestart', el);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        handle?.setPointerCapture?.(e.pointerId);
      });
    }
  }

  _enableDrag(el) {
    let startX, startY, startGX, startGY, dragging = false;
    let targetX = 0, targetY = 0;
    let frame = null;

    const inAdminHandle = evt => {
      const widget = evt.target.closest('.widget-container.admin-widget');
      if (!widget) return false;
      const rect = widget.getBoundingClientRect();
      const x = evt.clientX;
      const y = evt.clientY;
      return (
        x >= rect.right - 24 && x <= rect.right - 8 &&
        y >= rect.top + 8 && y <= rect.top + 24
      );
    };

    const apply = () => {
      frame = null;
      if (this.options.liveSnap) {
        const snap = snapToGrid(
          targetX,
          targetY,
          this.options.columnWidth,
          this.options.cellHeight
        );
        el.style.transform =
          `translate3d(${snap.x * this.options.columnWidth}px, ${snap.y * this.options.cellHeight}px, 0)`;
      } else {
        el.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
      }
      // Drag-Event sofort auslösen…
      el.dispatchEvent(new Event('dragmove', { bubbles: true }));
      // …und das BBox-Update in den nächsten Frame schieben.
      requestAnimationFrame(() => this._updateBBox());
    };

    const move = e => {
      if (!dragging) return;
      targetX = startGX * this.options.columnWidth + (e.clientX - startX);
      targetY = startGY * this.options.cellHeight + (e.clientY - startY);
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const up = e => {
      if (dragging) {
        el.classList.remove('dragging');
      }
      dragging = false;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      el?.releasePointerCapture?.(e.pointerId);
      const snap = snapToGrid(targetX, targetY, this.options.columnWidth, this.options.cellHeight);
      this.update(el, { x: snap.x, y: snap.y });
      this._emit('dragstop', el);
    };

    const startDrag = e => {
      const allowed = !this.staticGrid || inAdminHandle(e);
      if (!allowed) return;
      if (el.getAttribute('gs-locked') === 'true' || el.getAttribute('gs-no-move') === 'true') return;
      e.preventDefault();
      this.select(el);
      startX = e.clientX; startY = e.clientY;
      startGX = +el.dataset.x || 0;
      startGY = +el.dataset.y || 0;
      targetX = startGX * this.options.columnWidth;
      targetY = startGY * this.options.cellHeight;
      dragging = true;
      el.classList.add('dragging');
      this._emit('dragstart', el);
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      el?.setPointerCapture?.(e.pointerId);
    };

    const start = e => {
      if (e.target.closest('.bbox-handle') || e.target.closest('.bounding-box')) return;
      startDrag(e);
    };

    el.addEventListener('pointerdown', start);
    el._gridDragStart = startDrag;
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
    if (!this.useBoundingBox || !this.bboxManager || !this.activeEl || this.staticGrid) return;
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
    if (this.useBoundingBox && this.bboxManager) {
      this.bboxManager.setWidget(el);
      this.bboxManager.box.style.cursor = 'move';
    }
    this._updateBBox();
  }

  clearSelection() {
    if (this.activeEl) {
      this._resizeObserver.unobserve(this.activeEl);
      this.activeEl.classList.remove('selected');
    }
    this.activeEl = null;
    if (this.useBoundingBox && this.bboxManager) {
      this.bboxManager.setWidget(null);
    }
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
  return new PixelGrid(options, el);
}
