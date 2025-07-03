// public/plainspace/main/grid-utils.js
// Utility functions for grid calculations
export function localRect(el, ctx, scale = 1) {
  const r = el.getBoundingClientRect();
  const c = ctx.getBoundingClientRect();

  return {
    x:  (r.left - c.left + ctx.scrollLeft) / scale,
    y:  (r.top  - c.top  + ctx.scrollTop) / scale,
    w:   r.width  / scale,
    h:   r.height / scale
  };
}
