# Site Presets

Site Presets replace the former Theme package/runtime model. They are
declarative Builder packages, not frontend runtimes.

Installed packages and user-created packages use the same versioned contract.
Installed packages live under `presets/<id>/preset.json`; user packages are
stored through `settingsManager` under `SITE_PRESETS_V1`.

## UI kit workflow

In Design Studio, open **Layout → UI kit**. **Edit colors & typography** opens
the existing central style controls. Give the current setup a name and choose
**Save current as UI kit** to reuse it later. **Use UI kit** applies its central
Color Scheme and Font Package, affecting content linked to those defaults;
the confirmation explains that shared scope. **Use demo** separately replaces
the current scene after confirmation.

**JSON for agents & reuse** exports the selected kit's portable schema, without
installation identity/source fields. Paste JSON with a unique name and choose
**Import as new UI kit**. Import goes through the same permission-checked
`sitePresets.create` domain validation and never auto-applies styles or content.
Client errors distinguish invalid JSON, unsupported `schemaVersion` and input
over 512 KB (`SITE_PRESETS_JSON_INVALID`, `SITE_PRESETS_JSON_VERSION`,
`SITE_PRESETS_JSON_SIZE`). Domain limits and trusted-preset validation also apply.
Pasted JSON and kit names participate in the Designer's shared draft revision.

Agents use `sitePresets.export` (`id`) and `sitePresets.import` on the existing
Designer agent surface; the UI and agent adapters share the same client functions.
Exports return `encoding: base64-utf8` and `jsonParts`. Join the parts, decode
base64 as UTF-8, then parse JSON. For import, encode the edited JSON and split it
into parts of at most 3000 characters; pass `{jsonParts: [...]}`. This preserves
Unicode/whitespace within AgentManager's existing string/depth/array limits.
There are at most 80 parts (180 KB before encoding); larger kits use the UI
importer. Small JSON under 4000 characters may instead use `{json: "..."}`.
Malformed or excessive parts fail with `SITE_PRESETS_AGENT_JSON_INVALID` or
`SITE_PRESETS_AGENT_JSON_SIZE`. Import returns the created kit's id/name.
There is no parallel storage or new public runtime. Kits hold declarative
starting blocks; authored reusable components remain linked designs.

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
