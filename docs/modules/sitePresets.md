# Site Presets

## Boundaries

`sitePresets` owns strict declarative package validation and user-preset
persistence. Builder apps reach it through Runtime Manager; widgets and public
renderers do not read or apply presets. Applying a package delegates to the
existing color, font and Builder domains and does not create a parallel runtime,
settings store or agent API.

`sitePresets` is a core module that validates, lists, creates, applies and
deletes declarative Builder preset packages.

## Events

- `sitePresets.list`
- `sitePresets.create`
- `sitePresets.apply`
- `sitePresets.delete`

All payloads require
`{ moduleName: 'sitePresets', moduleType: 'core' }` and an internal JWT.
User-scoped reads require `builder.use`; mutations require `builder.publish`.
Direct HTTP event calls are blocked. Admin clients use the Runtime Manager
`sitePresets` resource.

## Ownership

The module owns package validation and user-preset persistence. It delegates:

- Color Scheme import and activation to `colorLibrary`;
- Font Package import and activation to `fontPackages`;
- rendered page composition to the Builder and central widgets.

It has no public static asset route and no public rendering dependency.
See [Site Presets](../site-presets.md) for the package contract.
