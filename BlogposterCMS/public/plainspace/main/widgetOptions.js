export function applyWidgetOptions(wrapper, opts = {}, grid) {
  if (!opts) return;
  if (opts.max) wrapper.classList.add('max');
  if (opts.maxWidth) wrapper.classList.add('max-width');
  if (opts.maxHeight) wrapper.classList.add('max-height');

  let wPercent = null;
  let hPercent = null;

  if (opts.halfWidth) {
    wrapper.classList.add('half-width');
    wPercent = 50;
  }
  if (opts.thirdWidth) {
    wrapper.classList.add('third-width');
    wPercent = 33.333;
  }
  if (typeof opts.width === 'number') {
    wPercent = opts.width;
  }
  if (typeof opts.height === 'number') {
    hPercent = opts.height;
  }

  if (grid) {
    const update = {};
    const cw = grid.options.columnWidth;
    const ch = grid.options.cellHeight;
    const gw = grid.el.clientWidth || 1;
    const gh = grid.el.clientHeight || 1;
    if (wPercent != null) {
      update.w = Math.max(1, Math.round((wPercent / 100) * gw / cw));
    }
    if (hPercent != null) {
      update.h = Math.max(1, Math.round((hPercent / 100) * gh / ch));
    }
    grid.update(wrapper, update);
  }

  if (wPercent != null) wrapper.dataset.wPercent = wPercent;
  if (hPercent != null) wrapper.dataset.hPercent = hPercent;
  if (opts.overflow) wrapper.classList.add('overflow');
  if (grid && wPercent == null && hPercent == null) {
    grid.update(wrapper, {});
  }
}
