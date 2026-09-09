# Shared widget visuals

Browser-only APIs live under `ui/shared`; they do not query data, grant permissions
or require a Node service. Widgets use their existing module facade for data.

## Shared color picker

`createColorPicker` retains literal and saved/linked color contracts. Its swatch
grid fits the host width, its custom HSV/opacity editor stays in normal flow, and
empty saved-color libraries are hidden when the caller provides no library actions.
Color names and hex values are applied with Enter; invalid values report
`COLOR_PICKER_VALUE_INVALID` without replacing the current selection. Hue and opacity
are labelled sliders; the saturation/brightness area also accepts arrow keys.

Account accent uses the existing `openPopover` portal with outside-click and Escape
dismissal. Selection updates only the account draft; Save user persists it and
Discard restores it. The picker does not change theme ownership or create a new
color store. Keep this control shared with Setup and the UI Kit.

## Responsive widget hosts

Every editable admin dashboard uses a `dashboard-workspace` inline-size
container. At available widths up to 1080px, all widget slots and drag
placeholders span the full row. Saved desktop slots/columns remain unchanged;
they return when space is available. Fixed page tools retain their own layout.

Each dashboard card exposes `dashboard-widget` as an inline-size container.
Core and third-party widgets can adapt their contents through the same API,
including inside shadow roots:

```css
@container dashboard-widget (max-width: 600px) {
  .my-widget { padding: 12px; }
  .my-widget-actions { flex-wrap: wrap; }
}
```

The host controls outer placement. Widget authors still own internal content
reflow; hardcoded widths inside arbitrary third-party content cannot be repaired
automatically. Public authored layouts/Designer canvas are not rewritten by
the admin dashboard rule.

## Charts

```js
import { mountChart } from '/ui/shared/charts/chart.js';
const chart = await mountChart(container, {
  labels: ['Mon', 'Tue'],
  series: [{ name: 'Events', values: [12, 18] }],
  type: 'line', zoom: true
});
container.addEventListener('chart:select', event => console.log(event.detail));
// chart.update(nextData); chart.dispose();
```

Supports line/bar charts, canvas tooltips, clickable points, toggleable legends,
optional pan/zoom and responsive resize. At most eight series and 2,000 labels,
finite numeric values and 200-character labels. No raw ECharts options, remote
image symbols, HTML formatters or executable callbacks from configuration.
`chart:select` exposes `{series,index,value}`. Explicit disposal is preferred;
detached widgets also release their chart automatically. Shadow-root hosts work.
Failures use `CHART_*` codes. Consumers retain responsibility for permission,
loading/error/empty states and an accessible detailed data table where needed.

## Saved previews

```js
import { capturePreview } from '/ui/shared/preview/domCapture.js';
const png = await capturePreview(documentRoot, { firstSection: true });
```

Capture selects the first canonical `.layout-section[data-section-id]` or uses
the supplied root. It uses untransformed layout width and crops the top to a
maximum 16:9 frame, output at most 960px wide. It does not stretch a tall page
into a thumbnail. Designer pan/zoom is excluded from the captured element.
The existing media facade owns storage; the caller chooses when to save.
Home reads saved thumbnails. Existing thumbnails change on the next design save.
Unavailable/CORS-tainted content can return an empty image; do not label a
structural fallback as a real screenshot. This is DOM rasterization, not a
headless browser or an API for fetching arbitrary websites.

## Vendor review, 2026-09-07

ECharts common distribution 6.1.0, pinned Apache commit
`c5a48f5f97d23e5379720870b8444cd05b50ffb4`, includes its LICENSE and NOTICE.
No package installation or lifecycle scripts were run. GitHub and npm
distribution bytes matched. npm archive SHA256:
`681aff88cc1038c3fa941a3a53d1b177a52250b05335efc607d6105ae13be481`.
OSV query for npm/echarts 6.1.0 returned no advisories on this date.
6.0.0 was rejected due to CVE-2026-45249 (Lines HTML tooltip XSS).

Targeted inspection of the readable common build found no `eval`, `new Function`,
XHR, WebSocket, beacon, cookie or localStorage access. The apparent `fetch`
call is an internal data-processing function. Image loading exists in the engine;
the public wrapper does not expose image options. This is a targeted review,
not an exhaustive malware audit. The sources are not independent trust roots.

`npm run check:vendors` verifies manifest hashes and is required by `npm run build`.
Browser loading also uses a pinned SRI digest and a local URL, no CDN fallback.
Changing a dependency requires source/advisory review, tests and an explicit
manifest/SRI change; the verifier never updates hashes automatically. Hashes
detect drift from reviewed bytes, not malicious code already approved in them.
This new gate covers ECharts; existing legacy vendors, including html-to-image,
have not received a full repository-wide supply-chain audit in this change.

Dialog selects automatically reuse the custom select's floating Popover API path at open time, including forms moved into a dialog after enhancement. The list stays anchored on scroll/resize, Escape closes it before its dialog, and a newly mounted modal dismisses older lists. Browsers without Popover API retain the inline fallback.

Shared page-editor data lives in `ui/shared/page-editor`; extension data and access
review live in `ui/shared/module-access`. Legacy widget paths re-export these
implementations. Shell actions reuse these helpers without importing widgets.
The article loader is the fixed local `/build/articleEditor.js` lazy gateway.
