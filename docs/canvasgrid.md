# CanvasGrid

CanvasGrid powers the drag‑and‑drop page builder using a lightweight module written specifically for BlogposterCMS.

## Features

- GPU‑accelerated transforms keep dragging and resizing smooth at 60fps.
- Widgets remain inside the grid and can be layered using `data-layer` for z-index control.
- Optional push mode prevents overlaps by moving surrounding widgets out of the way.
- Percentage based sizing lets layouts adapt responsively.
- All mouse, touch and keyboard events are forwarded through `bindGlobalListeners` for centralized handling.

## Usage

Initialize the grid in your admin scripts:

```js
import { init as initCanvasGrid } from '/plainspace/main/canvasGrid.js';

const grid = initCanvasGrid({ cellHeight: 6, columnWidth: 6 }, '#builderGrid');
```

Widgets can be added or updated programmatically:

```js
const el = grid.addWidget({ x: 0, y: 0, w: 2, h: 2 });

grid.update(el, { x: 1, y: 1 });
```

Listen for the `change` event to persist layout updates when users move or resize widgets.

Grid calculations are shared through `grid-utils.js`. Import helpers like
`snapToGrid`, `elementRect` and `rectsCollide` to keep widget logic
consistent across modules.
