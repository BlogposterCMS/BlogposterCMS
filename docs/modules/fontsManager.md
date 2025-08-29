# Fonts Manager

Registers font providers such as Google Fonts or Adobe Fonts and allows enabling
or disabling them via the admin settings.

## Startup
- Loaded as a core module during server initialization.
- Loaded after other modules so JWT tokens exist before registration.
- Requires `FONTS_MODULE_INTERNAL_SECRET` in the environment.

## Purpose
- Keeps a registry of available font providers.
- Lets admins toggle providers on or off for privacy.
- Additional providers can register themselves using the
  `registerFontProvider` event. The built-in **Google Fonts** provider is
  disabled by default for privacy. When enabled, the front-end dynamically loads
  the fonts via `fontsLoader.js` so no external requests occur unless
  explicitly allowed.

## Google Fonts Provider

- Env requirements:
  - `FONTS_MODULE_INTERNAL_SECRET` must be set.
  - `GOOGLE_FONTS_API_KEY` must be set to fetch the full catalog.
- Enabling the provider via `setFontProviderEnabled` triggers the provider's
  initialization, which fetches the complete catalog using the Google Webfonts
  API and registers each family in `global.fontsList`.
- Client behavior:
  - `fontsLoader.js` exposes `window.AVAILABLE_FONTS` (names only) and a
    `window.loadFontCss(name)` helper to lazy-load the stylesheet for a
    selected family.
  - This avoids injecting thousands of `<link>` tags up front.

## Listened Events
- `listFontProviders`
- `setFontProviderEnabled`
- `registerFontProvider`
  - Must include a valid JWT, module information and the `FONTS_MODULE_INTERNAL_SECRET`. Providers use this during startup to register.
