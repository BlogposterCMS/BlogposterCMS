# CanvasGrid

CanvasGrid powers the drag‑and‑drop page builder using a lightweight module written specifically for BlogposterCMS.

## Features

- 1px baseline grid for pixel-perfect placement
- GPU‑accelerated transforms and requestAnimationFrame updates keep dragging and resizing smooth at 60fps.
- Widgets remain inside the grid and can be layered using `data-layer` for z-index control.
- Widgets snap to the grid on drag stop; enable `liveSnap` for per-frame snapping during drags.
- Optional push mode prevents overlaps by moving surrounding widgets out of the way.
- Percentage based sizing lets layouts adapt responsively.
- All pointer and keyboard events are forwarded through `bindGlobalListeners` for centralized handling.
- Widgets receive a `dragging` class while moved so interfaces can reveal context‑sensitive controls and temporarily drop transitions, shadows and filters for maximum performance.

## Usage

Initialize the grid in your admin scripts:

```js
import { init as initCanvasGrid } from '/plainspace/main/canvasGrid.js';

const gridEl = document.querySelector('#builderGrid');
const grid = initCanvasGrid({ cellHeight: 1, columnWidth: 1 }, gridEl);
// pass { liveSnap: true } to snap widgets during drags
```

Adjust the column width on resize so the grid spans the full container:

```js
const columnCount = 12;
function setColumnWidth() {
  const width = gridEl.getBoundingClientRect().width;
  grid.options.columnWidth = Math.round(width / columnCount);
  grid.widgets.forEach(w => grid.update(w));
}
setColumnWidth();
window.addEventListener('resize', setColumnWidth);
```

Widgets can be added or updated programmatically:

```js
const el = grid.addWidget({ x: 0, y: 0, w: 2, h: 2 });

grid.update(el, { x: 1, y: 1 });
```
CanvasGrid emits `dragstart` and `dragstop` events for individual widgets. Use them to toggle UI state:

```js
grid.on('dragstart', el => el.classList.add('dragging'));
grid.on('dragstop', el => el.classList.remove('dragging'));
```


Listen for the `change` event to persist layout updates when users move or resize widgets.

Grid calculations are shared through `grid-utils.js`. Import helpers like
`snapToGrid`, `elementRect` and `rectsCollide` to keep widget logic
consistent across modules.
