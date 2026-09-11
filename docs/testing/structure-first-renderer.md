# Structure-first public renderer

Classification: small maintenance; Zero-Node neutral. Blogposter remains the
independent public content authority in its established runtime.

- [x] Shared container projection: legacy defaults, saved ratios, style-source
  chains, media references and nonmutating/idempotent reads.
- [x] First response contains the real main/page/footer hierarchy, with the
  sanitized article in the correct inner content host.
- [x] Public-loader integration retains container/article identity and replaces
  only widget shells; no duplicate article, attachment rewrite or nested-design
  refetch during adoption.
- [x] Published-facade failures, repeated/cyclic references, bounded resolution
  and stale route handoffs preserve safe fallback behavior.
- [x] Local native public article: direct request and immediate reload display
  the article in its final column before header/sidebar widgets arrive. A later
  screenshot retains the same article position, typography and layout.
- [x] Final browser bundle build and expanded focused regression gate (46 suites,
  247 tests; lazy article bundle size advisory remains).
- [x] Local Studio save/reload and built-in 390 px viewport preview; versioned
  public reads confirm independent Chinese/English mobile geometry.
- [ ] Production update and live verification (deferred by the site owner).

Compatibility is automatic read-time normalization of the existing v1 document,
not a bulk rewrite of saved designs. No schema field, content row or attachment
record is changed. Existing authored responsive geometry remains client-owned;
dynamic widget content is not executed on the server. This change does not
promise zero layout shift for widgets without authored dimensions.

Immediate authoring warnings are verified separately in the Article, HTML source
editor and Studio. Public drafts remain unavailable. A customizable system-page
assignment is a separate feature and is not introduced by this renderer change.
