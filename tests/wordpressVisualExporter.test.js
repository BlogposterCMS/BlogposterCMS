const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { buildPluginPackage, PLUGIN_SLUG } = require('../tools/wordpress-visual-exporter/package-plugin');

const pluginPath = path.resolve(__dirname, '..', 'tools', 'wordpress-visual-exporter', 'blogposter-visual-exporter.php');
const readmePath = path.resolve(__dirname, '..', 'tools', 'wordpress-visual-exporter', 'README.md');

test('WordPress visual exporter declares the Blogposter site package contract', () => {
  const source = fs.readFileSync(pluginPath, 'utf8');

  assert.match(source, /Plugin Name:\s*Blogposter Visual Exporter/);
  assert(source.includes('blogposter-wordpress-site-package'));
  assert(source.includes('rendered.html'));
  assert(source.includes('normalized.html'));
  assert(source.includes('source.json'));
  assert(source.includes("'assets' => $this->assetManifest"));
  assert(source.includes("'redirects' => $this->collectRedirects()"));
  assert(source.includes('mapping-hints.json'));
  assert(source.includes('blocked-behavior.json'));
});

test('WordPress visual exporter exposes all local assets separately from image media', () => {
  const source = fs.readFileSync(pluginPath, 'utf8');

  assert(source.includes("'kind' => $kind"));
  assert(source.includes('private function mediaManifest(): array'));
  assert(source.includes('strpos((string) ($asset[\'mimeType\'] ?? \'\'), \'image/\') === 0'));
});

test('WordPress visual exporter rewrites only asset-bearing HTML attributes', () => {
  const source = fs.readFileSync(pluginPath, 'utf8');

  assert(source.includes('rewriteTagAssetAttributes'));
  assert(source.includes('assetKindForTagAttribute'));
  assert(source.includes('rewriteSrcsetValue'));
  assert(source.includes("'poster'"));
  assert(source.includes("'srcset'"));
  assert(source.includes('linkAssetKind'));
  assert(!source.includes("/\\b(src|href)=([\\'\\\"])([^\\'\\\"]+)\\2/i"));
});

test('WordPress visual exporter keeps searchable export error codes', () => {
  const source = fs.readFileSync(pluginPath, 'utf8');

  assert(source.includes('BP_WP_EXPORT_PERMISSION_DENIED'));
  assert(source.includes('BP_WP_EXPORT_ZIP_UNAVAILABLE'));
  assert(source.includes('BP_WP_EXPORT_CAPTURE_FAILED'));
  assert(source.includes('BP_WP_EXPORT_RENDER_FALLBACK'));
  assert(source.includes('BP_WP_EXPORT_FETCH_FAILED'));
  assert(source.includes('BP_WP_EXPORT_FETCH_STATUS'));
  assert(source.includes('BP_WP_EXPORT_ASSET_FETCH_FAILED'));
});

test('WordPress visual exporter falls back when frontend capture cannot finish', () => {
  const source = fs.readFileSync(pluginPath, 'utf8');

  assert(source.includes('private function renderPostFallbackHtml(WP_Post $post, string $url): string'));
  assert(source.includes('data-blogposter-export-fallback="wordpress-content"'));
  assert(source.includes("if ($rawHtml === '')"));
  assert(source.includes('$rawHtml = $this->renderPostFallbackHtml($post, $url ?: \'\');'));
  assert(source.includes("return '';"));
  assert(!source.includes("throw new RuntimeException(self::ERROR_CAPTURE_FAILED . ': Could not fetch frontend page"));
});

test('WordPress visual exporter clears WXR headers before streaming the site package', () => {
  const source = fs.readFileSync(pluginPath, 'utf8');

  assert(source.includes('private function clearWxrExportHeaders(): void'));
  assert(source.includes("$this->clearWxrExportHeaders();"));
  assert(source.includes("header_remove($headerName)"));
});

test('WordPress visual exporter carries navigation and redirect metadata', () => {
  const source = fs.readFileSync(pluginPath, 'utf8');

  assert(source.includes('get_nav_menu_locations'));
  assert(source.includes("'id' => (int) $item->ID"));
  assert(source.includes("'locations' => $locationsByMenuId[(int) $menu->term_id] ?? []"));
  assert(source.includes('private function collectRedirects(): array'));
  assert(source.includes('redirection_items'));
  assert(source.includes('BP_WP_EXPORT_REDIRECT_SKIPPED'));
});

test('WordPress visual exporter carries page source metadata for mapping', () => {
  const source = fs.readFileSync(pluginPath, 'utf8');

  assert(source.includes('private function collectPostTerms'));
  assert(source.includes('private function detectPostLanguage'));
  assert(source.includes('private function detectPostTranslation'));
  assert(source.includes('private function collectPostSeoSummary'));
  assert(source.includes('private function collectSelectedPostMeta'));
  assert(source.includes('BP_WP_EXPORT_META_SKIPPED'));
  assert(source.includes("'parentSourceId' => (int) $post->post_parent > 0 ? 'wp-post-'"));
  assert(source.includes("'terms' => $terms"));
  assert(source.includes("'translation' => $translation"));
  assert(source.includes("'meta' => $this->collectSelectedPostMeta($post)"));
});

test('WordPress visual exporter README documents the neutralized package files', () => {
  const readme = fs.readFileSync(readmePath, 'utf8');

  assert(readme.includes('manifest.json'));
  assert(readme.includes('pages/<slug>/rendered.html'));
  assert(readme.includes('pages/<slug>/normalized.html'));
  assert(readme.includes('reports/mapping-hints.json'));
});

test('WordPress visual exporter packaging script creates installable plugin zip', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bp-wp-exporter-package-'));

  try {
    const outputPath = path.join(tmpRoot, 'blogposter-visual-exporter.zip');
    const result = buildPluginPackage({ outputPath });
    const zip = new AdmZip(outputPath);
    const entries = zip.getEntries().map(entry => entry.entryName).sort();

    assert.strictEqual(result.outputPath, outputPath);
    assert(entries.includes(`${PLUGIN_SLUG}/blogposter-visual-exporter.php`));
    assert(entries.includes(`${PLUGIN_SLUG}/README.md`));
    assert(!entries.some(entry => entry.includes('node_modules') || entry.includes('.env')));
    assert.match(
      zip.readAsText(`${PLUGIN_SLUG}/blogposter-visual-exporter.php`),
      /Plugin Name:\s*Blogposter Visual Exporter/
    );
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  }
});
