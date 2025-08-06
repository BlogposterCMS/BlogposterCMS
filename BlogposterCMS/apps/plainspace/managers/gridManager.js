import { init as initCanvasGrid } from '../../../public/plainspace/main/canvasGrid.js';

export function initGrid(gridEl, state, selectWidget) {
  const columnWidth = 6;
  const columns = Math.max(1, Math.floor(gridEl.clientWidth / columnWidth));
  const grid = initCanvasGrid({ cellHeight: 6, columnWidth, columns, pushOnOverlap: false }, gridEl);
  gridEl.__grid = grid;

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
