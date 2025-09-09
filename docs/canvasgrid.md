# CanvasGrid

CanvasGrid powers the drag‑and‑drop page builder using a lightweight module written specifically for BlogposterCMS.

## Features

- Configurable column count with responsive widths and percentage-based sizing for consistent layouts.
- GPU‑accelerated transforms and requestAnimationFrame updates keep dragging and resizing smooth at 60fps.
- Transparent edge overlays and corner handles handle resizing while the bounding box stays click-through, keeping internal widget controls accessible.
- Widgets remain inside the grid and can be layered using `data-layer` for z-index control.
- Widgets snap to the grid on drag or resize stop; enable `liveSnap` or `liveSnapResize` for per-frame snapping during drags or resizes.
- Optional push mode prevents overlaps by moving surrounding widgets out of the way.
- All pointer and keyboard events are forwarded through `bindGlobalListeners` for centralized handling.
- Widgets receive a `dragging` class while moved so interfaces can reveal context‑sensitive controls and temporarily drop transitions, shadows and filters for maximum performance.
- Ctrl+wheel zoom scales the grid around its center, keeping layouts anchored in view.
- Header viewport control lets you adjust the layout root width via a slider (default 1920px, up to 3840px) for responsive previews.
- Content edits emit change events so viewport markers capture text or media adjustments for the active width; call `grid.emitChange(el, { contentOnly: true })` after programmatic updates. Change event detail includes `{ el, width, contentOnly }` for the affected widget, current grid width and whether the change only updated content.
- Workspace displays the current viewport width in the top-right corner for quick reference.
- Zoom sizer follows container resize using the unscaled viewport width and expands to the grid's width when the canvas exceeds the viewport, keeping scaled canvases fully scrollable without runaway growth.
- Zoom sizer in the builder now applies equal left and right margins with a doubled top offset so the canvas has balanced spacing within the viewport.
- Viewport recenters on container width changes only when near the origin, preserving scroll position during normal editing.
- Pass `{ enableZoom: false }` to disable zoom and omit the zoom sizer for static dashboards or other non-builder grids.

## Usage

Initialize the grid in your admin scripts:

```js
import { init as initCanvasGrid } from '/plainspace/main/canvasGrid.js';

const gridEl = document.querySelector('#workspaceMain');
const grid = initCanvasGrid({
  columns: 12,
  rows: Infinity,
  pushOnOverlap: false,
  liveSnap: false,
  liveSnapResize: false,
  percentageMode: true,
  bboxHandles: true
}, gridEl);
// pass { liveSnap: true, liveSnapResize: true } to snap widgets during drags and resizes
```

Adjust the column width on resize so the grid spans the full container:

```js
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

After programmatically updating widget contents, call `grid.emitChange(el, { contentOnly: true })` so listeners can react to the adjustment without triggering layout history:

```js
widget.querySelector('img').src = '/new/image.png';
grid.emitChange(widget, { contentOnly: true });
```


Listen for the `change` event to persist layout updates when users move or resize widgets. The callback receives the affected element and current width:

```js
grid.on('change', ({ el, width, contentOnly }) => {
  console.log('changed', el, 'at', width, 'px', contentOnly ? '(content only)' : '');
});
```

When `percentageMode` is enabled, the grid keeps `data-*Percent` attributes (`xPercent`, `yPercent`, `wPercent`, `hPercent`) in sync so you can store layouts in relative units.

Grid calculations are shared through `grid-utils.js`. Import helpers like
`snapToGrid`, `elementRect` and `rectsCollide` to keep widget logic
consistent across modules.
