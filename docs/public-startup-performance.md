# Public startup performance

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
response. `BP_PUBLIC_BOOTSTRAP` version 1 carries pathname, normalized slug,
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
2. Reduce the native ESM dependency depth. Small forwarding files are cheap in
   source code but each unbundled import level adds another network round trip.
   Evaluate bundling each public loader's implementation while retaining its
   existing module-owned URL and `registerLoaders` contract. This requires a
   reviewed build, static mount and release-integrity plan; it is not implemented.
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
