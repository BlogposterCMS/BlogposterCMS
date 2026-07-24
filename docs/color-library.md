# Color Schemes

The core `colorLibrary` module owns named Color Schemes. One scheme is active
and each scheme contains ordered, stable slots named `Default 1`, `Default 2`,
and so on. Slot display names such as `Primary`, `Text` or `Background` remain
editable.

## Storage and migration

The version 2 library is stored through `settingsManager` under
`COLOR_LIBRARY_V2`:

```json
{
  "version": 2,
  "activeSchemeId": "color-scheme-default",
  "schemes": [{
    "id": "color-scheme-default",
    "name": "Default",
    "colors": [
      { "id": "default-1", "name": "Primary", "value": "#00C4CC" }
    ]
  }]
}
```

Version 1 ungrouped named colors are migrated into one Default scheme in their
existing order. UI code must not access either storage key directly.

## Default slots and direct overrides

Linked values use the slot number, not a package-specific color id:

```css
color: var(--bp-color-default-1, #00C4CC);
```

Switching the active Color Scheme therefore changes every linked `Default 1`
use. The serialized literal fallback keeps content readable if a slot cannot be
resolved.

The shared picker still supports literal custom, document and recent colors.
Choosing one creates a local override for that element; choosing a linked
Default slot follows the active scheme again.

## Runtime and UI

Runtime Manager exposes the `colors` resource. `list` needs `builder.use`; all
scheme and slot mutations need `builder.publish`. Public rendering can only
read the active scheme.

The separate Builder `Color scheme` panel creates, names, activates and deletes
schemes and edits numbered slots. Font Packages may reference these tokens but
do not own colors.

Design Studio publishes scheme state on the existing agent surface under
`state.colorLibrary`. Searchable errors use `COLOR_LIBRARY_*`.
