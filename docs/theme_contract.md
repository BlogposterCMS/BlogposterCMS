# Theme Contract

Themes in BlogposterCMS are presentation packages. They define how an existing
site looks; they do not define what the site can do.

This boundary is intentional. Blogposter keeps styling, interaction, data and
backend behavior separated so a theme cannot become a hidden feature system,
slow down the whole site, or take ownership of user data and business logic.

## Core Rule

A theme may provide:

- CSS or SCSS for global visual styling.
- Static presentation assets such as fonts, icons, background images and
  decorative media referenced by theme styles.
- Theme metadata in `theme.json`.
- Design tokens such as colors, spacing, typography, borders and shadows.

A theme must not provide:

- Business logic, content logic, workflow logic or permission logic.
- Database access, settings mutations, user/account changes or module changes.
- Direct event-bus contracts, runtime API contracts or cross-module messaging.
- Widgets, apps, modules, importers, exporters or page-builder behavior.
- Proprietary framework state that a user must keep in order to edit the site.
- Remote network calls, JavaScript files or third-party scripts.

`theme.js` is not a theme capability surface. Blogposter does not generate,
expose or serve JavaScript from `/themes`; interactive features belong in
widgets, modules or apps with explicit permissions and documented contracts.

## Responsibility Split

- Themes own visual language: global CSS, tokens and static presentation assets.
- Widgets own reusable frontend blocks and user-facing interactions.
- Modules own backend capabilities, storage, permissions and event contracts.
- Apps own larger workflow surfaces.
- Importers and exporters own migration packaging and conversion steps.

This split avoids WordPress-style feature/theme overlap where one package can
secretly carry too much responsibility. A user should be able to switch themes
without losing content, workflows, permissions or module communication.

## Theme Manifest

Themes are discovered from `public/themes/<slug>/`. The `theme.json` file is
metadata only. It describes the package; it does not grant capabilities.

Example:

```json
{
  "name": "Clean Editorial",
  "version": "1.0.0",
  "developer": "Blogposter",
  "description": "A minimal presentation theme for editorial pages.",
  "assets": {
    "css": "/themes/clean-editorial/theme.css",
    "scss": "/themes/clean-editorial/theme.scss"
  }
}
```

Manifest rules:

- The folder name is the theme slug. `theme.json` cannot override it.
- Asset paths must stay under `/themes/<slug>/`.
- Only `name`, `version`, `developer`, `description`, `assets`, `tokens` and
  `imported` are accepted as top-level fields.
- Do not add module, app, widget, route, event, permission, JavaScript, runtime
  or database fields.
- Do not use `theme.json` to smuggle feature flags or proprietary runtime state;
  invalid manifests are rejected.

## WordPress And HTML Imports

Rendered WordPress, Elementor, Divi or Gutenberg output can help build a visual
theme, but the imported responsibilities still need to be split:

- Global CSS, fonts and design tokens can become a Blogposter theme.
- Posts, pages, media, menus and SEO metadata belong in content or migration
  importers.
- Elementor, Divi or Gutenberg behavior should become widgets, modules or
  sanitized HTML fallbacks, not theme-owned logic.
- Full rendered page captures are page/content package data, not a theme
  contract.

The safe migration path is therefore: capture the rendered site, extract global
style assets into a theme, import content and media separately, and map known
interactive parts to widgets or modules.

## Acceptance Checklist

A theme is healthy when:

- The page still has its content and behavior if the theme is disabled.
- The same widgets and modules can run under another theme.
- The theme can be activated or removed without database migrations.
- The theme has no hidden ownership of user data or feature state.
- The visual result is fast because the theme only carries presentation assets.
