# Comments Manager

Core comment and moderation domain for content entries. It is backend-only and
does not add UI routes by itself.

## Startup
- Core module loaded after `contentEngine`.
- Ensures the comments database/schema and comments table/collection exist.

## Purpose
- Stores comments against either a Content Engine `entryId` or a legacy source
  pair such as `sourceModule: "pagesManager"` plus `sourceId`.
- Supports nested comments through `parentId`.
- Keeps moderation status separate from deletion using `pending`, `approved`,
  `spam` and `trash`.
- Owns comment input normalization before any database event is emitted.

## Listened Events
- `createComment`
- `getComment`
- `listCommentsForEntry`
- `updateComment`
- `updateCommentStatus`
- `deleteComment`

## Permissions
- `comments.create` allows authenticated comment creation.
- `comments.edit` allows changing comment content or author metadata.
- `comments.moderate` allows status changes and listing non-approved comments.
- `comments.delete` soft-deletes comments by moving them to `trash`.

Core/internal calls without a decoded user JWT may seed or migrate comments
without user permission checks. User-facing requests with `decodedJWT` are
checked through the normal permission utility.

## Public Runtime
- `runtimeManager` exposes `GET /api/public/comments?entryId=...` or
  `GET /api/public/comments?sourceModule=...&sourceId=...` for approved public
  comments.
- `POST /api/public/comments` creates a new comment as `pending`, even if the
  caller submits another status.
- Runtime checks the Content Engine target when possible and returns 404 for
  draft/private targets before listing or creating comments.
- Public comment responses omit email addresses, IP hashes and user agents.

## Boundaries
- The module only talks to persistence through the DatabaseManager events used by
  `commentsService`; it does not open database connections or touch storage
  directly.
- Meltdown payloads must identify `moduleName: "commentsManager"` and
  `moduleType: "core"`. Community modules, widgets and apps cannot spoof comment
  writes by calling these internals as themselves.
- Author URLs are limited to root-relative paths or absolute `http`/`https`
  URLs. Protocol-relative URLs, backslashes, whitespace/control characters and
  script/data schemes are stripped before persistence.
- `meta` is always sanitized as a plain JSON object. Unsafe object keys such as
  `__proto__`, `constructor` and `prototype` are dropped, unsupported values turn
  into `null`, and nested objects/arrays are capped before they reach storage.
- Legacy rows returned from storage pass through the same URL and metadata
  cleanup before callers receive them.
