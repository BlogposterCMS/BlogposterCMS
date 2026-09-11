# Public startup performance

## Bundled core loader startup, 2026-09-11

The first response already contains the real layout containers and article slot.
Navigation widgets still need their JavaScript runtime. A structural page loaded
69 static ESM dependencies (413,595 source bytes) after discovering the widget
loader, producing several sequential network discovery steps before mounting any
widget. Inline navigation items did not require a separate navigation-tree query.

The three existing core public loaders now enter the existing Webpack build as
literal lazy imports. Structural/grid/scheduler imports remain lazy but can be
bundled as well. Their registration, public facade, HTML adoption and widget
rendering contracts are unchanged. Community loader paths and selected native
widget generation URLs remain runtime-resolved. Prototype-named sources cannot
select a core importer. This is a host browser update, not a new renderer or a
change to the published design/content model.

### Controlled browser comparison

The local-only harness held one published native documentation response in RAM,
with a text header, three navigation widgets and an HTML article slot. It served
the same local assets with no-store and a fixed 180 ms delay per static response;
read-only public facade requests used the real origin. There was no bandwidth
throttle. Three reloads used the original build, followed by comparison runs with
the isolated entry build and then three with the final all-entry build. The table
uses only the original and final all-entry runs. Default desktop viewport width
was 1686 CSS px. A 30 ms observer measured DOM availability, not FCP or LCP.

| Metric | Original, three runs | Final full build, three runs | Median |
| --- | --- | --- | --- |
| Article DOM detected, ms | 241 / 237 / 237 | 296 / 266 / 281 | 237 to 281 |
| Sidebar menu mounted, ms | 5179 / 4828 / 5260 | 3822 / 4314 / 3754 | 5179 to 3822; 26% lower |
| All widgets ready, ms | 5457 / 5047 / 5540 | 4655 / 4606 / 4210 | 5457 to 4606; 16% lower |
| JavaScript requests | 85 / 85 / 85 | 28 / 28 / 28 | 67% fewer |

The article's early availability is retained; this does not establish an earlier
first paint. Real facade latency varied between runs. The harness excluded
non-facade favicon/font-loader events in both variants; the actual color/font
package, registry and widget-default facade reads remained enabled. It held no
CMS authentication and did not mutate production data. This isolates dependency
delivery rather than measuring production TTFB, cache behavior or every shell
helper. The local harness and raw reports remain ignored, outside the release.

The optimized menu rendered with its original layout and expandable submenus.
Mobile collapse opened correctly, and final-build desktop checks found no chunk
load error or material horizontal overflow. TypeScript compilation and 118
focused tests passed. The all-entry Webpack build passed with the existing large
article/source editor warnings; all related chunks/maps must ship together.
Designer source-map review found unchanged product source, with shared modules
repartitioned into the generated async chunks.

No signed release or live installation was performed for this correction. The
menu still waits for presentation data and widget defaults; this improvement does
not make the complete navigation available in the first HTML response.

## HTML attachment delivery, 2026-09-07

HTML pages now use bootstrap version 2: only the first HTML attachment already
rendered in the initial response omits its duplicate `inline.html` and carries
`htmlFromInitialResponse: true`. The reader reconstructs the existing loader
descriptor in memory from that sanitized DOM. CSS/JS and other attachments stay
intact; canonical envelopes are never mutated. Missing DOM triggers existing CSR
discovery. Version 1 remains supported, including layout-only responses; old
clients reject version 2 and use their existing canonical CSR fallback. Deploy
the server change and rebuilt publicEntry bundle together for the improvement.

