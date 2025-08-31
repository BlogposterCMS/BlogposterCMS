# Media Manager

Handles file and folder operations under the media library. It verifies permissions before allowing modifications and can mark files as public.

## Startup
- Core module requiring a JWT token.
- Ensures media folders and tables exist.

## Purpose
- List and create folders.
- Upload files through stream-based middleware.
- Move files or entire folders into the public directory via `makeFilePublic` (requires `builder.publish` permission). The event accepts an explicit `userId` and falls back to the JWT payload's `user.id`, `userId`, `id`, or `sub` fields.
- For security, published builder assets must live under a `builder/` path; other locations are rejected.

## Listened Events
- `listLocalFolder`
- `createLocalFolder`
- `renameLocalItem`
- `deleteLocalItem`
- `uploadFileToFolder`
- `makeFilePublic`

File operations check user permissions using the `userManagement` roles.
