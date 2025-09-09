# PixelGrid

PixelGrid is a legacy grid system built on the shared grid core modules.
The builder now uses `CanvasGrid` for responsive layouts, but PixelGrid remains available for reference and potential niche use cases.

## Features

- 1px baseline grid for precise placement
- Updates widget geometry directly from the DOM without percentage modes or magic
- Bounding box with resize handles provided by the core `BoundingBoxManager`
- Emits `dragstart`, `dragmove`, `dragstop`, `resizestart`, `resizemove`, `resizestop` and `change` events
- `update(el, opts, { silent: true })` suppresses `change` events during live drags or resizes

## Usage

```js
import { init as initPixelGrid } from '/apps/designer/main/pixelGrid.js';

const gridEl = document.getElementById('workspaceMain');
const grid = initPixelGrid({}, gridEl);
```

PixelGrid is internal to the designer app and does not depend on dashboard scripts.
