# Widget Design Contract

Blogposter widgets keep behavior and presentation separate from the global
shell. Core widgets and generated widgets must follow the v1 design contract;
community widgets receive advisory design warnings while security boundaries
remain hard failures.

## Policy Levels

### Strict

Strict widgets include:

- bundled widgets served from `/ui/widgets/plainspace/`;
- admin widgets;
- widgets in the `core` category;
- generated widgets that set `enforceDesignContract`, `designSource`, or
  `metadata.designContract.mode: "strict"`.

Strict widgets must use the trusted UI widget root or inline content that
declares `metadata.designContract.version = 1`. Styled inline widgets must use
Blogposter CSS tokens with `var(--...)`, keep styling scoped to the widget
shell, and avoid mutating `document.body` or `document.documentElement` styles.
Violations block registration with `[WM:WIDGET_DESIGN_CONTRACT]` and a
searchable `BP_WIDGET_CONTRACT_*` code.

### Advisory

Community widgets under `/widgets/` are advisory for design consistency. The
scanner warns about raw color literals, global document styling, and similar
contract drift, but it does not block registration for design-only issues.
Security checks still fail closed for token access, internal APIs, remote
imports/fetches, storage, cookies, eval-like behavior, and Node/runtime access.

## Metadata

PlainSpace registry metadata exposes the bundled widget contract as:

```json
{
  "designContract": {
    "version": 1,
    "mode": "strict",
    "tokens": "required",
    "designerRules": "required"
  }
}
```

Runtime, Designer, Agent surfaces, and future lint tooling should read this as
the source of truth instead of guessing whether a widget is first-party or
generated.

## Authoring Rules

- Prefer existing shared widget shells, classes, controls, and design tokens.
- Use CSS variables such as `var(--...)` for color, spacing, radius, typography,
  shadows, and motion.
- Keep CSS scoped to the widget root; do not style `body`, `html`, `:root`, or
  unrelated shell elements.
- Provide clear empty, loading, and error states for data-driven widgets.
- Do not introduce backend capability through widgets. Modules own data,
  permissions, and event contracts.
