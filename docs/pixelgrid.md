# PixelGrid

PixelGrid powers the designer application's drag-and-drop interface using a standalone implementation built on the shared grid core modules.

## Features

- 1px baseline grid for precise placement
- Updates widget geometry directly from the DOM without percentage modes or magic
- Bounding box with resize handles provided by the core `BoundingBoxManager`
- Emits `dragstart`, `dragmove`, `dragstop`, `resizestart`, `resizemove`, `resizestop` and `change` events
- `update(el, opts, { silent: true })` suppresses `change` events during live drags or resizes

## Usage

```js
import { init as initPixelGrid } from '/apps/designer/main/pixelGrid.js';

const gridEl = document.getElementById('builderGrid');
const grid = initPixelGrid({}, gridEl);
```

PixelGrid is internal to the designer app and does not depend on dashboard scripts.
