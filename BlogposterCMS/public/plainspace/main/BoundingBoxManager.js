// public/plainspace/main/BoundingBoxManager.js

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
    this.box.style.position = 'fixed';
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
    const scale = parseFloat(
      getComputedStyle(this.canvas).getPropertyValue('--canvas-scale') || '1'
    );
    const r = this.widget.getBoundingClientRect();
    const width = Math.max(r.width, this.MIN_W);
    const height = Math.max(r.height, this.MIN_H);
    const dpr = window.devicePixelRatio || 1;
    const rx = Math.round(r.left * dpr) / dpr;
    const ry = Math.round(r.top * dpr) / dpr;
    const rw = Math.round(width * dpr) / dpr;
    const rh = Math.round(height * dpr) / dpr;
    this.box.style.transform = `translate(${rx}px, ${ry}px)`;
    this.box.style.width = `${rw}px`;
    this.box.style.height = `${rh}px`;
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
    const r = this.widget.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(Math.max(r.width, this.MIN_W) * dpr) / dpr;
    const height = Math.round(Math.max(r.height, this.MIN_H) * dpr) / dpr;
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
