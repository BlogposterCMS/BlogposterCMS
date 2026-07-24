# Site Presets

Site Presets replace the former Theme package/runtime model. They are
declarative Builder packages, not frontend runtimes.

Installed packages and user-created packages use the same versioned contract.
Installed packages live under `presets/<id>/preset.json`; user packages are
stored through `settingsManager` under `SITE_PRESETS_V1`.

## Contract

A Site Preset contains only:

- existing Builder layout settings;
- one Color Scheme with numbered Default slots;
- one Font Package with numbered semantic Default slots;
- optional page demos composed from trusted central Builder presets.

It cannot contain CSS, HTML, JavaScript, modules, routes, permissions, event
contracts, database behavior or arbitrary widget code. Unknown fields and
unknown page-demo element presets fail validation with `SITE_PRESETS_*` errors.

Example:

```json
{
  "schemaVersion": 1,
  "id": "site-preset-default",
  "name": "Default",
  "version": "1.0.0",
  "developer": "Blogposter Team",
  "builderSettings": {
    "layoutMode": "free",
    "gap": 0,
    "padding": 0,
    "sceneBackground": "#FFFFFF"
  },
  "colorScheme": {
    "id": "color-scheme-default",
    "name": "Default",
    "colors": [
      { "id": "default-1", "name": "Primary", "value": "#00C4CC" }
    ]
  },
  "fontPackage": {
    "id": "font-package-default",
    "name": "Default",
    "roles": {}
  },
  "pageDemos": []
}
```

## Apply behavior

Applying a Site Preset imports or updates its Color Scheme and Font Package
through their central domain services and activates both. The Builder then
applies the declared layout defaults. A page demo is applied only through the
existing Layout panel and only after confirmation because it replaces the
current scene.

Public rendering never reads a Site Preset id. It uses the active central color
and font defaults, central widgets, the saved DesignDocument and
`/assets/css/runtime.css`. Presets can therefore be removed without breaking a
published page runtime.

## Builder and permissions

Site Presets reuse the existing Layout panel; they do not add another sidebar
mode. Color Schemes and Font Packages remain separate Builder panels.

Runtime Manager exposes:

- `sitePresets.list` with `builder.use`;
- `sitePresets.create`, `sitePresets.apply` and `sitePresets.delete` with
  `builder.publish`.

Installed packages are read-only in the Builder. User packages can be created
from the active color/font defaults and the current central element presets.

## Legacy Theme removal

The old `themeManager`, `ACTIVE_THEME`, `/themes` static route, Theme CSS
injection and `htmlTheme` importer are removed. Admin light/dark mode remains a
personal shell preference and is unrelated to Site Presets.
