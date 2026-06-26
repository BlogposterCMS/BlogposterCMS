# Theme Manager

Lists installed themes from `public/themes`, exposes theme metadata over the
event bus, and stores the active frontend theme via `settingsManager`.

## Startup

- Core module.
- Loaded during server startup after the importer module.
- Requires a valid core JWT.

## Purpose

- Read theme metadata from `theme.json`.
- Expose installed themes to admin tools without direct filesystem access.
- Track the active theme through the `ACTIVE_THEME` setting.
- Return conventional presentation assets such as `/themes/<slug>/theme.css`
  and `/themes/<slug>/theme.scss` in theme metadata when present.
- Validate and sanitize `theme.json` metadata before returning it to callers.

## Theme Responsibility

Themes are presentation-only packages. They provide global CSS, design tokens
and static presentation assets; they do not own business logic, widgets,
modules, permissions, event contracts, remote calls or data mutations. This
keeps themes fast, replaceable and unable to become hidden feature containers.

See the [Theme Contract](../theme_contract.md) for the full guideline and
manifest expectations.

## Listened Events

- `listThemes`
- `getTheme`
- `getActiveTheme`
- `activateTheme`

Theme read events require a payload from
`{ moduleName: 'themeManager', moduleType: 'core' }`. If a user token is
attached via `decodedJWT`, read events must include `themes.list`.
`activateTheme` requires `themes.activate` and writes `ACTIVE_THEME` through
`settingsManager` instead of touching the database directly.
`activateTheme` is not a public `/api/meltdown` target; admin/editor clients use
`runtimeManager.cmsAdminApiRequest` with resource `themes` and action
`activate`.

## Boundaries

- Theme slugs must match `[A-Za-z0-9][A-Za-z0-9_-]{0,79}`. Path-like values are
  rejected instead of being normalized into another theme.
- `theme.json` is strict metadata. Only `name`, `version`, `developer`,
  `description`, `assets`, `tokens` and `imported` are accepted.
- `theme.json` cannot declare or override the returned `slug`.
- `theme.json` is metadata only. It must not declare module, app, widget, route,
  event, permission, database, JavaScript or runtime capability fields, even
  when nested under allowed metadata sections.
- Metadata text fields are length-limited and control characters are removed.
- Asset overrides must stay under `/themes/<slug>/`, must not contain traversal,
  backslashes, URLs, query strings, or hashes, and must use the expected
  extension for `css` or `scss`.
- Invalid `theme.json` files make the theme unavailable instead of falling back
  to unsafe metadata.
- The `/themes` static route does not serve executable source or JavaScript
  files. Browser behavior belongs in widgets, modules or apps.
- Unsafe active-theme settings are ignored and the manager falls back to the
  first installed safe theme.
