# Website branding and UI kits

Settings → Design groups the website defaults:

- **Overview:** names on the left, actual light/dark examples on the right.
- **Branding:** default/light logo, optional dark logo and the separate favicon.
- **Theme:** the existing Color Library schemes and numbered slots; each slot has
  a required light `value` and optional `darkValue`. Clear dark to inherit light.
- **Typography & components:** the existing Font Packages editor, including
  heading, text, link and button roles, plus the existing font-service connection.
- **UI kits:** the existing Site Presets selection, activation and JSON import/export.
  The selected kit can be previewed before activation. Page-demo replacement stays
  inside Designer because Settings does not own a canvas.

The Settings UI Kit gallery remains the CMS component reference. Website UI kits
are the existing declarative Site Presets, not a new theme service or CSS package.

## Data and rendering

`colorLibrary`, `fontPackages` and `sitePresets` keep their existing ownership,
permissions and storage keys. `styleLibrariesPanel` and `sitePresetsPanel` are
shared editors used by Settings and Designer. JSON remains the editable source;
the existing clients produce CSS variables for Designer, live preview and public
pages. A kit's color slots keep the same ids in both modes:

```json
{ "id": "default-1", "name": "Primary", "value": "#171717", "darkValue": "#EEEEEE" }
```

`data-theme="light"` or `data-theme="dark"` selects an explicit mode. Without an
explicit mode, `prefers-color-scheme` applies. Old kits with no dark values retain
their light values. Linked colors use `--bp-color-default-N`; local literal colors
are not rewritten. Text widgets consume the existing `--bp-type-*` role variables
inside Shadow DOM too. Primary buttons use Primary/Background palette slots;
secondary buttons invert that pair, while text links use the Link role color.
Button typography continues to use the Button font role.
The shared public-widget base uses the Body role for its default font and text
color; widget-specific rules and explicit element styles can override it.

Preview rows have stable `data-design-token-id` values. The read-only preview reads
canonical snapshots, or the selected kit for inspection, and renders the actual
button widget. It does not create a second saved representation. A future inline
editor can address these ids and use the current library actions.

The Logo widget is `siteLogo`, inserted from Media → Logo (`media.logo`). It reads
the allowlisted `SITE_LOGO_URL`, `SITE_LOGO_DARK_URL` and `SITE_TITLE` from the public
settings endpoint on each render. It preserves proportions and transparency,
switches themes while mounted, and disposes listeners when removed. A missing
variant uses the available one. Branding changes appear on the next page load or
widget render; open public pages do not poll for logo edits.

## Declarative components

Site Preset schema 1 accepts an optional `components` array. Existing kits remain
valid. The default kit includes twelve ready-to-insert controls. Agents can use
`insert.element` with `componentId` and optional `kitId`/`props` instead of copying
CSS or constructing widget metadata. See the [agent contract](design-studio-agent-feedback.md#ui-kit-components-compact-agent-authoring).

```json
{
  "id": "secondary",
  "name": "Secondary button",
  "type": "button",
  "props": { "label": "Back", "variant": "secondary" },
  "styles": { "borderRadius": "8px", "color": "primary" },
  "darkStyles": { "color": "accent" },
  "states": { "hover": { "borderColor": "accent" } }
}
```

Names populate preview rows; IDs are stable references. Supported types and props:

| Type | Main props |
| --- | --- |
| `button` | `label`, optional safe `href`, `variant: secondary`, `disabled` |
| `text`, `image`, `separator` | `text`; safe `src`/`alt`; no props required |
| `input`, `textarea` | `label`, `value`, `placeholder`, `required`, `disabled`, `hint`, `error`; `inputType` for inputs |
| `select`, `multiselect` | `label`, `options` (strings or `{label,value,disabled}`), `value` (string/string array), field props |
| `checkbox`, `switch` | `label`, `checked`, `disabled` |
| `radio` | `label`, `options`, `value`, `disabled` |
| `tabs` | `tabs: [{label,content}]`, `selectedIndex` |
| `popover`, `tooltip` | `label`, plain-text `content`, `disabled` |

`styles` and `darkStyles` accept the allowlisted camelCase CSS properties in
`componentDefinitions.ts`; aliases `primary/text/background/muted/accent` resolve
to existing numbered Color Library variables. `states`/`darkStates` support
hover, focus, active, disabled, checked, invalid and placeholder. Optional `parts`
style label, option, panel, tab or track using the same property allowlist.
Styles are compiled into scoped CSS; scripts, HTML, arbitrary selectors and
resource-loading CSS functions are rejected. Unknown types and declarative
properties survive import/export, but unknown types show
`UI_KIT_COMPONENT_RENDERER_MISSING` and cannot be inserted.

Limits: 64 components/128 KB per kit, 100 options, 32 tabs and ten data levels.
Named IDs may be omitted on initial import (generated by list position); supply
explicit IDs when later edits/reordering must retain identity.

Insertion resolves a portable **preset snapshot**; editing a kit definition does
not rewrite existing instances. Referenced Color Library and font variables
remain dynamic. Previews and public widgets share `componentRenderer.ts`, the
existing form/tab/select controls and shared popover owner. Enhanced widget
dropdowns use the browser top layer when available to escape clipped canvas
containers; older browsers retain the existing inline menu. Tooltip descriptions
remain accessible inside Shadow DOM. Imported content is plain text.

The UI currently provides JSON import/export, named light/dark previews and
Designer insertion. A full property editor is intentionally deferred; the
machine-readable contract is the primary authoring path.

## Component verification

Focused tests cover settings saves, dark-value validation/storage, kit application,
shared editors, named previews, theme switching, missing/unsafe logo URLs, removal
from Shadow DOM and existing widget rendering parity. Browser proof uses isolated
fixtures with the actual modules at desktop and 390px widths; it does not change
saved site settings or prove a deployment.
