# Media Manager

Handles file and folder operations under the media library. It verifies permissions before allowing modifications and can mark files as public.

## Startup
- Core module requiring a JWT token.
- Ensures media folders and tables exist.

## Purpose
- List and create folders.
- Upload files through stream-based middleware.
- Move files or entire folders into the public directory via `makeFilePublic` (requires `builder.publish` permission). The event accepts an explicit `userId` and falls back to the JWT payload's `user.id`, `userId`, `id`, or `sub` fields.
- Serve files already below `library/public` from the canonical `/media/...`
  path. The HTTP boundary applies the same source/secret filename filter and a
  realpath guard before Express serves a file.
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
- Represent local and externally delivered assets through the same attachment
  contract. `storagePath` is the local path or provider object key, `url` is the
  public delivery URL, and provider/CDN details remain bounded attachment
  metadata. Object-storage credentials stay server-side in authenticated,
  encrypted settings; they never enter attachment metadata.

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

Maintenance mode leaves `/media/...` available so the selected maintenance
page can continue to load its published styles, fonts and images.

Static-site migrations should use the existing `staticSiteAssets` importer.
It registers already published local files or OSS/CDN objects here and creates
canonical page relations without bypassing Media Manager. Downloadable
application packages are attachments with category `download` and artifact
metadata; immutable versions remain separate attachment records. The storage
adapters below upload behind this boundary without a second media catalog or
exposing provider credentials to Pages or public HTML.

## Storage adapters and downloadable files

Open **Settings → General → Storage** (`/admin/settings/general?tab=storage`).
The overview lists named connections, their adapter and the default destination.
**Add connection** or **Edit** opens the shared dialog. Choose the adapter for a
new connection, enter its fields and save. Unsaved changes must be saved or
explicitly discarded before closing; failed saves retain the entered values.
Multiple connections can use the same provider. Select a default destination for
new downloads; the publication dialog can override it. All four adapters ship as production
dependencies in the normal Blogposter installation/image; users do not install
SDK packages separately:

- **Local server**: publishes to `library/public/downloads/<uuid>/...` and serves
  through the existing `/media/` boundary.
- **Alibaba OSS**: the official `ali-oss` Node.js SDK. Enter bucket, region
  (for example `oss-cn-hangzhou` or `cn-hangzhou`), access key ID and secret.
- **AWS S3 / S3-compatible storage**: official AWS SDK v3. Enter bucket, region,
  access key ID and secret. Other S3 services can specify an HTTPS endpoint and
  path-style addressing. Compatibility depends on that service's S3 support.
- **WebDAV / Nextcloud**: enter the full HTTPS WebDAV folder address, username
  and password/app password. Redirects are rejected so credentials stay at the
  configured server. Private servers can be browsed without a public base URL;
  direct downloads/publication require a separately accessible public base URL.
  SFTP, FTP and SMB are not implemented; a server address must use a supported adapter.

An optional HTTPS download/CDN base URL points to the bucket root, without the
object key. Native Alibaba/AWS defaults are derived if this field and endpoint
are empty. Custom endpoints require an explicit delivery base URL for publication. Bucket/CDN
read policy must permit public downloads under `downloads/`; Blogposter never
changes bucket policy or sets public object ACLs. A private bucket can be used
behind a CDN configured to authenticate to the origin.

Save, then **Test connection**. This calls Alibaba `getBucketInfo` or S3
`HeadBucket` (local: directory access). It checks that operation only, not object
write/delete permission or anonymous CDN access (WebDAV: depth-zero PROPFIND). Provider accounts may need
separate permissions for the bucket check. For a full live check, publish a
small disposable file and open its returned URL without authentication, then
compare its SHA-256 hash. SDK unit tests are not cloud acceptance evidence.

In Media, **Publish download** opens the shared dialog with an explicit storage
destination. **Upload and publish** creates a public download. This route accepts
the existing presentation MIME/extension set plus APK, ZIP and PDF. It spools the
upload to a temporary file with backpressure, calculates SHA-256, uploads under
a new UUID key and registers the existing attachment contract:

- `url`: stable direct delivery URL, never an expiring signed link.
- `storagePath`: local public path or provider object key.
- `checksum`, `sizeBytes`, `visibility: public`, `category: download`.
- `meta.storage`: `connectionId`, `provider`, `bucket`, `objectKey`, `deliveryUrl`.
- `meta.artifact.version`: optional app version, retaining the import contract.

The Media Explorer sidebar shows Local server and each named connection. Remote
folders/files use the same file view; adapters list the actual remote folder.
Legacy external catalog links remain visible under External files locations via
the canonical `media.list` data client. Remote browsing does not mirror bytes or
create another catalog. Folder creation, rename, delete and ordinary local upload
remain enabled only for Local server; remote writes use Publish download.
Switching storage affects future download publications only; existing
URLs and local builder/picker uploads stay unchanged. No automatic migration or
bulk publication occurs. Removing a catalog entry through the existing metadata
API does not delete the underlying object or revoke an already-public URL.

The shared `MAX_UPLOAD_BYTES` limit defaults to 20,000,000 bytes. Configure an
appropriate limit and reverse-proxy upload timeout/body limit for APK releases.
Uploads pass through Blogposter temporarily; downloads go directly to OSS/CDN.
AWS uses a single streamed PutObject, so configure limits below its single-object
upload limit. Resumable/multipart cloud uploads are not implemented.

### Server boundary and adapter contract

