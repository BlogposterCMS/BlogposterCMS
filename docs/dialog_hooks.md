# Dialog Hooks

The frontend wraps the browser's dialog functions early in the bootstrap via [`/assets/js/dialogOverrides.js`](../BlogposterCMS/public/assets/js/dialogOverrides.js). `alert` is replaced with an event-driven popup while `confirm` and `prompt` stay synchronous to maintain compatibility.

Load order matters:

1. `<script src="/assets/js/uiEmitterStub.js"></script>`
2. `<script src="/assets/js/dialogOverrides.js"></script>`
3. Your custom modal handlers (optional)

## Events

- `dialog:alert` – emitted on `alert(message)`
- `dialog:confirm-preview` – fired before a native `confirm(message)` dialog
- `dialog:prompt-preview` – fired before a native `prompt(message, defaultValue)` dialog

Handlers may display a custom UI but cannot change the native result. If no `uiEmitter` is available the original browser dialogs are used.

## bpDialog API

For new code, prefer the async helpers exposed in [`/assets/js/bpDialog.js`](../BlogposterCMS/public/assets/js/bpDialog.js):

```js
import { bpDialog } from '/assets/js/bpDialog.js';

await bpDialog.alert('Saved!');
if (await bpDialog.confirm('Delete item?')) {
  const name = await bpDialog.prompt('Name?');
}
```

These functions emit `dialog:*` events and fall back to native dialogs when no handler is present.
