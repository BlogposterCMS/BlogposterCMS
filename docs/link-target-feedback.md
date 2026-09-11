# Link target feedback

The native Article editor, HTML source editor and Design Studio use one transient
checker through the existing admin `pages.getBySlug` facade and its `pages.read`
permission. Inserting or editing a link checks after 350 ms, before any save.
Draft, deleted, missing, scheduled and unavailable pages receive a short popover
and a persistent outline. Clicking the highlighted target reopens the warning.
Edits and saves remain available; the checker never changes or removes links.

AgentManager snapshots contain the same `linkFeedback` result: `pending`,
`checked`, `unchecked`, `truncated`, `limit`, and `items` with stable source ids,
safe target paths, error codes, messages and warning flags. `LINK_TARGET_DRAFT`,
`LINK_TARGET_DELETED`, `LINK_TARGET_MISSING`, `LINK_TARGET_SCHEDULED` and
`LINK_TARGET_UNAVAILABLE` describe destination state. A denied read or transport
failure becomes `LINK_TARGET_CHECK_UNAVAILABLE`, never a false missing result.

Checks cover relative or same-origin CMS page URLs. External URLs, assets,
reserved routes and isolated widget internals are not a reachability crawler.
Query values and fragments are excluded from feedback; no arbitrary network
fetch occurs. Each editor checks at most 40 links, four at once, with a ten-second
cache capped at 100 paths. Studio uses its existing parent credential bridge.

Highlights, position proxies and popovers live outside authored HTML. They never
enter article serialization, design widgets, attached files or media records.
The HTML source editor outlines the source field; native rich text and widgets
outline the actual link. Corrections discard stale asynchronous results.

This is authoring feedback. It does not change public HTTP status handling or
introduce a configurable service-page assignment.
