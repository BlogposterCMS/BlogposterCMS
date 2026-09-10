# Native CMS imports

The import controls are thin clients of existing authenticated Settings and
Designer actions. They do not add an API, database authority or public grant.

## Focused checks

- Service JSON rejects installer receipts, privileged/remote destinations,
  unsupported cookies, prototype keys and malformed descriptors.
- Configuration merge preserves other widgets and current package grants.
- Designer copy imports retain layout/metadata and localized text, discard source
  identity/publication flags, and reject executable code/trust flags and duplicate
  widget IDs. Oversized/malformed documents cannot reach the save call.
- Both helpers preserve server permission failures without a fallback path.
- Run the two focused import test files, design library state tests, extension
  package tests and Runtime Manager facade-domain tests.

## Browser acceptance

Use a safe local CMS with representative installed widgets. In Settings >
Widgets, choose a service configuration, review targets and save. Reload and
verify the policy through the public projection and existing access review.
In the Design library, choose native design JSON, review the title/widget types,
create a draft copy, and open/reload it in Studio. Verify that the source design
is unchanged and no page was automatically published. Cancelled and invalid
imports must leave the existing records and grants untouched.

Production requires an updated signed engine with these controls. An older
engine accepting the widget ZIP does not prove that operator configuration or
content import is complete.

## Local result, 2026-09-10

The six focused suites passed (52 tests), and TypeScript/browser bundling passed
with the existing article-editor size warnings. In the real local CMS, a service
file was reviewed/saved and its persisted named operations verified through the
public policy endpoint. A four-widget native design imported as a new draft,
opened and reloaded in Studio; its existing source remained published and intact.

That smoke exposed the same missing-nonce preview failure on both the source and
copy. Static AppLoader HTML carries no server nonce. The bridge now creates its
own random nonce when absent, retaining inherited CSP and its opaque sandbox.
After reload both the account controls and Help composer render inside Studio;
preview services remain denied. The ordinary public Help route retains its
working search suggestions and article selection.
