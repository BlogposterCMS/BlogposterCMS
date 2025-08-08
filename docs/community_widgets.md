# Community Widgets

This document outlines a safe approach for loading widgets created by third‑party developers.

## Folder structure

Community widgets should live under `public/plainspace/community/{folderName}`.
Each widget has its own subfolder containing:

- `widget.js` – the client-side widget code.
- `widgetInfo.json` – metadata used for registration. It may declare an `apiEvents`
  array listing the meltdown events the widget plans to call so the client can
  pre-register those endpoints before `widget.js` executes.

System and Blogposter widgets remain in `public//plainspace/widgets/admin` or `public//plainspace/widgets/public`.
Keeping community code separate avoids accidental mixing of trusted and unknown code.

## Registration process

The Widget Manager automatically scans the community folder during startup:

1. Read `widgetInfo.json` for each widget and verify required fields (`widgetId`, `widgetType`, `label`, `category`).
2. Pre-register any `apiEvents` declared in the metadata. Event names are sanitized
   and sent with a JWT so the server can prepare the endpoints ahead of time.
3. Run a short health check by executing `widget.js` in a Node `vm` context to ensure it does not access restricted globals.
4. Use the existing `createWidget` event from `widgetManager` to insert or update the widget entry in the database. The `content` field should store the public path to `widget.js`.
5. Mark widgets in the database so they can be disabled or removed later from the admin interface.

This process mirrors the security model of the community `moduleLoader` and keeps untrusted code isolated.

## Deleting widgets

Because each community widget is registered in the database with its own `widgetId`, administrators can remove widgets by deleting the folder and issuing a `deleteWidget` event. Keeping the metadata in `widgetInfo.json` makes cleanup straightforward.

## Security considerations

- Run the health check in a minimal sandbox and restrict available modules using the `dependencyLoader` rules.
- Serve community widget scripts with a strict `Content-Security-Policy` so they cannot fetch remote code.
- Never give community widgets admin permissions. They should only manipulate the page DOM.
- Declaring `apiEvents` limits widgets to approved meltdown events; unlisted
  events are rejected, reducing the risk of privilege escalation.

Following these guidelines keeps potentially malicious widgets isolated while still allowing user customization.
