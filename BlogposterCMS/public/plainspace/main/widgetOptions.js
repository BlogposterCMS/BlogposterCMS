export function applyWidgetOptions(wrapper, opts = {}, grid) {
  if (!opts) return;
  const debug = opts.debug || (grid && grid.options && grid.options.debug);
  if (debug) console.debug('[widgetOptions] opts', opts);
  if (opts.max) {
    wrapper.classList.add('max');
    const m = opts.max;
    if (typeof m === 'number' || (typeof m === 'string' && !isNaN(parseFloat(m)))) {
      const p = parseFloat(m);
      wrapper.style.maxWidth = `${p}%`;
      wrapper.style.maxHeight = `${p}%`;
    }
  }
  if (opts.maxWidth) {
    wrapper.classList.add('max-width');
    const mw = opts.maxWidth;
    if (typeof mw === 'number' || (typeof mw === 'string' && !isNaN(parseFloat(mw)))) {
      const p = parseFloat(mw);
      wrapper.style.maxWidth = `${p}%`;
    }
  }
  if (opts.maxHeight) {
    wrapper.classList.add('max-height');
    const mh = opts.maxHeight;
    if (typeof mh === 'number' || (typeof mh === 'string' && !isNaN(parseFloat(mh)))) {
      const p = parseFloat(mh);
      wrapper.style.maxHeight = `${p}%`;
    }
  }

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
    if (debug) {
      console.debug('[widgetOptions] grid', { gw, gh, cw, ch, wPercent, hPercent });
    }
    if (wPercent != null) {
      update.w = Math.max(1, Math.round((wPercent / 100) * gw / cw));
    }
    if (hPercent != null) {
      update.h = Math.max(1, Math.round((hPercent / 100) * gh / ch));
    }
    if (debug) console.debug('[widgetOptions] update', update);
    grid.update(wrapper, update);
  }

  if (wPercent != null) wrapper.dataset.wPercent = wPercent;
  if (hPercent != null) wrapper.dataset.hPercent = hPercent;
  if (opts.overflow) wrapper.classList.add('overflow');
  if (grid && wPercent == null && hPercent == null) {
    grid.update(wrapper, {});
  }
}