The existing static route stack now uses Express compression for successful
public CSS, JavaScript and SVG responses of at least 1 KB. Encodings are negotiated,
Vary is retained, and existing encodings/no-transform are respected. HTML with
tokens, JSON APIs, binary images, byte ranges and errors are excluded. No generated
variants, new cache or alternate media authority are introduced. See the
[middleware contract](https://expressjs.com/en/resources/middleware/compression/).

### Delivery measurement on actual local HTML

Three fresh Chromium contexts per variant, 1365 x 768 viewport, disabled cache,
150 ms requested CDP latency and 750,000 bytes/s download/upload (6 Mbit/s).
The delivery harness used the actual local landing HTML/assets, the real static
route factory, and public API forwarding to the running local CMS. For the after
variant, the existing presentation helper generated the compact bootstrap from
the same in-memory public envelope. HTML was held in memory, so these numbers
measure delivery/rendering and exclude page database lookup/SSR latency. No live
deployment or running CMS restart was performed. Both PNG hero files were identical.

| Metric | Before (three runs) | After (three runs) | Median |
| --- | --- | --- | --- |
| First contentful paint, ms | 2912 / 2872 / 2912 | 928 / 1400 / 952 | 2912 to 952, 67% lower |
| Largest contentful paint, ms | 4540 / 4500 / 4816 | 3976 / 3824 / 3832 | 4540 to 3832, 16% lower |
| Both hero files received, ms | 4719 / 4685 / 4691 | 3974 / 4010 / 3995 | 4691 to 3995, 15% lower |
| HTML response bytes | 65,331 | 31,372 | 52% smaller |
| Website CSS encoded bytes | 518,892 | 60,819 | 88% smaller |
| HTML + resource encoded bytes, median | 3,184,733 | 2,614,955 | 18% smaller |

All runs retain the same heading and one initial HTML wrapper. These results
apply to an origin previously serving uncompressed static text. An upstream
proxy may already compress assets, so the same gain cannot be assumed live.
Large authored raster images remain an independent site-owned optimization.

## Viewport-first widget hydration, 2026-09-07

The public widget loader now prepares all widget shells before hydration. Saved
canvas responses include the existing `widget-placeholder` presentation and
`aria-busy` state in their initial HTML. The structural document renderer collects
jobs across its containers and nested designs on the same public loader call.
Admin and Designer callers do not opt into this scheduling mode.

`publicWidgetScheduling` checks actual bounds before every widget: visible work
first, then widgets within 300 px, then remaining content. Offscreen work yields
to `requestIdleCallback` with a 500 ms timeout (a timer fallback when unavailable).
This is progressive loading with eventual completion, not scroll-only loading:
all widgets still finish for page scripts, browser search and later printing.
Inline-script widgets remain eager. Rendering and facade requests remain on their
existing paths; there is no new cache, transport or concurrency lane. One failure
logs `PUBLIC_WIDGET_HYDRATION_FAILED` without starving other widgets. Removed
shells are skipped. `bp:public-widgets-ready` still follows the complete queue.

HTML-only pages return before importing this scheduler. Image loading attributes
and authored page code are unchanged. Auto-height mobile layouts remain
content-driven; arbitrary widget content can still change their final height.

### Local before/after experiment

Chromium, fresh contexts, disabled browser cache, 1365 x 768 viewport, requested
150 ms CDP network latency without bandwidth throttling, three runs per case.
The local server/database were warm. The controlled fixture document and its
test module were supplied by browser interception (their TTFB is not a server
benchmark); ordinary runtime dependencies came from the local CMS. The fixture
uses the real public presentation and widget loader, eight lower widgets before
one visible widget in saved order, with 120 ms simulated async work per widget.

| Metric (ms), three runs | Before | After | Median change |
| --- | --- | --- | --- |
| Visible fixture widget ready | 2587 / 2720 / 2583 | 1120 / 1225 / 1261 | 2587 to 1225, 53% lower |
| All nine fixture widgets ready | 2588 / 2722 / 2584 | 2150 / 2296 / 2332 | 2588 to 2296, 11% lower |
| Fixture first contentful paint | 1568 / 1692 / 1556 | 56 / 64 / 60 | After value measures the placeholder, not finished content |
| Actual local HTML landing FCP | 620 / 636 / 980 | 660 / 632 / 660 | 636 to 660; no demonstrated improvement |

The fixture loads 18 resources instead of 16 because of the scheduling helpers.
All nine widgets complete. Desktop and 390 px mobile checks verify completion,
placeholder removal and no horizontal overflow. This is local evidence only;
no deployment or live-site speed improvement is claimed. The actual landing
page contains no CMS widgets and therefore does not benefit from this change.

## Measured architecture problem

Previously the public HTML shell contained no page content. `publicEntry` obtained a public
token, discovers the start page, reads its envelope and imports each attachment
loader before orchestration. Colors and font packages are also prerequisites.
The HTML loader then sanitizes/inserts content; site CSS and images are only
discovered at that point. A quick HTML response is not a quick visible page.

## Implemented layout-first response

`publicPageRoutes` now uses the existing public facade to resolve the published
page and envelope. Pages Manager's `publicPresentation.js` sanitizes initial
HTML, or reserves linked widget layout geometry. Assets appear in that initial
response. `BP_PUBLIC_BOOTSTRAP` carries pathname, normalized slug,
language, envelope, resolved layout and adoption flags. The client validates
pathname/language and hands that snapshot to the existing loaders. It adopts
HTML/grid elements without duplicate page/layout reads or DOM replacement.
Widget registries, dynamic widget data and page scripts remain client-owned.

The server and widget loader share canvas geometry/CSS through
`ui/shared/layout/publicCanvasPresentation.ts`. No alternate layout store,
renderer engine or public API is introduced. Signed Designer previews skip the
public handoff and retain the parent bridge. Invalid handoffs remove their owned
initial nodes and use existing CSR discovery. HTML responses are no-store;
publication and public-lane filtering remain in the Runtime Manager facade.

The former public widget loader eagerly imported canvas and widget-options
forwarders. These traversed the interactive grid and an admin-capable barrel,
even when the eventual widget loader returned immediately for HTML-only content.
The public loader now defers the existing concrete grid/options modules until
after that return. Required imports and the widget registry read run together.
Import failure reports `WIDGET_PUBLIC_RUNTIME_IMPORT_FAILED` before mounting.
Layout semantics, rendering, permissions and facade ownership remain unchanged.

## Bounded measurement, 2026-09-05

Headless Edge, fresh browser contexts, browser cache disabled, desktop viewport.
For the controlled local comparison only, CDP applied 250 ms network latency
without a bandwidth limit. Dev-reload JavaScript was replaced with an empty
response in the measurement browser to prevent collaborator edits from restarting
the page. The localhost server and its database were already running.

| Local HTML landing sample | Before deferred canvas imports | After |
| --- | --- | --- |
| First contentful paint, three runs (ms) | 2732 / 2740 / 2724 | 2712 / 2284 / 2300 |
| Median first contentful paint (ms) | 2732 | 2300 |
| JavaScript resource entries | 30 | 15 |

This is a 432 ms (16%) median improvement in a small synthetic sample, not a
production SLA or proof that startup is fully fixed. Without artificial latency,
the patched local page's three cold-browser FCP observations were 716 / 296 /
224 ms. Localhost timing cannot establish production network performance.

With layout-first responses added under the same 250 ms latency conditions,
FCP was **764 / 696 / 712 ms**, median **712 ms**, versus 2300 ms immediately
before this change (69% lower). Browser API reads fell from 9 to 7: no repeated
start-page or envelope request. Layout/style/image discovery no longer waits
for those client calls or the loader graph. Desktop rendering with JavaScript
disabled and 390 px mobile hydration both retain one heading, one initial HTML
wrapper and no horizontal overflow or page errors. This is local acceptance;
no production deployment or equivalent live improvement is claimed.

A deployed 0.9.4 instance still exhibited serialized public reads, failed core
loader path probes and a fabricated layout lookup. The local 0.9.2 working tree
already contained separate uncommitted fixes for those issues. Version numbers
alone therefore do not establish which startup fixes an instance contains.
Confirm readiness version **and** actual asset/request behavior before comparing.
Site-specific observations and content belong outside this generic repository.

## Remaining work and boundaries

1. Release and verify the existing startup corrections together: bounded public
   read concurrency, parallel presentation/page discovery, direct core loader
   paths, no fabricated HTML layout reference, and deferred canvas imports.
   Keep mutation ordering and all public facade permission checks intact.
2. The three release-owned core public loaders now use explicit lazy bundle
   imports from `publicLoaderImporter`; their existing `registerLoaders` contract
   remains unchanged. Widget structure, grid and scheduling dependencies are
   lazy bundle chunks, and the HTML-only return still precedes canvas imports.
   Community modules retain allowlisted runtime path discovery, and signed live
   preview keeps its separate runtime import. Release-integrity and live behavior
   still require verification with the rebuilt public bundle. Core public-loader
   routes are currently host-pinned; native bundled widget entries stay on their
   runtime URLs so selected widget generations continue to apply.
3. The initial published response is now implemented without a new cache. Any
   future HTML caching must account for publication, revisions, languages and
   per-response nonce/token data. Do not introduce a parallel content server or
   bypass the public facade to optimize that path.
4. Optimize site-owned images and font/CSS delivery in the site repository.
   Payload reduction improves image completion but cannot repair an empty shell
   or serialized content discovery. Revalidate unversioned imports; long-lived
   immutable caching requires versioning the entire import graph first.

Measure navigation response time, first contentful paint, heading visibility,
LCP, API ordering, import depth and image discovery separately. Compare the same
content and network conditions and retain request waterfalls. DOM insertion is
not proof that stylesheet application or images have completed. A database or
backend rewrite is not justified by this browser evidence alone.

## Regression coverage

`publicWidgetStartupBoundary.test.js` loads the actual loader with unavailable
canvas dependencies: complete HTML must still finish, while required canvas
imports must fail with the searchable error before mounting. Existing
`widgetManagerPublicLoader.test.ts` covers actual widget layout, sanitization,
options, metadata and readiness. `publicRuntimeStartup.test.ts` and loader/path
tests protect the independently existing startup corrections.

`publicPresentation.test.js`, `publicPageNestedRoutes.test.js` and
`publicBootstrap.test.ts` cover server markup, script escaping, CSS filtering,
facade rejection and pathname/language ownership. Loader tests verify initial
HTML/grid adoption and no duplicate layout/style requests. Preview-security and
Runtime Manager tests retain the established publication and origin boundaries.
