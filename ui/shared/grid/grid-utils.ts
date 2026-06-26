export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function localRect(el: HTMLElement, ctx: HTMLElement, scale = 1): GridRect {
  const r = el.getBoundingClientRect();
  const c = ctx.getBoundingClientRect();
  return {
    x: (r.left - c.left + ctx.scrollLeft) / scale,
    y: (r.top - c.top + ctx.scrollTop) / scale,
    w: r.width / scale,
    h: r.height / scale
  };
}

export function snapToGrid(x: number, y: number, columnWidth: number, cellHeight: number): { x: number; y: number } {
  const gx = Math.round(x / columnWidth);
  const gy = Math.round(y / cellHeight);
  return { x: gx, y: gy };
}

export function elementRect(el: HTMLElement): GridRect {
  return {
    x: Number(el.dataset.x) || 0,
    y: Number(el.dataset.y) || 0,
    w: Number(el.getAttribute('gs-w')) || 1,
    h: Number(el.getAttribute('gs-h')) || 1
  };
}

export function rectsCollide(a: GridRect, b: GridRect): boolean {
  return !(
    b.x >= a.x + a.w ||
    b.x + b.w <= a.x ||
    b.y >= a.y + a.h ||
    b.y + b.h <= a.y
  );
}
