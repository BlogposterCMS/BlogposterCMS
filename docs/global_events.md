# Global DOM Events

The frontend exposes a small helper, `bindGlobalListeners`, that attaches a unified set of event listeners to any element. It forwards both element and window events through a callback so modules can react without wiring up dozens of handlers.

```js
import { bindGlobalListeners } from '/plainspace/grid-core/globalEvents.js';

bindGlobalListeners(rootElement, (eventName, event) => {
  // handle event
});
```

### Element Events

- `mousedown`
- `mousemove` *(throttled with `requestAnimationFrame`)*
- `mouseup`
- `mouseleave`
- `click`
- `dblclick`
- `contextmenu`
- `touchstart`
- `touchmove` *(throttled with `requestAnimationFrame`)*
- `touchend`
- `dragstart`
- `dragend`
- `dragover` *(throttled with `requestAnimationFrame`)*
- `drop`
- `blur`
- `focus`

### Window Events

- `keydown`
- `keyup`
- `resize`
- `scroll` *(throttled with `requestAnimationFrame`)*
- `wheel` *(throttled with `requestAnimationFrame`)*

Calling `bindGlobalListeners` automatically registers all of the above. Events that can fire rapidly are wrapped in `requestAnimationFrame` so handlers run at most once per frame. The helper is used by the CanvasGrid and other dashboard components.

### Are they implemented?

Yes. The source lives in [`public/plainspace/grid-core/globalEvents.js`](../BlogposterCMS/public/plainspace/grid-core/globalEvents.js). The tests exercise public event handling in `tests/publicEvents.test.js`, ensuring the bindings work.

### Example Usage

```js
const grid = document.querySelector('.canvas-grid');

bindGlobalListeners(grid, (evt, e) => {
  if (evt === 'click') {
    console.log('Clicked', e.target);
  }
});
```

This attaches all listeners to `grid` and logs every click. Feel free to filter for the events you care about.

## Dashboard Load Events

The page renderer emits custom DOM events after injecting major layout sections. These allow modules to initialize when parts of the dashboard become available.

- `top-header-loaded`
- `main-header-loaded`
- `content-header-loaded`
- `sidebar-loaded` – fired after the sidebar partial is inserted or cleared.
