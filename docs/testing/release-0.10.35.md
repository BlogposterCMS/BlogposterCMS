# Public article layout correction, 0.10.35

Classification: small maintenance; Zero-Node neutral. No new runtime or authority.

- [x] Reproduce the public article font changing from sans-serif to Times New
  Roman after the runtime adopts the initial HTML into a Designer content area.
- [x] Keep typography attached to the article and outer padding limited to the
  initial body placement. Preserve author CSS precedence and sanitization.
- [x] Preserve saved article/sidebar flex ratios in the flow-content stylesheet.
- [x] Check the native local Pages/Designer path with a saved parent layout,
  inherited article, English/Chinese content and three public Media images.
- [x] Check desktop columns, reload, delayed layout adoption, narrow wrapping and
  image loading without horizontal overflow through the visible browser.
- [x] Select a managed menu in the native Content inspector, save it and verify
  the stored base/EN/ZH overrides no longer contain stale inline links.
- [x] Pass 29 focused public presentation, inherited pipeline, navigation and
  Designer AgentManager tests. Production build passes with the existing
  article-editor bundle-size warnings.
- [ ] Install the signed release and repeat the bounded public browser test.

The public article issue is a selector/cascade defect, not a reason to weaken
widget isolation, CSP, permissions or the normal Pages/Designer boundaries.
The server-first article remains readable before scripts load. This correction
does not implement server rendering of the complete Designer layout.
