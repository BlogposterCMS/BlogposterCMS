// public/plainspace/main/canvasGrid.js
// Lightweight drag & resize grid for the builder
import { bindGlobalListeners } from './globalEvents.js';
import { BoundingBoxManager } from './BoundingBoxManager.js';
import { snapToGrid, elementRect, rectsCollide } from './grid-utils.js';

export class CanvasGrid {
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
    this.el.classList.add('canvas-grid');
    // The scroll container hosts the scrollbars. Default to the grid's
    // parent element, but allow an explicit element via options.
    this.scrollContainer = options.scrollContainer || this.el.parentElement || this.el;
    // Create a sizing wrapper to expand with zoom so the scrollbars show
    // inside the designer rather than on the page.
    try {
      if (this.scrollContainer && this.el.parentElement === this.scrollContainer) {
        const sizer = document.createElement('div');
        sizer.className = 'canvas-zoom-sizer';
        sizer.style.position = 'relative';
        sizer.style.width = '100%';
        sizer.style.height = '100%';
        this.scrollContainer.insertBefore(sizer, this.el);
        sizer.appendChild(this.el);
        this.sizer = sizer;
        // Position the actual grid absolutely inside the sizer so we can
        // scale it visually while the sizer controls the scroll area.
        this.el.style.position = 'absolute';
        this.el.style.left = '0';
        this.el.style.top = '0';
      }
    } catch (_) { /* non-fatal if DOM structure unexpected */ }
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
    // Observe container size changes (e.g., sidebar open/close) and
    // recompute column width so percentage-based layout stays correct.
    try {
      const _ro = new ResizeObserver(() => {
        // Use clientWidth to avoid counting CSS transforms applied to
        // the container (e.g. when the sidebar "plops" open we scale
        // #content). getBoundingClientRect() would include the scale
        // and break our column width math.
        const w = this.el?.clientWidth || parseFloat(getComputedStyle(this.el).width) || 1;
        const cols = this.options.columns || 1;
        this.options.columnWidth = w / cols;
        this.widgets.forEach(wi => this._applyPosition(wi, false));
        // If something is selected, ensure the bbox follows
        this._updateBBox();
        // Keep the zoom sizer in sync with container width changes
        this._syncSizer();
      });
      _ro.observe(this.el);
      this._containerRO = _ro;
    } catch (_) { /* ResizeObserver not supported */ }

    if (this.options.percentageMode) {
      window.addEventListener('resize', () => {
        this.widgets.forEach(w => this._applyPosition(w, false));
      });
    }

