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

  function setColumnWidth() {
    const width = gridEl.getBoundingClientRect().width;
    grid.options.columnWidth = width / columnCount;
    grid.widgets.forEach(w => grid.update(w));
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
    x: +el.dataset.x || 0,
    y: +el.dataset.y || 0,
    w: +el.getAttribute('gs-w'),
    h: +el.getAttribute('gs-h'),
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
    x: +el.dataset.x || 0,
    y: +el.dataset.y || 0,
    w: +el.getAttribute('gs-w'),
    h: +el.getAttribute('gs-h'),
    code: codeMap[el.dataset.instanceId] || null
  }));
}

export function pushState(stack, redoStack, layout) {
  stack.push(JSON.stringify(layout));
  if (stack.length > 50) stack.shift();
  redoStack.length = 0;
}
