# Share Manager

## Boundaries

Share Manager is the core contract for temporary access to Media Manager files.
It does not expose arbitrary filesystem paths; callers pass Media Manager
library-relative paths and receive share-token records. Apps, widgets and
community modules use admin/runtime facades, while direct events require scoped
`shareManager` core identity and share permissions.

Creates secure share links for files managed by the Media Manager.

## Startup
- Core module requiring a JWT.
- Ensures its database schema exists at startup.

## Purpose
- Generate one-time or time-limited URLs for files.
- Revoke or list existing links.

## Listened Events
- `createShareLink`
- `revokeShareLink`
- `getShareDetails`

All listened events require `jwt`, `moduleName: "shareManager"` and
`moduleType: "core"`. Token permissions are checked to prevent unauthorised
downloads:

- `createShareLink` requires `share.create`.
- `revokeShareLink` requires `share.revoke`.
- `getShareDetails` requires `share.read`.

`createShareLink.filePath` is a Media Manager library-relative path. It is
normalised before storage and cannot be an absolute path, URL, drive path,
traversal path or control-character path. Share tokens are URL-safe short
tokens only.

The URL for generated share links is determined by the `APP_BASE_URL`
environment variable. If unset, it defaults to `https://example.com`.