    // Zoom state and handler (Ctrl + wheel). Zoom towards the cursor
    // position for intuitive focal-point zooming within the grid area.
    this.scale = 1;
    this.el.style.setProperty('--canvas-scale', '1');
    // Centered transform origin so the canvas scales around the middle
    this.el.style.transformOrigin = '50% 50%';
    const wheelZoom = e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const anchor = { x: e.clientX, y: e.clientY };
      this.setScale(this.scale * factor, anchor);
    };
    // Listen on the scroll container so Ctrl+wheel over the viewport works
    const wheelTarget = this.scrollContainer || this.el;
    wheelTarget.addEventListener('wheel', wheelZoom, { passive: false });
    this._centerViewport();
  }

  on(evt, cb) {
    this._emitter.addEventListener(evt, e => cb(e.detail));
  }

  _emit(evt, detail) {
    this._emitter.dispatchEvent(new CustomEvent(evt, { detail }));
  }

  _currentScale() {
    const v = parseFloat(getComputedStyle(this.el).getPropertyValue('--canvas-scale') || '1');
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  _syncSizer() {
    if (!this.sizer) return;
    const scale = this.scale || this._currentScale();
    // Base the width on the unscaled scroll container so ResizeObserver
    // callbacks don't repeatedly multiply the already scaled grid size.
    const baseW = (this.scrollContainer && this.scrollContainer.clientWidth) || this.el.offsetWidth || 0;
    const baseH = this.el.offsetHeight || 0;
    const targetW = baseW * scale;
    const targetH = baseH * scale;
    if (
      Math.round(this.sizer.offsetWidth) === Math.round(targetW) &&
      Math.round(this.sizer.offsetHeight) === Math.round(targetH)
    ) {
      return;
    }
    this.sizer.style.width = `${targetW}px`;
    this.sizer.style.height = `${targetH}px`;
  }

  _centerViewport() {
    if (!this.scrollContainer) return;
    const sc = this.scrollContainer;
    const sw = (this.sizer?.clientWidth || this.el.offsetWidth || 0);
    const sh = (this.sizer?.clientHeight || this.el.offsetHeight || 0);
    const targetX = Math.max(0, (sw - sc.clientWidth) / 2);
    const targetY = Math.max(0, (sh - sc.clientHeight) / 2);
    sc.scrollLeft = targetX;
    sc.scrollTop = targetY;
  }

  setScale(next, anchor = null) {
    const prev = this.scale || this._currentScale();
    const clamped = Math.max(0.1, Math.min(5, next));
    this.scale = clamped;
    // Expand the scrollable area to match the scaled grid dimensions so
    // overflow remains reachable via the scrollbars.
    this._syncSizer();
    if (anchor && this.scrollContainer) {
      const sc = this.scrollContainer;
      const rect = sc.getBoundingClientRect();
      const offsetX = anchor.x - rect.left + sc.scrollLeft;
      const offsetY = anchor.y - rect.top + sc.scrollTop;
      const ratio = clamped / prev;
      sc.scrollLeft = offsetX * ratio - (anchor.x - rect.left);
      sc.scrollTop = offsetY * ratio - (anchor.y - rect.top);
    } else {
      this._centerViewport();
    }
    this.el.style.transform = `scale(${clamped})`;
    this.el.style.setProperty('--canvas-scale', String(clamped));
    this.el.dispatchEvent(new Event('zoom', { bubbles: true }));
  }

  _updateGridHeight() {
    const { cellHeight } = this.options;
    const rows = this.widgets.reduce((m, w) => {
      const y = +w.dataset.y || 0;
      const h = +w.getAttribute('gs-h') || 1;
      return Math.max(m, y + h);
    }, 0);
    // Use CSS min-height if present, otherwise fall back to the
    // scroll container's current client height so an empty grid still
    // has a visible size.
    const cssMin = parseFloat(getComputedStyle(this.el).minHeight) || 0;
    const containerMin = (this.scrollContainer && this.scrollContainer.clientHeight) || 0;
    const min = Math.max(cssMin, containerMin);
    const height = Math.max(rows * cellHeight, min);
    this.el.style.height = `${height}px`;
    this._syncSizer();
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
      const xPercent = Math.min((x * columnWidth / gridW) * 100, 100);
      const yPercent = Math.min((y * cellHeight / gridH) * 100, 100);
      el.dataset.xPercent = xPercent;
      el.dataset.yPercent = yPercent;
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
        startX = e.clientX; startY = e.clientY;
        // Use grid data and column size for unscaled starting values
        startGX = +widget.dataset.x || 0;
        startGY = +widget.dataset.y || 0;
        startW = (+widget.getAttribute('gs-w') || 1) * this.options.columnWidth;
        startH = (+widget.getAttribute('gs-h') || 1) * this.options.cellHeight;
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
            const sc = this._currentScale();
            const dx = (e.clientX - startX) / sc;
            const dy = (e.clientY - startY) / sc;
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
              this.update(widget, opts);
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
        startX = e.clientX; startY = e.clientY;
        startGX = +el.dataset.x || 0;
        startGY = +el.dataset.y || 0;
        startW = (+el.getAttribute('gs-w') || 1) * this.options.columnWidth;
        startH = (+el.getAttribute('gs-h') || 1) * this.options.cellHeight;
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
            const sc = this._currentScale();
            const dx = (e.clientX - startX) / sc;
            const dy = (e.clientY - startY) / sc;
            if (live) {
              let w = startW + dx;
              let hVal = startH + dy;
              const minW = (+el.getAttribute('gs-min-w') || 1) * this.options.columnWidth;
              const minH = (+el.getAttribute('gs-min-h') || 1) * this.options.cellHeight;
              w = Math.max(minW, w);
              hVal = Math.max(minH, hVal);
              this.update(el, {
                w: Math.round(w / this.options.columnWidth),
                h: Math.round(hVal / this.options.cellHeight)
              });
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
      const snap = snapToGrid(
        targetX,
        targetY,
        this.options.columnWidth,
        this.options.cellHeight
      );
      el.dataset.x = snap.x;
      el.dataset.y = snap.y;
      if (this.options.percentageMode) {
        const gridW = this.el.clientWidth || 1;
        const gridH = this.el.clientHeight || 1;
        el.dataset.xPercent = Math.min((snap.x * this.options.columnWidth / gridW) * 100, 100);
        el.dataset.yPercent = Math.min((snap.y * this.options.cellHeight / gridH) * 100, 100);
      }
      if (this.options.liveSnap) {
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
      const sc = this._currentScale();
      targetX = startGX * this.options.columnWidth + (e.clientX - startX) / sc;
      targetY = startGY * this.options.cellHeight + (e.clientY - startY) / sc;
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
  return new CanvasGrid(options, el);
}
