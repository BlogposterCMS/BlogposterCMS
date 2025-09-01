import { init as initCanvasGrid } from '/plainspace/main/canvasGrid.js';

export function initGrid(gridEl, state, selectWidget, opts = {}) {
  const columnCount = 12;
  // Determine the scroll container: prefer explicit option, otherwise
  // use the grid's parent element. This allows zoom to keep scrollbars
  // inside the designer viewport instead of the page.
  const scrollContainer = opts.scrollContainer || gridEl.parentElement || gridEl;
  const enableZoom = opts.enableZoom === true;
  const grid = initCanvasGrid(
    {
      columns: columnCount,
      rows: Infinity,
      pushOnOverlap: false,
      liveSnap: false,
      liveSnapResize: false,
      percentageMode: true,
      bboxHandles: true,
      scrollContainer,
      enableZoom
    },
    gridEl
  );
  gridEl.__grid = grid;

  let cwRAF = null;
  function setColumnWidth() {
    // Recalculate based on the element's clientWidth to ignore any
    // CSS transforms (e.g. panel-open scales the #content). Using
    // getBoundingClientRect() would include transforms and produce
    // incorrect column widths.
    if (cwRAF) return;
    cwRAF = requestAnimationFrame(() => {
      cwRAF = null;
      const containerEl = scrollContainer || gridEl;
      const width = containerEl.clientWidth ||
        // Fallback to computed style if clientWidth is 0 (detached?)
        parseFloat(getComputedStyle(containerEl).width) ||
        // Last resort
        (containerEl.getBoundingClientRect().width || 1);
      grid.options.columnWidth = width / grid.options.columns;
      // Trigger a silent update so widgets re-render to the new width
      grid.widgets.forEach(w => grid.update(w, {}, { silent: true }));
    });
  }
  setColumnWidth();
  window.addEventListener('resize', setColumnWidth);
  // Also observe direct size changes of the grid container (e.g. sidebar toggles).
  const __gridRO = new ResizeObserver(() => setColumnWidth());
  __gridRO.observe(scrollContainer);
  gridEl.__gridRO = __gridRO;

  grid.on('change', el => {
    if (el) selectWidget(el);
  });
  return grid;
}

export function getCurrentLayout(gridEl, codeMap) {
  if (!gridEl) return [];
  const items = Array.from(gridEl.querySelectorAll('.canvas-item'));
  return items.map(el => ({
    id: el.dataset.instanceId,
    widgetId: el.dataset.widgetId,
    global: el.dataset.global === 'true',
    xPercent: +el.dataset.xPercent || 0,
    yPercent: +el.dataset.yPercent || 0,
    wPercent: +el.dataset.wPercent || 0,
    hPercent: +el.dataset.hPercent || 0,
    code: codeMap[el.dataset.instanceId] || null
  }));
}

export function getCurrentLayoutForLayer(gridEl, idx, codeMap) {
  if (!gridEl) return [];
  const items = Array.from(gridEl.querySelectorAll(`.canvas-item[data-layer="${idx}"]`));
  return items.map(el => ({
    id: el.dataset.instanceId,
    widgetId: el.dataset.widgetId,
    global: el.dataset.global === 'true',
    xPercent: +el.dataset.xPercent || 0,
    yPercent: +el.dataset.yPercent || 0,
    wPercent: +el.dataset.wPercent || 0,
    hPercent: +el.dataset.hPercent || 0,
    code: codeMap[el.dataset.instanceId] || null
  }));
}

export function pushState(stack, redoStack, layout) {
  stack.push(JSON.stringify(layout));
  if (stack.length > 50) stack.shift();
  redoStack.length = 0;
}
