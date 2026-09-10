# Designer container events and widget UI

Widgets own presentation. Modules own business rules, permissions and durable
workflows. A Designer interaction connects an event, local state, a condition
and an existing named data operation. It does not execute arbitrary expressions
or create a second workflow service.

## Configure a container

Select a Section or Container and open **Behavior → Events & data**. Enable
**Interactive container**, then choose:

- **Show as:** a normal container, anchored popover, modal dialog or side drawer.
- **When this element / Receives:** an existing element ID and click, input or focus.
- **Data source:** none, example articles, or published public articles.
- **Search text from:** an existing input/widget, including UI-kit ShadowRoots.
- **Display field / On result click:** article title/excerpt/path and optional link.
- **Visible when:** opened, nonempty search text, loading, ready, nonempty results,
  or request failure.

Style and arrange the original contents in the canvas. Live preview and the public
renderer execute the interaction. Overlays move the same container and restore
it on close, preserving its controls. The shared popover owns positioning and
Escape/outside-click handling. Its public portal retains the design's style
scope; browsers supporting the top layer can also escape clipping ancestors.
Public color/font overrides never change admin theme values. A data-backed flow
container defaults to Auto height; an explicitly fixed height remains fixed.

Start with an Input from the existing UI kit and a second Container. Connect the
Container to Input → Text input, choose Example articles, and choose Popover.
Then switch the source to Published articles to exercise the existing public
search API. Examples are explicitly marked and never request a module/provider.
Search responses are projected to `items` with `id`, `title`, `excerpt`, `path`.
Loading, empty and failure output are distinct; old responses cannot replace a
newer search. Chinese composition is committed before a search is dispatched.

Rules live in `layoutTree.settings.interaction`, so Designer save/load and public
projection use the same authoritative document:

```json
{
  "version": 1,
  "presentation": "popover",
  "triggerId": "search-input",
  "triggerEvent": "input",
  "source": "publishedArticles",
  "queryId": "search-input",
  "labelField": "title",
  "linkField": "path",
  "when": { "ref": "state.query", "operator": "notEmpty" }
}
```

Agents use the existing `container.settings.set` command and normal revision
guards. `state.containerInteractions` is a shallow readable projection (condition
fields are flattened) that survives AgentManager's snapshot depth limit.

## Isolated widget developers

Keep `uiContractVersion: 2` and a bundled classic `render(ui, context)` entry.
Use `ui.render(tree)` and `ui.on(action, handler)`. The renderer supports ordinary
semantic markup and form controls plus `composer`, `richtext`, `popover`,
`tooltip`, `dialog`, `drawer`, `toast`, `skeleton` and `kit`. Use an existing kit
definition through `props.component`; form events return bounded values through
the same action channel. No DOM object enters the worker.

Give changing controls stable `key` values. A `composer` is plaintext editable
content, retaining its node and composition/undo state across updates. Its
`input` and `submit` events distinguish IME composition from Enter submission.
`richtext` accepts article HTML in `props.html`; the host sanitizes it and removes
document styles, embedded forms and executable content. It is not a raw-HTML app
escape hatch. Approved links and same-origin media have separate validation.

`popover`/`tooltip` reference another node's key with `anchor`, use boolean `open`,
and can declare a `close` action. Dialog/drawer use the browser's modal behavior;
include a visible close button in the view. Public styles are validated local
properties. No URL CSS, event attributes, global stylesheet or arbitrary selector
is accepted. Existing worker, message, service, timeout and revocation limits apply.

For declarative state, the reusable `createUiBindings` helper resolves `bindings`,
`when` and repeated children against `state`, `data`, `event` and `item`.
Conditions support truthy, empty, notEmpty, equals and notEquals. Actions support
set, toggle and request against named sources. Requests carry only the declared
input bindings; prototype paths, executable expressions and excessive expansion
fail with `WIDGET_*` codes. Bundle the helper into a worker when needed; existing
native UI-kit instances can mount a validated document in `metadata.interaction`.

`await context.services.subscribe(name, event, receive, onError)` connects only an
already approved stream and returns a close handle. Events may precede the service
acknowledgment; handlers are registered first. Streams close with the widget or
existing service expiry/revocation. This is transport support, not proof of an AI
model or token stream behind a particular integration.

## Extension boundary

The visible source picker currently exposes the existing public article adapter
and its explicit examples. New business sources belong behind their owning module
and the reviewed named-service policy. UI conditions never grant access to an
account, tenant or admin operation. Durable retries, approvals, audit and scheduled
work remain module-owned. The generic contract is a foundation for those workflows,
not a complete visual backend workflow engine.

## Responsive layout and public metadata

Existing row containers wrap their children. Set **Minimum width** on a child
and **Height → Auto** on its row to avoid compressing content below its usable
width. The setting round-trips through Studio, AgentManager and public rendering.
Published widget metadata retains translated nested menus and UI conditions up to
32 levels, 16,384 values and 256 KiB of string/key characters. Oversized metadata
fails with `PUBLIC_WIDGET_METADATA_LIMIT`; conditions are never silently trimmed.

## Asynchronous control and navigation details

Input actions carry `inputRevision`. Return that revision in a control's
`props.inputRevision` so a delayed worker render cannot overwrite a newer edit.
Stable keys preserve native selection and undo; IME confirmation does not submit.
`props.controlsKey` and `activeDescendantKey` resolve only within the same widget.
A positive, increasing `props.focusRequest` focuses a control once. A fixed dock
may report its measured height through a local `props.heightVariable` CSS variable.

The host supplies bounded locale, URL-language, pathname, mode, language-list and
color-scheme context. `ui.navigate(path)` accepts only a same-origin path following
a trusted UI gesture within five seconds; it is unavailable in Designer preview.
It grants no API access. Rich-text fragment links are removed because imported
presentation IDs are stripped, as are article page chrome and side navigation.

Settings Manager stores widget policies as JSON text. ZIP installation preserves
an existing registered identity when repairing missing package files, provided
the exact package path, replacement consent and update permission all match.
Native/release-owned collisions remain denied. See
[local acceptance and open release gates](testing/designer-interactions.md).
