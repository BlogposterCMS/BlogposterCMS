# Grid Core

The grid core provides shared utilities used by both the dashboard `CanvasGrid` and the builder `PixelGrid`.

## Modules

- `geometry.js`: helpers for snapping and rectangle calculations.
- `bbox/BoundingBoxManager.js`: minimal bounding box renderer without mode logic. Provides `setDisabled(flag)` to toggle interaction and mirror the legacy API.
- `events.js`: lightweight event emitter used internally by grid implementations.

These modules contain no UI code and can be imported by any grid implementation without pulling in mode specific behaviour.
