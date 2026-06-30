# Media Manager

Handles file and folder operations under the media library. It verifies permissions before allowing modifications and can mark files as public.

## Startup
- Core module requiring a JWT token.
- Ensures media folders and tables exist.

## Purpose
- List and create folders.
- Upload files through stream-based middleware.
- Move files or entire folders into the public directory via `makeFilePublic` (requires `builder.publish` permission). The event accepts an explicit `userId` and falls back to the JWT payload's `user.id`, `userId`, `id`, or `sub` fields.
- For security, published builder assets must live under a `builder/` path; other locations are rejected. Paths are normalized to use forward slashes so this check works across operating systems.
- Local file events require a `mediaManager`/`core` payload and an authenticated
  principal with an explicit media, content editing or builder publishing
  permission depending on the operation. Caller-supplied flags such as
  `isAdmin` are ignored for authorization.
- Local file paths are resolved inside the media library root and reject path
  traversal, absolute paths, symlinks and junctions.
- Store CMS attachment metadata such as title, alt text, caption, credit,
  status, visibility, dimensions, checksum and source references.
- Store attachment variants such as thumbnail, medium, large or custom
  renditions.
- Link attachments to content entries or source-owned records with a role and
  stable ordering.

Uploads performed through meltdown events accept empty payloads. Supplying `fileData` as an empty string or zero-length `Buffer` writes the decoded content to disk while preserving the strict MIME/type whitelist enforced by the module.
The whitelist includes common web presentation assets used by imported themes
and visual packages: images (`jpg`, `png`, `gif`, `webp`, `avif`, `svg`, `ico`),
HTML, CSS, JavaScript and webfonts (`woff`, `woff2`, `ttf`, `otf`, `eot`).

## Listened Events
- `listLocalFolder`
- `createLocalFolder`
- `renameLocalItem`
- `deleteLocalItem`
- `uploadFileToFolder` (accepts an empty string or Buffer for `fileData`; only the MIME types listed below are permitted)
- `makeFilePublic`
- `createMediaAttachment` (requires `media.manage`)
- `updateMediaAttachment` (requires `media.manage`)
- `getMediaAttachment`
- `listMediaAttachments`
- `deleteMediaAttachment` (requires `media.manage`)
- `upsertMediaVariant` (requires `media.manage`)
- `listMediaVariants`
- `deleteMediaVariant` (requires `media.manage`)
- `linkMediaToContent` (requires `media.manage`)
- `unlinkMediaFromContent` (requires `media.manage`)
- `listMediaForContent`
- `listContentForMedia` (requires `media.manage`)

File operations check user permissions using the validated JWT permissions from
`userManagement` roles.

## Storage

The module keeps the existing `media_files` table/collection and adds:

- `media_attachments`
- `media_variants`
- `media_relations`

SQLite prefixes table names with `mediamanager_`, Postgres uses the
`mediamanager` schema and Mongo uses bare collection names.

Non-manager attachment lists are automatically restricted to `active` and
`public` records.

## Boundaries

`mediaManager` is a core module because it owns file-system authority under the
media library root. Apps, widgets and community modules should not access local
media paths directly; they use media events, upload routes or higher-level
runtime/admin facades.

Dashboard media surfaces should share the browser-side Explorer helpers in
`ui/shared/media/`. The Media page, shell picker and future global media modal
all use the same Media Manager events for folder listing, folder creation,
upload, share-link creation, rename and delete instead of duplicating local
path handling in each UI caller.

Local file operations normalize every library path relative to the configured
library root. They reject traversal, absolute paths, Windows drive paths,
symlinks and junctions before reading, writing, moving or deleting files.
Upload filenames are reduced to scalar basenames and must resolve to an
allowlisted extension/MIME type.

Attachment, variant and relation metadata is normalized before reaching the
database placeholder layer. Attachment ids and source ids must be scalar values;
object-shaped ids are rejected instead of coerced. `meta` objects are stored as
bounded plain JSON, with unsupported values dropped and unsafe keys such as
`__proto__`, `constructor` and `prototype` discarded.

Public URLs reject executable or ambiguous schemes such as `javascript:`,
`data:`, `vbscript:` and protocol-relative URLs. Non-manager list calls are
forced to public active assets, regardless of caller-supplied status or
visibility filters.
