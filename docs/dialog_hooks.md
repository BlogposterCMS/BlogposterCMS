# Dialog Hooks

The frontend replaces the browser's blocking `alert`, `confirm`, and `prompt`
functions with an event-driven system. Early in the bootstrap phase the script
[`/assets/js/dialogOverrides.js`](../BlogposterCMS/public/assets/js/dialogOverrides.js)
installs global overrides that emit UI events instead of showing native dialogs.

## Events

- `ui:showPopup` – emitted on `alert(message)`
- `ui:showConfirm` – emitted on `confirm(message)`
- `ui:showPrompt` – emitted on `prompt(message, defaultValue)`

Each event payload contains a `title` and `content`. `ui:showConfirm` receives
`onYes`/`onNo` callbacks, while `ui:showPrompt` includes `defaultValue` and
`onSubmit`/`onCancel` handlers.

The overrides return Promises for `confirm` and `prompt` so callers should use
`await`:

```js
const ok = await confirm('Delete item?');
if (ok) {
  // proceed with deletion
}
```

If no compatible emitter is present, the original browser dialogs are used as a
secure fallback.
