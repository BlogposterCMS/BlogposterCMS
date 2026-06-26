import { localRect } from '/ui/shared/grid/grid-utils.js';
export class BoundingBoxManager extends EventTarget {
    canvas;
    widget;
    MIN_W = 32;
    MIN_H = 32;
    box;
    edges;
    handles;
    scheduled = false;
    updateHandler;
    ro;
    onLoad = null;
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
        ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'].forEach(pos => {
            const edgePos = pos;
            const edge = document.createElement('div');
            edge.className = `bbox-edge ${edgePos}`;
            edge.dataset.pos = edgePos;
            this.box.appendChild(edge);
            this.edges[edgePos] = edge;
        });
        this.handles = {};
        if (opts.handles !== false) {
            const positions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
            positions.forEach(pos => {
                const handle = document.createElement('div');
                handle.className = `bbox-handle ${pos}`;
                handle.dataset.pos = pos;
                this.box.appendChild(handle);
                this.handles[pos] = handle;
                handle.style.pointerEvents = 'auto';
                handle.style.touchAction = 'none';
            });
        }
        this.updateHandler = () => {
            this.scheduleUpdate();
        };
        this.ro = new ResizeObserver(this.updateHandler);
        this.canvas.addEventListener('scroll', this.updateHandler, true);
        this.canvas.addEventListener('zoom', this.updateHandler, true);
    }
    setWidget(widget) {
        if (this.widget === widget)
            return;
        if (this.onLoad) {
            window.removeEventListener('load', this.onLoad);
            this.onLoad = null;
        }
        if (this.widget) {
            this.widget.removeEventListener('dragmove', this.updateHandler, true);
            this.widget.removeEventListener('resizemove', this.updateHandler, true);
            this.widget.removeEventListener('transitionend', this.updateHandler, true);
            this.widget.removeEventListener('animationend', this.updateHandler, true);
            this.ro.unobserve(this.widget);
        }
        this.widget = widget;
        if (widget) {
            if (!widget.isConnected) {
                requestAnimationFrame(() => this.setWidget(widget));
                return;
            }
            const observe = () => {
                this.ro.observe(widget);
                widget.addEventListener('dragmove', this.updateHandler, true);
                widget.addEventListener('resizemove', this.updateHandler, true);
                widget.addEventListener('transitionend', this.updateHandler, true);
                widget.addEventListener('animationend', this.updateHandler, true);
                this.update();
                this.show();
                this.scheduleUpdate();
            };
            if (document.readyState === 'complete') {
                observe();
            }
            else {
                this.onLoad = () => {
                    observe();
                    this.onLoad = null;
                };
                window.addEventListener('load', this.onLoad, { once: true });
            }
        }
        else {
            this.hide();
        }
        this.dispatchEvent(new CustomEvent('widgetchange', { detail: widget }));
    }
    scheduleUpdate() {
        if (this.scheduled)
            return;
        this.scheduled = true;
        requestAnimationFrame(() => {
            this.scheduled = false;
            this.update();
        });
    }
    update() {
        if (!this.widget)
            return;
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
        const scale = parseFloat(getComputedStyle(this.canvas).getPropertyValue('--canvas-scale') || '1');
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
        if (!this.widget)
            return false;
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
        const scale = parseFloat(getComputedStyle(this.canvas).getPropertyValue('--canvas-scale') || '1');
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
            if (edge)
                edge.style.pointerEvents = flag ? 'none' : 'auto';
        });
        if (flag)
            this.hide();
    }
}
