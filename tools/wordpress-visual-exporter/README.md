# Blogposter Visual Exporter

This folder contains a WordPress plugin prototype that exports a Blogposter
WordPress site package. The plugin lets WordPress render the public site first,
then writes a neutral package that BlogposterCMS can inspect and map.

## Build Install ZIP

From the BlogposterCMS repository root:

```bash
npm run package:wordpress-exporter
```

The command writes `tools/wordpress-visual-exporter/dist/blogposter-visual-exporter.zip`.
Install that ZIP through the WordPress plugin uploader. The ZIP contains a
normal `blogposter-visual-exporter/` plugin folder with the exporter PHP file
and this README.

## Package Shape

The generated ZIP contains:

- `manifest.json` with `format: "blogposter-wordpress-site-package"`.
- `content/export.wxr` when WordPress' native WXR exporter is available.
- `pages/<slug>/rendered.html` with the captured frontend output.
- `pages/<slug>/normalized.html` with scripts and volatile runtime attributes
  removed for Designer mapping.
- `pages/<slug>/source.json` with WordPress IDs, parent IDs, template, builder,
  language/translation hints, terms, selected SEO data, featured media and
  sanitized post meta.
- `assets/` with local CSS, JavaScript, images and fonts referenced by captured
  pages.
- `menus`, `seo` and supported redirect metadata in `manifest.json` for
  Blogposter manager imports.
- `reports/mapping-hints.json`, `reports/blocked-behavior.json` and
  `reports/source-summary.json` for import review.

`manifest.assets[]` lists every captured local package file. `manifest.media[]`
is a narrower image attachment view for CMS media records, so fonts and scripts
can still be published and rewritten without pretending they are content
attachments.

The exporter rewrites only asset-bearing HTML attributes. Normal page links stay
as links, while stylesheets, scripts, images, `srcset`, media posters and
inline `style="url(...)"` assets are copied into the package.

If WordPress cannot fetch its own frontend while the export request is running,
the exporter writes a rendered WordPress-content fallback instead of failing the
entire package. That case is reported as `BP_WP_EXPORT_RENDER_FALLBACK` in the
package warnings so the importer or reviewer can spot pages that need closer
visual QA. Blogposter imports surface those report warnings in the dry-run plan
and keep the raw warning objects for migration review.

WordPress menu locations, menu item IDs, parent IDs, targets, relations and CSS
classes are kept so Blogposter can rebuild navigation through its own
Navigation Manager. The exporter also writes the basic WordPress SEO summary
and reads supported redirect rows from the popular Redirection plugin when its
table is present.

Per-page source metadata intentionally skips meta keys that look like secrets,
tokens, passwords, sessions, nonces, licenses or API keys. Skipped keys are
reported with `BP_WP_EXPORT_META_SKIPPED`; remaining meta values are truncated
for migration review instead of treated as executable plugin state.

During a Blogposter import, local package assets are published through the
existing Media Manager pipeline when available. The importer rewrites rendered
HTML, normalized HTML, media entries and generated Designer draft widgets to the
new public Blogposter URLs.

The importer also reads local CSS from the package and produces style hints:
CSS variables, repeated colors, font families, spacing values and inferred token
roles. These hints help rebuild the visual language in Blogposter without
turning WordPress theme behavior into a Blogposter theme.

Page scripts and rendered HTML markers are turned into behavior hints during
import. Known slider, animation, form and embed patterns become suggested
Blogposter rebuild targets; unknown JavaScript stays review-only.

## Boundary

The exporter does not claim perfect WordPress compatibility. It preserves the
rendered page as a fallback, records JavaScript as page behavior, and gives
BlogposterCMS normalized HTML plus mapping hints for native Designer rebuilds.
Remote assets are reported instead of silently vendored.