Implementations live in `mother/modules/mediaManager/storage/adapters/`, following
the folder discovery pattern used by `auth/strategies`. To add an adapter, add a
server-side `.js` file exporting a factory plus `definition: { id, label, fields }`.
Each field declares `name`, `label`, optional `type` (`url`, `checkbox`, text),
`secret`, `required` and `hint`. The Settings form uses this descriptor directly.
An optional `normalize(config, { fail, httpsUrl })` handles provider-specific validation.
No provider switch or additional UI form is required. Restart after installing
trusted adapter code; there is no arbitrary-code upload/install endpoint.

Factories share `put({ key, filePath, mimeType, sizeBytes })`, `head(key)`, `delete(key)`, `test()`
and `downloadUrl(key, options)`. The cloud `downloadUrl` methods support signed
URLs internally; there is no public arbitrary-key signing endpoint. Remote adapters
also implement `list(path)` returning `{ folders: string[], objects: [{ key, size,
modifiedAt }] }` with full object keys and immediate child prefixes. Local browsing
retains `listLocalFolder`. Reads accept safe object paths; writes/deletes remain
restricted to unique `downloads/` keys. SDKs are lazy-loaded server-side.

The Media Manager HTTP upload boundary exposes:

| Method | Path | Permission / purpose |
| --- | --- | --- |
| GET | `/admin/api/media/storage` | `media.manage`, sanitized configuration |
| PUT | `/admin/api/media/storage` | plus `settings.unified.editSettings`, save |
| GET | `/admin/api/media/storage/files?connectionId=…&path=…` | `media.manage`, remote folder listing |
| POST | `/admin/api/media/storage/test` | both permissions, saved bucket check |
| POST | `/admin/api/media/storage/upload` | `media.manage`, multipart `file` and optional `appVersion`, publish |

Test and upload accept `?connectionId=…`; an unknown id fails closed. Omitting it
uses the saved default for backwards compatibility. PUT uses `connectionId: "new"`
to add, or an existing id to edit, plus `name`, `provider`, adapter fields and
`makeDefault`. GET returns safe `connections`, `adapters` and `defaultConnectionId`.
The encrypted version-2 document keeps connections together; legacy single-provider
settings are retained as a named connection and migrated on the next save.

All writes require the existing CSRF protection and validated cookie session.
The configuration is stored through Unified Settings as
`mediaManager.storageEncrypted`, using AES-256-GCM. A generated 32-byte key lives
at `data/mediaManager/storage.key`, outside the media/public directories and
build context. Back up this key with the database; replicas sharing the database
must share the key. Keep the existing `data` volume persistent during upgrades.
On Windows, restrict that directory's ACL to the service account; POSIX key files
are created with mode 0600. Missing or corrupt keys/configuration fail closed.
Blank credential controls retain saved values only for that connection/provider.
New connections require their own credentials. Selecting Local server preserves
other saved connections. The built-in local connection is always available.
SDK error details are replaced with searchable `MEDIA_STORAGE_*` codes so signed
requests and credentials do not reach responses. If metadata creation fails,
the newly uploaded object is deleted; `MEDIA_STORAGE_METADATA_FAILED_CLEANUP_REQUIRED`
means that compensation also failed and the provider needs manual inspection.

The existing `cms.media.*` agent surface still owns Explorer operations, including
`media.openStorage` with stable connection ids and snapshot storage/mutation state. Storage
configuration and streaming publication currently use the authenticated HTTP
boundary above; an AgentManager command adapter for those actions remains to be
added. Never put credential values in agent snapshots.

YiTaiCOS download links and the app updater must subsequently consume the stored
`url`, version and checksum. This CMS change does not change YiTaiCOS itself.

SDK references: [Alibaba upload](https://www.alibabacloud.com/help/en/oss/simple-upload),
[AWS S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html).

## Explorer workspace

The existing `ui/shared/media/mediaExplorerSurface.ts` serves the Media workspace
and the editor picker. A click selects; double-click / Enter opens a folder.
Back/Forward follow folder history within the selected storage; switching storage
resets that history and selection. Up navigates to the parent. The sidebar
loads children on demand, and search is explicitly scoped to the current folder.
Name/type/date/size sorting keeps folders first. Selection is cleared when its
file disappears from search results so toolbar actions cannot affect hidden files.

Manage mode defaults to a file list with one contextual toolbar. Picker mode
uses the same navigation and offers an explicit **Use selected file** action;
unsupported file types remain visible but cannot be selected for insertion.
Grid and details previews use the existing `/media/` URL for local raster images
under `public/`, or the connection's direct delivery URL for remote images.
Browsing never creates share links or moves files.
Private files keep their icon until explicitly shared by the existing action.

`listLocalFolder` retains its `folders` / `files` name arrays and adds optional
`details: [{ name, size, modifiedAt }]`. Folder sizes are null; file sizes are
bytes; timestamps are ISO strings. Metadata collection uses lstat, skips symlinks
and retains the existing permissions and library containment checks. Older
callers can ignore details and newer clients tolerate responses without them.
Create-folder, rename and delete events return `{ ok: true }` after the actual
filesystem operation, satisfying the admin facade's JSON result contract.

The Explorer has no independent persistence or file API. Multi-select, copy/move,
attachment metadata editing and usage discovery are not implied by this file
browser; they need corresponding owning-module workflows before UI is exposed.
The `cms.media.*` agent surface exposes folder navigation, search, selection,
refresh and the surface's enabled create-folder/rename/delete operations through
the existing handlers. Picker acceptance retains its type filter. Revision,
busy and confirmation checks follow [CMS agent workflows](../agent-cms-workflows.md).
File upload has no command adapter here; it remains owned by Media Manager.

Local `openMediaExplorer` handlers run outside the shared HTTP command queue.
The dialog loads its files through that same client while awaiting a selection;
queuing the dialog itself would block those requests indefinitely. Backend writes
remain serialized, and the public-read concurrency limit is unchanged.
