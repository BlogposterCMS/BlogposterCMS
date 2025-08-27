// public/plainspace/grid-core/geometry.js
// Core geometry utilities for grid calculations

export function localRect(el, ctx, scale = 1) {
  const r = el.getBoundingClientRect();
  const c = ctx.getBoundingClientRect();
  return {
    x: (r.left - c.left + ctx.scrollLeft) / scale,
    y: (r.top - c.top + ctx.scrollTop) / scale,
    w: r.width / scale,
    h: r.height / scale
  };
}

export function snapToGrid(x, y, columnWidth, cellHeight) {
  const gx = Math.round(x / columnWidth);
  const gy = Math.round(y / cellHeight);
  return { x: gx, y: gy };
}

export function elementRect(el) {
  return {
    x: +el.dataset.x || 0,
    y: +el.dataset.y || 0,
    w: +el.getAttribute('gs-w') || 1,
    h: +el.getAttribute('gs-h') || 1
  };
}

export function rectsCollide(a, b) {
  return !(
    b.x >= a.x + a.w ||
    b.x + b.w <= a.x ||
    b.y >= a.y + a.h ||
    b.y + b.h <= a.y
  );
}
