# UI Architecture

The UI is split into zones so the browser code can evolve independently from
the server runtime:

- `shell` owns the admin shell: navigation, login, settings, notifications.
- `designer` owns the visual builder: canvas, selection, history, toolbars.
- `runtime` owns public page rendering and should stay as small as possible.
- `widgets` owns the widget SDK and bundled widget implementations.
- `shared` owns API clients, contracts, schemas, and design-system primitives.

Existing files under `public/` and `apps/` remain in place while they are
migrated. New shared code starts here and is imported by the legacy entrypoints
through thin compatibility adapters.

Active browser bundles should start from `*/entries/` files in this tree. Those
entry files own the implementation and must not import legacy browser
implementations from `public/` or `apps/`. The dependency direction is one-way:
legacy browser paths forward into `ui/`, and Webpack emits browser bundles to
`public/build/`.
