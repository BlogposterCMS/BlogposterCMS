# Font Packages

BlogposterCMS separates font resources from semantic typography. The existing
`fontsManager` owns provider registration and the available font catalog.
The `fontPackages` core module owns reusable, named typography packages.
The central Color Library continues to own named colors.

This keeps the three responsibilities independent while allowing a Font Package
role to reference a Color Library token.

## Package contract

One package is active at a time. A package has a stable id, an editable name and
settings for these semantic roles:

- Body
- Heading 1 through Heading 6
- Paragraph
- Link
- Button
- Label
- Small text
- Quote
- Code

Each role stores `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`,
`letterSpacing`, `color`, `fontStyle`, `textTransform` and `textDecoration`.
Values are validated as bounded CSS primitives. Font family values cannot carry
CSS syntax, and colors accept only hex values, `inherit`, or linked Blogposter
Color Library values.

The versioned library is persisted through `settingsManager` under
`FONT_PACKAGES_V1`. UI code must not access this setting directly.

## Default and direct overrides

The active package is the default, not a forced lock. New semantic text has no
inline `font-family`, so an H1 uses the active package's H1 role, a paragraph
uses Paragraph, and a link uses Link.

The existing Design Studio font dropdown still supports direct per-text
selection. Its first option is `Default`; choosing it removes the inline font
family and returns that text to the active package. Inline font, size or color
styles remain higher-priority local overrides.

## Runtime contract

Admin surfaces use the Runtime Manager `fontPackages` resource:

- `list` requires `builder.use`.
- `create`, `update`, `updateRole`, `resetRole`, `activate` and `delete` require
  `builder.publish`.

Public rendering can request only `fontPackages.active`. Direct
`fontPackages.*` events are blocked at the HTTP boundary.

The shared browser client in `ui/shared/fonts/fontPackages.ts` installs CSS
variables and scoped semantic rules for public content and Design Studio
`.builder-themed` content. It does not restyle the Designer chrome. Linked role
colors retain the same literal fallback contract as other Color Library uses.

## Design Studio UI

The sidebar intentionally exposes two separate management areas:

- `Color scheme` manages named colors.
- `Font packages` creates, activates, renames, edits and deletes typography
  packages.

The Font Packages editor uses the existing font catalog for family choices and
the Color Scheme for optional linked role colors. It does not create a combined
Brand Kit source of truth.

## Agent feedback

Design Studio publishes package state through `state.fontPackages` and
`meta.fontPackages` on the existing AgentManager/AppLoader surface. Command
actions cover refresh, create, rename, role update/reset, activation and
deletion. There is no parallel Designer-only typography API.

Searchable boundary errors use the `FONT_PACKAGES_*` prefix.
