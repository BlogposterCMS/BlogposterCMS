// @ts-nocheck
// public/plainspace/main/canvasGrid.ts
// Lightweight drag & resize grid for the builder
import { bindGlobalListeners } from './globalEvents.js';
import { BoundingBoxManager } from './BoundingBoxManager.js';
import { snapToGrid, elementRect, rectsCollide } from './grid-utils.js';
const COLUMN_WIDTH_EPSILON = 0.01;
export class CanvasGrid {
    constructor(options = {}, el) {
        this.options = Object.assign({
            // 1px baseline grid for pixel-perfect alignment
            cellHeight: 1,
            columnWidth: 1,
            columns: Infinity,
            rows: Infinity,
            pushOnOverlap: false,
            percentageMode: false,
            liveSnap: false,
            liveSnapResize: false,
            bboxHandles: true,
            enableZoom: true
        }, options);
        this.staticGrid = Boolean(this.options.staticGrid);
        this.pushOnOverlap = Boolean(this.options.pushOnOverlap);
        if (Number.isFinite(this.options.column)) {
            this.options.columns = this.options.column;
        }
        this.enableZoom = this.options.enableZoom !== false;
        this.el = typeof el === 'string' ? document.querySelector(el) : el;
        if (this.el)
            this.el.__grid = this;
        this.el.classList.add('canvas-grid');
        // The scroll container hosts the scrollbars. Default to the grid's
        // parent element, but allow an explicit element via options.
        this.scrollContainer = options.scrollContainer || this.el.parentElement || this.el;
        // Create a sizing wrapper to expand with zoom so the scrollbars show
        // inside the designer rather than on the page.
        try {
            if (this.enableZoom &&
                this.scrollContainer &&
                this.el.parentElement === this.scrollContainer) {
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
        }
        catch { /* non-fatal if DOM structure unexpected */ }
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
        }
        else {
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
        this._canvasMetrics = null;
        this._lastColumnWidth = Math.max(1, this.options.columnWidth || 0);
        this._updateGridHeight();
        this._refreshCanvasMetrics();
        // Observe container size changes (e.g., sidebar open/close) and
        // recompute column width so percentage-based layout stays correct.
        try {
            let prevWidth = this._refreshCanvasMetrics().width || 1;
            const _ro = new ResizeObserver(() => {
                // Use the inner width (minus padding) so column calculations
                // remain accurate even if the canvas has decorative padding.
                const { width: w } = this._refreshCanvasMetrics();
                const columnChanged = this._syncColumnWidthFromWidth(w);
                // If something is selected, ensure the bbox follows
                if (columnChanged && this.activeEl) {
                    this._updateBBox();
                }
                // Keep the zoom sizer in sync with container width changes
                this._syncSizer();
                // Only re-center when width changes and the user is near the origin
                const sc = this.scrollContainer;
                const widthChanged = Math.round(w) !== Math.round(prevWidth);
                const nearOrigin = sc && sc.scrollLeft < 50 && sc.scrollTop < 50;
                if (widthChanged && nearOrigin) {
                    this._centerViewport();
                }
                prevWidth = w;
            });
            _ro.observe(this.el);
            this._containerRO = _ro;
        }
        catch { /* ResizeObserver not supported */ }
        if (this.options.percentageMode) {
            let resizeToken = 0;
            const handleResize = () => {
                if (resizeToken)
                    return;
                resizeToken = requestAnimationFrame(() => {
                    resizeToken = 0;
                    const { width: w } = this._refreshCanvasMetrics();
                    const columnChanged = this._syncColumnWidthFromWidth(w);
                    if (columnChanged && this.activeEl) {
                        this._updateBBox();
                    }
                });
            };
            window.addEventListener('resize', handleResize);
            this._windowResizeHandler = handleResize;
        }
        // Zoom state and handler (Ctrl + wheel). Zoom towards the cursor
        // position for intuitive focal-point zooming within the grid area.
        this.scale = 1;
        if (this.enableZoom) {
            this.el.style.setProperty('--canvas-scale', '1');
            // Top-left transform origin keeps the canvas from drifting when zoomed out
            this.el.style.transformOrigin = '0 0';
            const wheelZoom = e => {
                if (!e.ctrlKey)
                    return;
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
    }
    on(evt, cb) {
        this._emitter.addEventListener(evt, e => cb(e.detail));
    }
    emitChange(el, meta = {}) {
        const { width } = this._getCanvasMetrics();
        this._emit('change', { el, width, ...meta });
    }
    _emit(evt, detail) {
        this._emitter.dispatchEvent(new CustomEvent(evt, { detail }));
    }
    _currentScale() {
        const v = parseFloat(getComputedStyle(this.el).getPropertyValue('--canvas-scale') || '1');
        return Number.isFinite(v) && v > 0 ? v : 1;
    }
    _syncSizer() {
        if (!this.sizer)
            return;
        const scale = this.scale || this._currentScale();
        // Base the width on the larger of the unscaled scroll container and the
        // grid itself so manual width changes don't clip the canvas when it
        // exceeds the viewport while still avoiding runaway scaling during zoom.
        const scW = (this.scrollContainer && this.scrollContainer.clientWidth) || 0;
        const gridW = this.el.offsetWidth || 0;
        const baseW = Math.max(scW, gridW);
        const scH = (this.scrollContainer && this.scrollContainer.clientHeight) || 0;
        const gridH = this.el.offsetHeight || 0;
        const baseH = Math.max(scH, gridH);
        const targetW = baseW * scale;
        const targetH = baseH * scale;
        if (Math.round(this.sizer.offsetWidth) === Math.round(targetW) &&
            Math.round(this.sizer.offsetHeight) === Math.round(targetH)) {
            return;
        }
        this.sizer.style.width = `${targetW}px`;
        this.sizer.style.height = `${targetH}px`;
    }
    _centerViewport() {
        if (!this.scrollContainer)
            return;
        const sc = this.scrollContainer;
        const sw = this.sizer?.clientWidth || this.el.offsetWidth || 0;
        const sh = this.sizer?.clientHeight || this.el.offsetHeight || 0;
        sc.scrollLeft = sw > sc.clientWidth ? (sw - sc.clientWidth) / 2 : 0;
        sc.scrollTop = sh > sc.clientHeight ? (sh - sc.clientHeight) / 2 : 0;
    }
    setScale(next, anchor = null) {
        if (!this.enableZoom)
            return;
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
        }
        else {
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
        this._refreshCanvasMetrics();
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
            if (w > columns)
                w = columns;
            if (x < 0)
                x = 0;
            if (x + w > columns)
                x = columns - w;
        }
        else if (x < 0) {
            x = 0;
        }
        if (Number.isFinite(rows)) {
            if (h > rows)
                h = rows;
            if (y < 0)
                y = 0;
            if (y + h > rows)
                y = rows - h;
        }
        else if (y < 0) {
            y = 0;
        }
        el.dataset.x = x;
        el.dataset.y = y;
        el.setAttribute('gs-w', w);
        el.setAttribute('gs-h', h);
        const layer = +el.dataset.layer || 0;
        el.style.zIndex = layer.toString();
        el.style.position = 'absolute';
        const rotationAttr = el.dataset.rotationDeg ?? el.dataset.rotation ?? el.dataset.rotate;
        const rotationVal = rotationAttr != null
            ? (typeof rotationAttr === 'string'
                ? parseFloat(rotationAttr)
                : Number(rotationAttr))
            : null;
        const rotateSuffix = Number.isFinite(rotationVal) && rotationVal !== 0
            ? ` rotate(${rotationVal}deg)`
            : '';
        el.style.transform =
            `translate3d(${x * columnWidth}px, ${y * cellHeight}px, 0)${rotateSuffix}`;
        if (this.options.percentageMode) {
            const { width: gridW, height: gridH } = this._getCanvasMetrics();
            const xPercent = Math.min((x * columnWidth / gridW) * 100, 100);
            const yPercent = Math.min((y * cellHeight / gridH) * 100, 100);
            el.dataset.xPercent = xPercent;
            el.dataset.yPercent = yPercent;
            if (recalc) {
                const wPercent = Math.min((w * columnWidth / gridW) * 100, 100);
                // Allow widgets to grow taller than the grid viewport when desired.
                // Width remains clamped to 100% to avoid horizontal overflow.
                const hPercent = Math.max((h * cellHeight / gridH) * 100, 0);
                el.dataset.wPercent = wPercent;
                el.dataset.hPercent = hPercent;
            }
            const wPercent = el.dataset.wPercent || 0;
            const hPercent = el.dataset.hPercent || 0;
            el.style.width = `${wPercent}%`;
            el.style.height = `${hPercent}%`;
        }
        else {
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
        if (this.pushOnOverlap)
            this._resolveCollisions(el);
        this._updateGridHeight();
        this.emitChange(el);
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
            if (this.activeEl === el)
                this.clearSelection();
            el.remove();
            this._updateGridHeight();
            this.emitChange(el);
        }
    }
    update(el, opts = {}, meta = {}) {
        if (!el)
            return;
        if (opts.x != null)
            el.dataset.x = opts.x;
        if (opts.y != null)
            el.dataset.y = opts.y;
        if (opts.w != null)
            el.setAttribute('gs-w', opts.w);
        if (opts.h != null)
            el.setAttribute('gs-h', opts.h);
        if (opts.layer != null)
            el.dataset.layer = opts.layer;
        if (opts.locked != null)
            el.setAttribute('gs-locked', opts.locked);
        if (opts.noMove != null)
            el.setAttribute('gs-no-move', opts.noMove);
        if (opts.noResize != null)
            el.setAttribute('gs-no-resize', opts.noResize);
        const recalc = opts.w != null || opts.h != null;
        this._applyPosition(el, recalc);
        if (this.pushOnOverlap)
            this._resolveCollisions(el);
        if (el === this.activeEl)
            this._updateBBox();
        this._updateGridHeight();
        if (!meta.silent)
            this.emitChange(el);
    }
    _bindResize(el) {
        if (this.useBoundingBox && !el) {
            if (!this.bboxManager)
                return;
            const parts = this.bboxManager.box.querySelectorAll('.bbox-edge, .bbox-handle');
            let startX, startY, startW, startH, startGX, startGY, pos;
            const startResize = e => {
                const widget = this.activeEl;
                if (!widget || this.staticGrid)
                    return;
                if (widget.getAttribute('gs-locked') === 'true' ||
                    widget.getAttribute('gs-no-resize') === 'true') {
                    return;
                }
                pos = e.currentTarget.dataset.pos;
                if (!pos)
                    return;
                e.stopPropagation();
                startX = e.clientX;
                startY = e.clientY;
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
                    if (_resizeRAF)
                        return;
                    _resizeRAF = requestAnimationFrame(() => {
                        _resizeRAF = null;
                        const e = _lastEvt;
                        _lastEvt = null;
                        if (!e)
                            return;
                        const sc = this._currentScale();
                        const dx = (e.clientX - startX) / sc;
                        const dy = (e.clientY - startY) / sc;
                        if (live) {
                            let w = startW, hVal = startH;
                            let gx = startGX, gy = startGY;
                            if (pos.includes('e'))
                                w += dx;
                            if (pos.includes('s'))
                                hVal += dy;
                            if (pos.includes('w')) {
                                w -= dx;
                                gx += Math.round(dx / this.options.columnWidth);
                            }
                            if (pos.includes('n')) {
                                hVal -= dy;
                                gy += Math.round(dy / this.options.cellHeight);
                            }
                            w = Math.max(20, w);
                            hVal = Math.max(20, hVal);
                            const opts = {
                                w: Math.round(w / this.options.columnWidth),
                                h: Math.round(hVal / this.options.cellHeight)
                            };
                            if (pos.includes('w'))
                                opts.x = gx;
                            if (pos.includes('n'))
                                opts.y = gy;
                            this.update(widget, opts);
                        }
                        else {
                            let w = startW, hVal = startH;
                            let px = startPX, py = startPY;
                            if (pos.includes('e'))
                                w += dx;
                            if (pos.includes('s'))
                                hVal += dy;
                            if (pos.includes('w')) {
                                w -= dx;
                                px += dx;
                            }
                            if (pos.includes('n')) {
                                hVal -= dy;
                                py += dy;
                            }
                            const minW = (+widget.getAttribute('gs-min-w') || 1) * this.options.columnWidth;
                            const minH = (+widget.getAttribute('gs-min-h') || 1) * this.options.cellHeight;
                            if (w < minW) {
                                px += w - minW;
                                w = minW;
                            }
                            if (hVal < minH) {
                                py += hVal - minH;
                                hVal = minH;
                            }
                            curW = w;
                            curH = hVal;
                            curPX = px;
                            curPY = py;
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
                    if (pos != null)
                        this._emit('resizestop', this.activeEl);
                    pos = null;
                };
                this._emit('resizestart', widget);
                document.addEventListener('pointermove', move);
                document.addEventListener('pointerup', up);
                e.currentTarget?.setPointerCapture?.(e.pointerId);
            };
            parts.forEach(part => part.addEventListener('pointerdown', startResize, { passive: false }));
        }
        else if (!this.useBoundingBox && el) {
            const handle = el.querySelector('.resize-handle');
            if (!handle)
                return;
            let startX, startY, startW, startH, startGX, startGY;
            handle.addEventListener('pointerdown', e => {
                if (this.staticGrid)
                    return;
                if (el.getAttribute('gs-locked') === 'true' ||
                    el.getAttribute('gs-no-resize') === 'true') {
                    return;
                }
                e.stopPropagation();
                this.select(el);
                startX = e.clientX;
                startY = e.clientY;
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
                    if (_resizeRAF)
                        return;
                    _resizeRAF = requestAnimationFrame(() => {
                        _resizeRAF = null;
                        const e = _lastEvt;
                        _lastEvt = null;
                        if (!e)
                            return;
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
                        }
                        else {
                            let w = startW + dx;
                            let hVal = startH + dy;
                            let px = startPX;
                            let py = startPY;
                            const minW = (+el.getAttribute('gs-min-w') || 1) * this.options.columnWidth;
                            const minH = (+el.getAttribute('gs-min-h') || 1) * this.options.cellHeight;
                            if (w < minW)
                                w = minW;
                            if (hVal < minH)
                                hVal = minH;
                            curW = w;
                            curH = hVal;
                            curPX = px;
                            curPY = py;
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
            if (!widget)
                return false;
            const rect = widget.getBoundingClientRect();
            const x = evt.clientX;
            const y = evt.clientY;
            return (x >= rect.right - 24 && x <= rect.right - 8 &&
                y >= rect.top + 8 && y <= rect.top + 24);
        };
        const apply = () => {
            frame = null;
            const snap = snapToGrid(targetX, targetY, this.options.columnWidth, this.options.cellHeight);
            el.dataset.x = snap.x;
            el.dataset.y = snap.y;
            if (this.options.percentageMode) {
                const { width: gridW, height: gridH } = this._getCanvasMetrics();
                el.dataset.xPercent = Math.min((snap.x * this.options.columnWidth / gridW) * 100, 100);
                el.dataset.yPercent = Math.min((snap.y * this.options.cellHeight / gridH) * 100, 100);
            }
            if (this.options.liveSnap) {
                el.style.transform =
                    `translate3d(${snap.x * this.options.columnWidth}px, ${snap.y * this.options.cellHeight}px, 0)`;
            }
            else {
                el.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
            }
            // Drag-Event sofort auslösen…
            el.dispatchEvent(new Event('dragmove', { bubbles: true }));
            // …und nur dann direkt auf ein BBox-Update warten, wenn kein Manager aktiv ist.
            if (this.bboxManager) {
                this.bboxManager.scheduleUpdate();
            }
            else {
                requestAnimationFrame(() => this._updateBBox());
            }
        };
        const move = e => {
            if (!dragging)
                return;
            const sc = this._currentScale();
            targetX = startGX * this.options.columnWidth + (e.clientX - startX) / sc;
            targetY = startGY * this.options.cellHeight + (e.clientY - startY) / sc;
            if (!frame)
                frame = requestAnimationFrame(apply);
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
            if (!allowed)
                return;
            if (el.getAttribute('gs-locked') === 'true' || el.getAttribute('gs-no-move') === 'true')
                return;
            e.preventDefault();
            this.select(el);
            startX = e.clientX;
            startY = e.clientY;
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
            if (e.target.closest('.bbox-handle') || e.target.closest('.bounding-box'))
                return;
            startDrag(e);
        };
        el.addEventListener('pointerdown', start);
        el._gridDragStart = startDrag;
    }
    _syncColumnWidthFromWidth(width) {
        const cols = this.options.columns;
        if (!Number.isFinite(width) || width <= 0)
            return false;
        if (!Number.isFinite(cols) || cols <= 0)
            return false;
        const nextUnit = Math.max(1, width / cols);
        const prevUnit = Math.max(1, this._lastColumnWidth || 0);
        if (Math.abs(nextUnit - prevUnit) < COLUMN_WIDTH_EPSILON) {
            return false;
        }
        this.options.columnWidth = nextUnit;
        this._lastColumnWidth = nextUnit;
        this.widgets.forEach(wi => this._applyPosition(wi, false));
        return true;
    }
    _refreshCanvasMetrics() {
        const style = getComputedStyle(this.el);
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingRight = parseFloat(style.paddingRight) || 0;
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const paddingBottom = parseFloat(style.paddingBottom) || 0;
        let width = (this.el.clientWidth || 0) - paddingLeft - paddingRight;
        let height = (this.el.clientHeight || 0) - paddingTop - paddingBottom;
        if (!Number.isFinite(width) || width <= 0) {
            width = this.el.clientWidth || parseFloat(style.width) || 0;
        }
        if (!Number.isFinite(height) || height <= 0) {
            height = this.el.clientHeight || parseFloat(style.height) || 0;
        }
        this._canvasMetrics = {
            width,
            height,
            paddingLeft,
            paddingRight,
            paddingTop,
            paddingBottom
        };
        return this._canvasMetrics;
    }
    _getCanvasMetrics() {
        return this._canvasMetrics || this._refreshCanvasMetrics();
    }
    refreshMetrics() {
        return this._refreshCanvasMetrics();
    }
    // snapToGrid, elementRect and rectsCollide are imported from grid-utils.js
    _fitsWithin(x, y, w, h) {
        if (x < 0 || y < 0)
            return false;
        const { columns, rows } = this.options;
        if (Number.isFinite(columns) && x + w > columns)
            return false;
        if (Number.isFinite(rows) && y + h > rows)
            return false;
        return true;
    }
    _countCollisionsForRect(testRect, ignore = new Set()) {
        let count = 0;
        this.widgets.forEach(candidate => {
            if (ignore.has(candidate))
                return;
            const candidateRect = elementRect(candidate);
            if (rectsCollide(testRect, candidateRect))
                count += 1;
        });
        return count;
    }
    _maxOccupiedBounds() {
        return this.widgets.reduce((acc, el) => {
            const r = elementRect(el);
            return {
                maxX: Math.max(acc.maxX, r.x + r.w),
                maxY: Math.max(acc.maxY, r.y + r.h)
            };
        }, { maxX: 0, maxY: 0 });
    }
    _findNearestSlot(width, height, origin, ignore) {
        const { columns, rows } = this.options;
        const bounds = this._maxOccupiedBounds();
        const colLimit = Number.isFinite(columns)
            ? columns
            : Math.max(bounds.maxX + width + 1, origin.x + width + 1, width);
        const rowLimit = Number.isFinite(rows)
            ? rows
            : Math.max(bounds.maxY + height + 1, origin.y + height + 1, height);
        const startY = Math.max(0, origin.y);
        const startX = Math.max(0, Math.min(origin.x, Math.max(0, colLimit - width)));
        for (let y = startY; y <= Math.max(startY, rowLimit - height); y += 1) {
            for (let x = startX; x <= Math.max(startX, colLimit - width); x += 1) {
                if (!this._fitsWithin(x, y, width, height))
                    continue;
                const candidate = { x, y, w: width, h: height };
                if (this._countCollisionsForRect(candidate, ignore) === 0) {
                    return { x, y };
                }
            }
            for (let x = 0; x < startX; x += 1) {
                if (!this._fitsWithin(x, y, width, height))
                    continue;
                const candidate = { x, y, w: width, h: height };
                if (this._countCollisionsForRect(candidate, ignore) === 0) {
                    return { x, y };
                }
            }
        }
        return null;
    }
    _determineNextPosition(activeWidget, activeRect, other, otherRect) {
        const width = Math.max(1, Math.round(otherRect.w));
        const height = Math.max(1, Math.round(otherRect.h));
        const ignore = new Set([other]);
        const bounds = this._maxOccupiedBounds();
        const { columns, rows } = this.options;
        const activeMaxX = Math.max(activeRect.x + activeRect.w, 0);
        const activeMaxY = Math.max(activeRect.y + activeRect.h, 0);
        const seedMaxX = Math.max(otherRect.x + otherRect.w, 0);
        const seedMaxY = Math.max(otherRect.y + otherRect.h, 0);
        const colLimit = Number.isFinite(columns)
            ? Math.max(columns, width)
            : Math.max(bounds.maxX, activeMaxX, seedMaxX) + width + 5;
        const rowLimit = Number.isFinite(rows)
            ? Math.max(rows, height)
            : Math.max(bounds.maxY, activeMaxY, seedMaxY) + height + 5;
        const gridWidth = Math.max(0, Math.ceil(colLimit));
        const gridHeight = Math.max(0, Math.ceil(rowLimit));
        const occupancy = Array.from({ length: gridHeight }, () => new Uint8Array(gridWidth));
        this.widgets.forEach(candidate => {
            if (ignore.has(candidate))
                return;
            const rect = elementRect(candidate);
            const startX = Math.max(0, Math.floor(rect.x));
            const endX = Math.min(gridWidth, Math.ceil(rect.x + rect.w));
            const startY = Math.max(0, Math.floor(rect.y));
            const endY = Math.min(gridHeight, Math.ceil(rect.y + rect.h));
            for (let y = startY; y < endY; y += 1) {
                for (let x = startX; x < endX; x += 1) {
                    occupancy[y][x] = 1;
                }
            }
        });
        const fits = (x, y) => {
            if (!this._fitsWithin(x, y, width, height))
                return false;
            if (y + height > gridHeight || x + width > gridWidth)
                return false;
            for (let yy = y; yy < y + height; yy += 1) {
                for (let xx = x; xx < x + width; xx += 1) {
                    if (occupancy[yy][xx])
                        return false;
                }
            }
            return true;
        };
        const snap = value => Math.max(0, Math.round(value));
        const adjacent = [
            { x: snap(otherRect.x), y: snap(activeRect.y + activeRect.h) },
            { x: snap(otherRect.x), y: snap(activeRect.y - height) },
            { x: snap(activeRect.x + activeRect.w), y: snap(otherRect.y) },
            { x: snap(activeRect.x - width), y: snap(otherRect.y) }
        ];
        for (const candidate of adjacent) {
            if (fits(candidate.x, candidate.y)) {
                return { x: candidate.x, y: candidate.y };
            }
        }
        const maxRowStart = Math.max(0, gridHeight - height);
        const maxColStart = Math.max(0, gridWidth - width);
        const originY = Math.max(0, Math.min(activeRect.y, otherRect.y));
        const originX = Math.max(0, Math.min(activeRect.x, otherRect.x));
        const startRow = Math.min(Math.floor(originY), maxRowStart);
        const startCol = Math.min(Math.floor(originX), maxColStart);
        const rowOrder = [];
        for (let y = startRow; y <= maxRowStart; y += 1) {
            rowOrder.push(y);
        }
        for (let y = 0; y < startRow; y += 1) {
            rowOrder.push(y);
        }
        for (const y of rowOrder) {
            const colOrder = [];
            for (let x = startCol; x <= maxColStart; x += 1) {
                colOrder.push(x);
            }
            for (let x = 0; x < startCol; x += 1) {
                colOrder.push(x);
            }
            for (const x of colOrder) {
                if (fits(x, y)) {
                    return { x, y };
                }
            }
        }
        const fallbackOrigin = {
            x: Math.max(0, otherRect.x),
            y: Math.max(0, activeRect.y + activeRect.h)
        };
        const fallback = this._findNearestSlot(width, height, fallbackOrigin, ignore);
        if (fallback)
            return fallback;
        return { x: fallbackOrigin.x, y: fallbackOrigin.y };
    }
    _pushWidget(widget, moved = new Set()) {
        if (moved.has(widget))
            return;
        moved.add(widget);
        const rect = elementRect(widget);
        this.widgets.forEach(other => {
            if (other === widget)
                return;
            const oRect = elementRect(other);
            if (rectsCollide(rect, oRect)) {
                const next = this._determineNextPosition(widget, rect, other, oRect);
                if (!next)
                    return;
                other.dataset.x = next.x;
                other.dataset.y = next.y;
                this._applyPosition(other, false);
                this._pushWidget(other, moved);
            }
        });
    }
    _resolveCollisions(el) {
        this._pushWidget(el);
    }
    _updateBBox() {
        if (!this.useBoundingBox || !this.bboxManager || !this.activeEl || this.staticGrid)
            return;
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
        if (this.staticGrid)
            this.clearSelection();
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
