import { init as initCanvasGrid } from '/plainspace/main/canvasGrid.js';

export function initGrid(gridEl, state, selectWidget) {
  const columnCount = 12;
  const grid = initCanvasGrid(
    {
      columns: columnCount,
      rows: Infinity,
      pushOnOverlap: false,
      liveSnap: false,
      liveSnapResize: false,
      percentageMode: true,
      bboxHandles: true
    },
    gridEl
  );
  gridEl.__grid = grid;

  let cwRAF = null;
  function setColumnWidth() {
    if (cwRAF) return;
    cwRAF = requestAnimationFrame(() => {
      cwRAF = null;
      const width = gridEl.getBoundingClientRect().width || 1;
      grid.options.columnWidth = width / grid.options.columns;
      grid.widgets.forEach(w => grid.update(w, {}, { silent: true }));
    });
  }
  setColumnWidth();
  window.addEventListener('resize', setColumnWidth);

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
