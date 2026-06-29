<?php
/**
 * Plugin Name: Blogposter Visual Exporter
 * Description: Exports a neutralized WordPress site package for BlogposterCMS visual mapping imports.
 * Version: 0.1.0
 * Author: BlogposterCMS
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Blogposter_Visual_Exporter {
    private const ACTION = 'blogposter_visual_export';
    private const NONCE_ACTION = 'blogposter_visual_export_nonce';
    private const PACKAGE_FORMAT = 'blogposter-wordpress-site-package';
    private const MAX_ASSET_BYTES = 12000000;
    private const ERROR_PERMISSION_DENIED = 'BP_WP_EXPORT_PERMISSION_DENIED';
    private const ERROR_ZIP_UNAVAILABLE = 'BP_WP_EXPORT_ZIP_UNAVAILABLE';
    private const ERROR_CAPTURE_FAILED = 'BP_WP_EXPORT_CAPTURE_FAILED';

    /** @var ZipArchive|null */
    private $zip = null;

    /** @var array<string,string> */
    private $assetMap = [];

    /** @var array<int,array<string,mixed>> */
    private $assetManifest = [];

    /** @var array<string,bool> */
    private $themeStyles = [];

    /** @var array<int,array<string,string>> */
    private $remoteAssets = [];

    /** @var array<int,array<string,string>> */
    private $warnings = [];

    public static function bootstrap(): void {
        $plugin = new self();
        add_action('admin_menu', [$plugin, 'registerAdminPage']);
        add_action('admin_post_' . self::ACTION, [$plugin, 'handleExport']);
    }

    public function registerAdminPage(): void {
        add_management_page(
            'Blogposter Visual Export',
            'Blogposter Visual Export',
            'manage_options',
            'blogposter-visual-export',
            [$this, 'renderAdminPage']
        );
    }

    public function renderAdminPage(): void {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html(self::ERROR_PERMISSION_DENIED . ': manage_options capability is required.'));
        }
        ?>
        <div class="wrap">
            <h1>Blogposter Visual Export</h1>
            <p>Export a neutralized HTML/CSS/asset package that BlogposterCMS can map into editable content.</p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <?php wp_nonce_field(self::NONCE_ACTION); ?>
                <input type="hidden" name="action" value="<?php echo esc_attr(self::ACTION); ?>">
                <p>
                    <label>
                        <input type="checkbox" name="include_posts" value="1" checked>
                        Include public posts as well as pages
                    </label>
                </p>
                <?php submit_button('Download Blogposter Site Package'); ?>
            </form>
        </div>
        <?php
    }

    public function handleExport(): void {
        $this->assertExportAllowed();
        if (!class_exists('ZipArchive')) {
            wp_die(esc_html(self::ERROR_ZIP_UNAVAILABLE . ': PHP ZipArchive extension is required.'));
        }

        $tmp = tempnam(get_temp_dir(), 'bp-site-package-');
        if (!$tmp) {
            wp_die(esc_html(self::ERROR_CAPTURE_FAILED . ': Could not create a temporary package file.'));
        }

        $this->zip = new ZipArchive();
        if ($this->zip->open($tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            @unlink($tmp);
            wp_die(esc_html(self::ERROR_CAPTURE_FAILED . ': Could not open the package ZIP.'));
        }

        try {
            $includePosts = !empty($_POST['include_posts']);
            $manifest = $this->buildPackage($includePosts);
            $this->zip->addFromString('manifest.json', wp_json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            $this->zip->close();
            $this->streamZip($tmp);
        } catch (Throwable $error) {
            if ($this->zip instanceof ZipArchive) {
                $this->zip->close();
            }
            @unlink($tmp);
            wp_die(esc_html(self::ERROR_CAPTURE_FAILED . ': ' . $error->getMessage()));
        }
    }

    private function assertExportAllowed(): void {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html(self::ERROR_PERMISSION_DENIED . ': manage_options capability is required.'));
        }
        check_admin_referer(self::NONCE_ACTION);
    }

    /**
     * WordPress renders the site first; Blogposter receives a neutral package
     * with rendered fallbacks plus normalized HTML for later Designer mapping.
     */
    private function buildPackage(bool $includePosts): array {
        $pages = [];
        foreach ($this->collectPublicPosts($includePosts) as $index => $post) {
            $pages[] = $this->capturePost($post, $index);
        }

        $content = $this->addWxrExport();
        $mappingReport = [
            'generatedAt' => gmdate('c'),
            'pages' => array_map(static function (array $page): array {
                return [
                    'sourceId' => $page['sourceId'],
                    'slug' => $page['slug'],
                    'title' => $page['title'],
                    'builder' => $page['mapping']['source']['builder'] ?? 'unknown',
                    'confidence' => $page['mapping']['confidence'] ?? null,
                    'nativeWidgets' => $page['mapping']['nativeWidgets'] ?? [],
                    'fallback' => $page['mapping']['fallback'] ?? 'rendered-html'
                ];
            }, $pages)
        ];
        $blockedReport = [
            'generatedAt' => gmdate('c'),
            'remoteAssets' => $this->remoteAssets,
            'warnings' => $this->warnings
        ];
        $sourceSummary = $this->buildSourceSummary();

        $this->zip->addFromString('reports/mapping-hints.json', wp_json_encode($mappingReport, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $this->zip->addFromString('reports/blocked-behavior.json', wp_json_encode($blockedReport, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $this->zip->addFromString('reports/source-summary.json', wp_json_encode($sourceSummary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        return [
            'format' => self::PACKAGE_FORMAT,
            'version' => '1.0.0',
            'generatedAt' => gmdate('c'),
            'source' => [
                'platform' => 'wordpress',
                'siteUrl' => home_url('/'),
                'adminUrl' => admin_url(),
                'wordpressVersion' => get_bloginfo('version')
            ],
            'site' => [
                'title' => get_bloginfo('name'),
                'description' => get_bloginfo('description'),
                'language' => get_bloginfo('language')
            ],
            'theme' => [
                'name' => wp_get_theme()->get('Name'),
                'stylesheet' => get_stylesheet(),
                'template' => get_template(),
                'styles' => array_values(array_keys($this->themeStyles))
            ],
            'content' => $content,
            'pages' => $pages,
            'assets' => $this->assetManifest,
            'media' => $this->mediaManifest(),
            'menus' => $this->collectMenus(),
            'seo' => $this->collectSeoSummary(),
            'redirects' => $this->collectRedirects(),
            'reports' => [
                'mappingHints' => 'reports/mapping-hints.json',
                'blockedBehavior' => 'reports/blocked-behavior.json',
                'sourceSummary' => 'reports/source-summary.json'
            ]
        ];
    }

    /**
     * Keep the first prototype broad but predictable: public content types only,
     * sorted like normal site content instead of dumping internal post records.
     */
    private function collectPublicPosts(bool $includePosts): array {
        $postTypes = get_post_types(['public' => true], 'names');
        unset($postTypes['attachment']);
        if (!$includePosts) {
            $postTypes = ['page' => 'page'];
        }

        return get_posts([
            'post_type' => array_values($postTypes),
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'orderby' => ['menu_order' => 'ASC', 'date' => 'DESC'],
            'suppress_filters' => false
        ]);
    }

    private function capturePost(WP_Post $post, int $index): array {
        $url = get_permalink($post);
        if (!$url) {
            $this->warnings[] = [
                'code' => 'BP_WP_EXPORT_MISSING_PERMALINK',
                'message' => 'A post was skipped because WordPress did not return a permalink.',
                'postId' => (string) $post->ID
            ];
        }

        $rawHtml = $this->fetchUrl($url ?: home_url('/'));
        if ($rawHtml === '') {
            $rawHtml = $this->renderPostFallbackHtml($post, $url ?: '');
            $this->warnings[] = [
                'code' => 'BP_WP_EXPORT_RENDER_FALLBACK',
                'message' => 'Frontend capture failed; exported a rendered WordPress content fallback for this post.',
                'postId' => (string) $post->ID,
                'url' => $url ?: ''
            ];
        }
        $basePath = 'pages/' . $this->safeSlug($this->pageSlug($post, $index));
        $pageAssets = [
            'styles' => [],
            'scripts' => [],
            'media' => []
        ];

        $renderedHtml = $this->rewriteHtmlAssets($rawHtml, $url ?: home_url('/'), $pageAssets);
        $normalizedHtml = $this->neutralizeHtml($renderedHtml);
        $source = $this->buildPageSource($post, $url ?: '');
        $mapping = $this->buildMappingHints($post, $normalizedHtml, $pageAssets);

        $this->zip->addFromString($basePath . '/rendered.html', $renderedHtml);
        $this->zip->addFromString($basePath . '/normalized.html', $normalizedHtml);
        $this->zip->addFromString($basePath . '/source.json', wp_json_encode($source, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        return [
            'sourceId' => 'wp-post-' . $post->ID,
            'slug' => $this->pageSlug($post, $index),
            'title' => get_the_title($post),
            'url' => $url ?: '',
            'status' => $post->post_status,
            'contentType' => $post->post_type === 'post' ? 'post' : 'page',
            'rendered' => [
                'htmlPath' => $basePath . '/rendered.html',
                'styles' => array_values($pageAssets['styles']),
                'scripts' => array_values($pageAssets['scripts']),
                'media' => array_values($pageAssets['media'])
            ],
            'normalized' => [
                'htmlPath' => $basePath . '/normalized.html',
                'sourcePath' => $basePath . '/source.json'
            ],
            'mapping' => $mapping
        ];
    }

    private function fetchUrl(string $url): string {
        $response = wp_remote_get($url, [
            'timeout' => 20,
            'redirection' => 5,
            'headers' => [
                'User-Agent' => 'BlogposterVisualExporter/0.1; ' . home_url('/')
            ]
        ]);
        if (is_wp_error($response)) {
            $this->warnings[] = [
                'code' => 'BP_WP_EXPORT_FETCH_FAILED',
                'url' => $url,
                'message' => $response->get_error_message()
            ];
            return '';
        }
        $code = (int) wp_remote_retrieve_response_code($response);
        if ($code < 200 || $code >= 400) {
            $this->warnings[] = [
                'code' => 'BP_WP_EXPORT_FETCH_STATUS',
                'url' => $url,
                'message' => 'Frontend capture returned HTTP ' . $code
            ];
            return '';
        }
        return (string) wp_remote_retrieve_body($response);
    }

    private function renderPostFallbackHtml(WP_Post $post, string $url): string {
        $GLOBALS['post'] = $post;
        setup_postdata($post);
        $content = apply_filters('the_content', $post->post_content);
        wp_reset_postdata();
        return '<!doctype html><html><head><meta charset="' . esc_attr(get_bloginfo('charset')) . '"><title>' .
            esc_html(get_the_title($post)) .
            '</title></head><body><main data-blogposter-export-fallback="wordpress-content" data-source-url="' .
            esc_url($url) .
            '"><h1>' .
            esc_html(get_the_title($post)) .
            '</h1>' .
            $content .
            '</main></body></html>';
    }

    private function rewriteHtmlAssets(string $html, string $baseUrl, array &$pageAssets): string {
        return preg_replace_callback('/<([a-z0-9:-]+)\b([^>]*)>/i', function (array $match) use ($baseUrl, &$pageAssets): string {
            $tag = strtolower($match[1]);
            $attrs = $this->rewriteTagAssetAttributes($tag, $match[2], $baseUrl, $pageAssets);
            return '<' . $match[1] . $attrs . '>';
        }, $html);
    }

    private function rewriteTagAssetAttributes(string $tag, string $attrs, string $baseUrl, array &$pageAssets): string {
        $assetAttributes = ['srcset', 'src', 'href', 'poster', 'data-src', 'data-lazy-src', 'data-bg', 'data-background', 'data-background-image'];
        $rewritten = $this->rewriteInlineStyleAttribute($attrs, $baseUrl, $pageAssets);
        foreach ($assetAttributes as $attribute) {
            $rewritten = $this->rewriteAssetAttribute($tag, $rewritten, $attribute, $baseUrl, $pageAssets);
        }
        return $rewritten;
    }

    private function rewriteInlineStyleAttribute(string $attrs, string $baseUrl, array &$pageAssets): string {
        return preg_replace_callback('/(\sstyle\s*=\s*)([\'"])(.*?)\2/is', function (array $match) use ($baseUrl, &$pageAssets): string {
            $css = $this->rewriteCssAssets($match[3], $baseUrl, $pageAssets);
            return $match[1] . $match[2] . esc_attr($css) . $match[2];
        }, $attrs);
    }

    private function rewriteAssetAttribute(string $tag, string $attrs, string $attribute, string $baseUrl, array &$pageAssets): string {
        $pattern = '/(\s' . preg_quote($attribute, '/') . '\s*=\s*)([\'"])(.*?)\2/is';
        return preg_replace_callback($pattern, function (array $match) use ($tag, $attrs, $attribute, $baseUrl, &$pageAssets): string {
            $kind = $this->assetKindForTagAttribute($tag, $attribute, $attrs, $match[3]);
            if (!$kind) {
                return $match[0];
            }
            $value = strtolower($attribute) === 'srcset'
                ? $this->rewriteSrcsetValue($match[3], $baseUrl, $kind, $pageAssets)
                : $this->rewriteAssetValue($match[3], $baseUrl, $kind, $pageAssets);
            if ($value === $match[3]) {
                return $match[0];
            }
            return $match[1] . $match[2] . esc_attr($value) . $match[2];
        }, $attrs);
    }

    private function rewriteAssetValue(string $value, string $baseUrl, string $kind, array &$pageAssets): string {
        $assetUrl = $this->absoluteUrl($value, $baseUrl);
        $assetPath = $this->storeAsset($assetUrl, $kind);
        if (!$assetPath) {
            return $value;
        }
        $this->registerPageAsset($assetPath, $kind, $pageAssets);
        return '../../' . $assetPath;
    }

    private function rewriteSrcsetValue(string $value, string $baseUrl, string $kind, array &$pageAssets): string {
        $parts = array_map('trim', explode(',', $value));
        $rewritten = [];
        foreach ($parts as $part) {
            if ($part === '') {
                continue;
            }
            $segments = preg_split('/\s+/', $part, 2);
            $url = $segments[0] ?? '';
            $descriptor = $segments[1] ?? '';
            $assetPath = $this->storeAsset($this->absoluteUrl($url, $baseUrl), $kind);
            if ($assetPath) {
                $this->registerPageAsset($assetPath, $kind, $pageAssets);
                $url = '../../' . $assetPath;
            }
            $rewritten[] = trim($url . ' ' . $descriptor);
        }
        return implode(', ', $rewritten);
    }

    private function registerPageAsset(string $assetPath, string $kind, array &$pageAssets): void {
        if ($kind === 'styles') {
            $pageAssets['styles'][$assetPath] = $assetPath;
            $this->themeStyles[$assetPath] = true;
        } elseif ($kind === 'scripts') {
            $pageAssets['scripts'][$assetPath] = $assetPath;
        } elseif ($kind === 'media') {
            $pageAssets['media'][$assetPath] = $assetPath;
        }
    }

    private function assetKindForTagAttribute(string $tag, string $attribute, string $attrs, string $value): string {
        $tag = strtolower($tag);
        $attribute = strtolower($attribute);
        if (in_array($attribute, ['data-src', 'data-lazy-src', 'data-bg', 'data-background', 'data-background-image'], true)) {
            return $this->guessAssetKind($value) === 'media' ? 'media' : '';
        }
        if ($attribute === 'srcset') {
            return in_array($tag, ['img', 'source'], true) ? 'media' : '';
        }
        if ($tag === 'script' && $attribute === 'src') {
            return 'scripts';
        }
        if ($tag === 'link' && $attribute === 'href') {
            return $this->linkAssetKind($attrs, $value);
        }
        if (in_array($tag, ['img', 'source'], true) && $attribute === 'src') {
            return 'media';
        }
        if (in_array($tag, ['video', 'audio'], true) && in_array($attribute, ['src', 'poster'], true)) {
            return 'media';
        }
        return '';
    }

    private function linkAssetKind(string $attrs, string $value): string {
        $rel = strtolower($this->htmlAttribute($attrs, 'rel'));
        $as = strtolower($this->htmlAttribute($attrs, 'as'));
        if (strpos($rel, 'stylesheet') !== false || $as === 'style') {
            return 'styles';
        }
        if (strpos($rel, 'modulepreload') !== false || $as === 'script') {
            return 'scripts';
        }
        if (strpos($rel, 'icon') !== false || $as === 'image') {
            return 'media';
        }
        if ($as === 'font') {
            return 'fonts';
        }
        $guessed = $this->guessAssetKind($value);
        return in_array($guessed, ['styles', 'scripts', 'media', 'fonts'], true) ? $guessed : '';
    }

    private function htmlAttribute(string $attrs, string $name): string {
        $pattern = '/\s' . preg_quote($name, '/') . '\s*=\s*([\'"])(.*?)\1/is';
        return preg_match($pattern, $attrs, $match) ? html_entity_decode($match[2]) : '';
    }

    private function storeAsset(string $url, string $kind): string {
        if (!$url || !$this->isLocalUrl($url)) {
            if ($url) {
                $this->remoteAssets[] = [
                    'code' => 'BP_WP_EXPORT_REMOTE_ASSET',
                    'url' => $url,
                    'message' => 'Remote assets stay referenced and should be reviewed before import.'
                ];
            }
            return '';
        }
        if (isset($this->assetMap[$url])) {
            return $this->assetMap[$url];
        }

        $body = $this->fetchAssetBody($url);
        if ($body === '') {
            return '';
        }

        if ($kind === 'styles') {
            $body = $this->rewriteCssAssets($body, $url);
        }

        $pathInfo = wp_parse_url($url);
        $fileName = sanitize_file_name(basename($pathInfo['path'] ?? 'asset'));
        if (!$fileName || $fileName === '.' || $fileName === '..') {
            $fileName = 'asset';
        }
        $target = 'assets/' . $kind . '/' . substr(md5($url), 0, 12) . '-' . $fileName;
        $this->zip->addFromString($target, $body);
        $this->assetMap[$url] = $target;
        $this->assetManifest[] = [
            'sourceId' => 'asset-' . substr(md5($url), 0, 12),
            'fileName' => $fileName,
            'path' => $target,
            'url' => $url,
            'mimeType' => $this->guessMimeType($fileName),
            'kind' => $kind,
            'title' => $fileName
        ];
        return $target;
    }

    private function fetchAssetBody(string $url): string {
        $response = wp_remote_get($url, [
            'timeout' => 20,
            'redirection' => 3,
            'limit_response_size' => self::MAX_ASSET_BYTES,
            'headers' => [
                'User-Agent' => 'BlogposterVisualExporter/0.1; ' . home_url('/')
            ]
        ]);
        if (is_wp_error($response)) {
            $this->warnings[] = [
                'code' => 'BP_WP_EXPORT_ASSET_FETCH_FAILED',
                'url' => $url,
                'message' => $response->get_error_message()
            ];
            return '';
        }
        $code = (int) wp_remote_retrieve_response_code($response);
        if ($code < 200 || $code >= 400) {
            $this->warnings[] = [
                'code' => 'BP_WP_EXPORT_ASSET_STATUS',
                'url' => $url,
                'message' => 'Asset returned HTTP ' . $code
            ];
            return '';
        }
        return (string) wp_remote_retrieve_body($response);
    }

    private function rewriteCssAssets(string $css, string $baseUrl, ?array &$pageAssets = null): string {
        return preg_replace_callback('/url\(\s*([\'"]?)([^\'")]+)\1\s*\)/i', function (array $match) use ($baseUrl, &$pageAssets): string {
            $raw = trim($match[2]);
            if ($raw === '' || strpos($raw, 'data:') === 0) {
                return $match[0];
            }
            $kind = $this->guessAssetKind($raw);
            $assetUrl = $this->absoluteUrl($raw, $baseUrl);
            $assetPath = $this->storeAsset($assetUrl, $kind);
            if (!$assetPath) {
                return $match[0];
            }
            if (is_array($pageAssets)) {
                $this->registerPageAsset($assetPath, $kind, $pageAssets);
            }
            return 'url("../../' . $assetPath . '")';
        }, $css);
    }

    private function neutralizeHtml(string $html): string {
        $clean = preg_replace('/<script\b[^>]*>[\s\S]*?<\/script>/i', '', $html);
        $clean = preg_replace('/<noscript\b[^>]*>[\s\S]*?<\/noscript>/i', '', $clean);
        $clean = preg_replace('/<div[^>]+id=[\'"]wpadminbar[\'"][\s\S]*?<\/div>/i', '', $clean);
        $clean = preg_replace('/\s+on[a-z]+\s*=\s*([\'"]).*?\1/i', '', $clean);
        $clean = preg_replace('/\s(?:nonce|integrity)=([\'"]).*?\1/i', '', $clean);
        $clean = preg_replace('/<!--\s*\/?wp:[\s\S]*?-->/i', '', $clean);
        return trim((string) $clean);
    }

    private function collectPostTerms(WP_Post $post): array {
        $terms = [];
        foreach (get_object_taxonomies($post->post_type, 'objects') as $taxonomy => $taxonomyObject) {
            if (empty($taxonomyObject->public) && empty($taxonomyObject->show_ui)) {
                continue;
            }
            $postTerms = get_the_terms($post, $taxonomy);
            if (is_wp_error($postTerms) || empty($postTerms)) {
                continue;
            }
            foreach ($postTerms as $term) {
                if (!($term instanceof WP_Term)) {
                    continue;
                }
                $parentSlug = '';
                if ((int) $term->parent > 0) {
                    $parent = get_term((int) $term->parent, $taxonomy);
                    if ($parent instanceof WP_Term) {
                        $parentSlug = (string) $parent->slug;
                    }
                }
                $terms[] = [
                    'wpDomain' => (string) $taxonomy,
                    'sourceId' => (string) $term->term_id,
                    'slug' => (string) $term->slug,
                    'name' => (string) $term->name,
                    'parentSlug' => $parentSlug,
                    'description' => (string) $term->description
                ];
            }
        }
        return $terms;
    }

    private function normalizeLanguageCode(string $language): string {
        $normalized = strtolower(str_replace('_', '-', trim($language)));
        return preg_match('/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/', $normalized) ? $normalized : '';
    }

    private function detectPostLanguage(WP_Post $post, array $terms): string {
        foreach (['_wpml_language', 'wpml_language', 'wpml_language_code', 'icl_language_code', '_language', 'language', 'locale', 'pll_language', '_pll_language'] as $key) {
            $language = $this->normalizeLanguageCode((string) get_post_meta($post->ID, $key, true));
            if ($language !== '') {
                return $language;
            }
        }
        foreach ($terms as $term) {
            $domain = strtolower((string) ($term['wpDomain'] ?? ''));
            if (strpos($domain, 'language') === false && strpos($domain, 'translation') === false) {
                continue;
            }
            $language = $this->normalizeLanguageCode((string) ($term['slug'] ?? $term['name'] ?? ''));
            if ($language !== '') {
                return $language;
            }
        }
        if (function_exists('pll_get_post_language')) {
            $language = $this->normalizeLanguageCode((string) pll_get_post_language($post->ID, 'locale'));
            if ($language !== '') {
                return $language;
            }
        }
        return $this->normalizeLanguageCode((string) get_bloginfo('language'));
    }

    private function postMetaString(int $postId, string $key): string {
        $value = get_post_meta($postId, $key, true);
        if (is_array($value)) {
            return implode(',', array_map('strval', $value));
        }
        return is_scalar($value) ? (string) $value : '';
    }

    private function detectPostTranslation(WP_Post $post): array {
        $groupId = '';
        foreach (['_translation_group', 'translation_group', 'pll_translation_group'] as $key) {
            $value = (string) get_post_meta($post->ID, $key, true);
            if ($value !== '') {
                $groupId = $value;
                break;
            }
        }
        $sourceId = '';
        foreach (['_icl_translation_of', '_translation_source', 'translation_source'] as $key) {
            $value = (string) get_post_meta($post->ID, $key, true);
            if ($value !== '') {
                $sourceId = $value;
                break;
            }
        }
        if ($groupId === '' && $sourceId === '') {
            return [];
        }
        return array_filter([
            'groupId' => $groupId,
            'sourceId' => $sourceId
        ], static function (string $value): bool {
            return $value !== '';
        });
    }

    private function collectPostSeoSummary(WP_Post $post, string $url): array {
        $title = (string) ($this->postMetaString((int) $post->ID, '_yoast_wpseo_title')
            ?: $this->postMetaString((int) $post->ID, 'rank_math_title')
            ?: $this->postMetaString((int) $post->ID, '_seopress_titles_title')
            ?: get_the_title($post));
        $description = (string) ($this->postMetaString((int) $post->ID, '_yoast_wpseo_metadesc')
            ?: $this->postMetaString((int) $post->ID, 'rank_math_description')
            ?: $this->postMetaString((int) $post->ID, '_seopress_titles_desc')
            ?: get_the_excerpt($post));
        $canonical = (string) ($this->postMetaString((int) $post->ID, '_yoast_wpseo_canonical')
            ?: $this->postMetaString((int) $post->ID, 'rank_math_canonical_url')
            ?: $url);
        $robotsNoIndex = (string) ($this->postMetaString((int) $post->ID, '_yoast_wpseo_meta-robots-noindex')
            ?: $this->postMetaString((int) $post->ID, 'rank_math_robots'));

        return [
            'title' => $title,
            'description' => $description,
            'canonicalUrl' => $canonical,
            'robots' => strpos($robotsNoIndex, 'noindex') !== false || $robotsNoIndex === '1' ? 'noindex,follow' : 'index,follow',
            'ogImage' => (string) ($this->postMetaString((int) $post->ID, '_yoast_wpseo_opengraph-image')
                ?: $this->postMetaString((int) $post->ID, 'rank_math_facebook_image')
                ?: '')
        ];
    }

    private function collectFeaturedMedia(WP_Post $post): array {
        $imageId = (int) get_post_thumbnail_id($post);
        if ($imageId <= 0) {
            return [];
        }
        return [
            'sourceId' => 'wp-attachment-' . $imageId,
            'id' => $imageId,
            'url' => (string) wp_get_attachment_url($imageId),
            'altText' => (string) get_post_meta($imageId, '_wp_attachment_image_alt', true),
            'title' => (string) get_the_title($imageId)
        ];
    }

    private function collectSelectedPostMeta(WP_Post $post): array {
        $meta = [];
        foreach (get_post_meta($post->ID) as $key => $values) {
            if ($this->isSensitiveMetaKey((string) $key)) {
                $this->warnings[] = [
                    'code' => 'BP_WP_EXPORT_META_SKIPPED',
                    'message' => 'A post meta key was skipped because it looked sensitive.',
                    'postId' => (string) $post->ID,
                    'metaKey' => (string) $key
                ];
                continue;
            }
            $meta[(string) $key] = array_values(array_filter(array_map([$this, 'sanitizePostMetaValue'], (array) $values), static function ($value): bool {
                return $value !== null && $value !== '';
            }));
        }
        return $meta;
    }

    private function isSensitiveMetaKey(string $key): bool {
        return (bool) preg_match('/(password|passwd|token|secret|consumer|private|session|auth|nonce|license|api[_-]?key)/i', $key);
    }

    private function sanitizePostMetaValue($value): string {
        if (is_scalar($value)) {
            return substr((string) $value, 0, 8000);
        }
        return substr(wp_json_encode($value, JSON_UNESCAPED_SLASHES), 0, 8000);
    }

    private function buildPageSource(WP_Post $post, string $url): array {
        $terms = $this->collectPostTerms($post);
        $translation = $this->detectPostTranslation($post);
        $featuredMedia = $this->collectFeaturedMedia($post);
        $author = get_user_by('id', (int) $post->post_author);
        return [
            'postId' => $post->ID,
            'postType' => $post->post_type,
            'parentId' => (int) $post->post_parent,
            'parentSourceId' => (int) $post->post_parent > 0 ? 'wp-post-' . (int) $post->post_parent : '',
            'slug' => $post->post_name,
            'status' => $post->post_status,
            'menuOrder' => (int) $post->menu_order,
            'url' => $url,
            'publishedAt' => get_post_time('c', true, $post),
            'modifiedAt' => get_post_modified_time('c', true, $post),
            'author' => [
                'id' => (int) $post->post_author,
                'displayName' => $author ? (string) $author->display_name : ''
            ],
            'excerpt' => get_the_excerpt($post),
            'template' => get_page_template_slug($post) ?: '',
            'builder' => $this->detectBuilder($post),
            'terms' => $terms,
            'language' => $this->detectPostLanguage($post, $terms),
            'translation' => $translation,
            'seo' => $this->collectPostSeoSummary($post, $url),
            'featuredMedia' => $featuredMedia,
            'metaKeys' => array_values(array_unique(array_keys(get_post_meta($post->ID)))),
            'meta' => $this->collectSelectedPostMeta($post)
        ];
    }

    private function buildMappingHints(WP_Post $post, string $html, array $pageAssets): array {
        $builder = $this->detectBuilder($post);
        $nativeWidgets = $this->detectNativeWidgets($html);
        $scriptCount = count($pageAssets['scripts']);
        $confidence = 0.42 + min(0.28, count($nativeWidgets) * 0.04);
        if ($builder === 'gutenberg') {
            $confidence += 0.12;
        } elseif ($builder !== 'classic') {
            $confidence -= 0.08;
        }
        if ($scriptCount > 0) {
            $confidence -= min(0.18, $scriptCount * 0.03);
        }
        $confidence = max(0.15, min(0.92, $confidence));

        return [
            'confidence' => round($confidence, 2),
            'nativeWidgets' => $nativeWidgets,
            'mapperHints' => [
                'headings' => $this->countPattern('/<h[1-6]\b/i', $html),
                'images' => $this->countPattern('/<img\b/i', $html),
                'buttons' => $this->countPattern('/<(a|button)\b[^>]*(class=[\'"][^\'"]*(btn|button|cta)[^\'"]*[\'"])?/i', $html),
                'forms' => $this->countPattern('/<form\b/i', $html),
                'shortcodes' => $this->countPattern('/\[[A-Za-z0-9_-]+[^\]]*\]/', $post->post_content)
            ],
            'source' => [
                'builder' => $builder,
                'postType' => $post->post_type,
                'template' => get_page_template_slug($post) ?: ''
            ],
            'fallback' => $scriptCount ? 'normalized-html-with-rendered-js-reference' : 'normalized-html'
        ];
    }

    private function countPattern(string $pattern, string $subject): int {
        $matches = [];
        $count = preg_match_all($pattern, $subject, $matches);
        return is_int($count) ? $count : 0;
    }

    private function detectNativeWidgets(string $html): array {
        $widgets = [];
        if (preg_match('/<h[1-6]\b|<p\b/i', $html)) {
            $widgets[] = 'textBox';
        }
        if (preg_match('/<img\b|<picture\b|<video\b/i', $html)) {
            $widgets[] = 'mediaBlock';
        }
        if (preg_match('/<(a|button)\b[^>]*(btn|button|cta)/i', $html)) {
            $widgets[] = 'buttonLink';
        }
        if (preg_match('/<nav\b|menu-item/i', $html)) {
            $widgets[] = 'navigationMenu';
        }
        if (preg_match('/gallery|wp-block-gallery/i', $html)) {
            $widgets[] = 'gallery';
        }
        return array_values(array_unique($widgets));
    }

    private function detectBuilder(WP_Post $post): string {
        if (has_blocks($post->post_content)) {
            return 'gutenberg';
        }
        if (get_post_meta($post->ID, '_elementor_data', true) || defined('ELEMENTOR_VERSION')) {
            return 'elementor';
        }
        if (get_post_meta($post->ID, '_et_pb_use_builder', true) === 'on' || defined('ET_BUILDER_VERSION')) {
            return 'divi';
        }
        if (strpos($post->post_content, '[vc_') !== false) {
            return 'wpbakery';
        }
        return 'classic';
    }

    private function addWxrExport(): array {
        if (!function_exists('export_wp')) {
            require_once ABSPATH . 'wp-admin/includes/export.php';
        }
        if (!function_exists('export_wp')) {
            $this->warnings[] = [
                'code' => 'BP_WP_EXPORT_WXR_UNAVAILABLE',
                'message' => 'WordPress export_wp() was unavailable; content WXR was skipped.'
            ];
            return [];
        }
        ob_start();
        export_wp(['content' => 'all']);
        $this->clearWxrExportHeaders();
        $xml = (string) ob_get_clean();
        if ($xml === '') {
            return [];
        }
        $this->zip->addFromString('content/export.wxr', $xml);
        return ['wxr' => ['path' => 'content/export.wxr']];
    }

    private function clearWxrExportHeaders(): void {
        if (!function_exists('header_remove') || headers_sent()) {
            return;
        }
        foreach (['Content-Description', 'Content-Disposition', 'Content-Type'] as $headerName) {
            header_remove($headerName);
        }
    }

    private function collectMenus(): array {
        $menus = [];
        $locationsByMenuId = [];
        $registeredLocations = function_exists('get_registered_nav_menus') ? get_registered_nav_menus() : [];
        foreach ((array) get_nav_menu_locations() as $locationKey => $menuId) {
            $menuId = (int) $menuId;
            if ($menuId <= 0) {
                continue;
            }
            if (!isset($locationsByMenuId[$menuId])) {
                $locationsByMenuId[$menuId] = [];
            }
            $locationsByMenuId[$menuId][] = [
                'key' => (string) $locationKey,
                'label' => (string) ($registeredLocations[$locationKey] ?? $locationKey)
            ];
        }

        foreach (wp_get_nav_menus() as $menu) {
            $items = [];
            foreach (wp_get_nav_menu_items($menu->term_id) ?: [] as $item) {
                $items[] = [
                    'id' => (int) $item->ID,
                    'title' => $item->title,
                    'url' => $item->url,
                    'menuOrder' => (int) $item->menu_order,
                    'parentId' => (int) $item->menu_item_parent,
                    'object' => $item->object,
                    'objectId' => (int) $item->object_id,
                    'target' => (string) $item->target,
                    'rel' => (string) $item->xfn,
                    'classes' => array_values(array_filter((array) $item->classes))
                ];
            }
            $menus[] = [
                'id' => (int) $menu->term_id,
                'slug' => $menu->slug,
                'name' => $menu->name,
                'locations' => $locationsByMenuId[(int) $menu->term_id] ?? [],
                'items' => $items
            ];
        }
        return $menus;
    }

    private function collectSeoSummary(): array {
        return [
            'homeTitle' => get_bloginfo('name'),
            'homeDescription' => get_bloginfo('description'),
            'frontPageId' => (int) get_option('page_on_front'),
            'postsPageId' => (int) get_option('page_for_posts'),
            'permalinkStructure' => (string) get_option('permalink_structure')
        ];
    }

    private function collectRedirects(): array {
        global $wpdb;
        if (!$wpdb) {
            return [];
        }

        $redirects = [];
        $redirectionTable = $wpdb->prefix . 'redirection_items';
        $tableExists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $redirectionTable));
        if ($tableExists === $redirectionTable) {
            $rows = $wpdb->get_results("SELECT id, url, regex, position, status, action_type, action_code, action_data, match_type, title FROM {$redirectionTable} ORDER BY position ASC, id ASC");
            foreach ($rows ?: [] as $row) {
                $target = (string) ($row->action_data ?? '');
                $source = (string) ($row->url ?? '');
                if ($source === '' || $target === '') {
                    $this->warnings[] = [
                        'code' => 'BP_WP_EXPORT_REDIRECT_SKIPPED',
                        'message' => 'A Redirection rule was skipped because source or target was empty.',
                        'sourceId' => 'redirection-' . (string) ($row->id ?? '')
                    ];
                    continue;
                }
                if (!in_array((string) ($row->action_type ?? 'url'), ['url', ''], true)) {
                    $this->warnings[] = [
                        'code' => 'BP_WP_EXPORT_REDIRECT_UNSUPPORTED_ACTION',
                        'message' => 'A Redirection rule uses an action type that Blogposter imports as review-only metadata.',
                        'sourceId' => 'redirection-' . (string) ($row->id ?? ''),
                        'actionType' => (string) ($row->action_type ?? '')
                    ];
                    continue;
                }

                $redirects[] = [
                    'sourceId' => 'redirection-' . (int) $row->id,
                    'plugin' => 'redirection',
                    'fromPath' => $source,
                    'toPath' => $target,
                    'statusCode' => (int) ($row->action_code ?: 301),
                    'matchType' => ((int) $row->regex === 1 || (string) $row->match_type === 'regex') ? 'regex' : 'exact',
                    'priority' => (int) $row->position,
                    'active' => !in_array((string) $row->status, ['disabled', 'inactive'], true),
                    'title' => (string) ($row->title ?? '')
                ];
            }
        }

        return $redirects;
    }

    private function buildSourceSummary(): array {
        return [
            'theme' => [
                'name' => wp_get_theme()->get('Name'),
                'stylesheet' => get_stylesheet(),
                'template' => get_template(),
                'version' => wp_get_theme()->get('Version')
            ],
            'plugins' => array_values(array_map(static function (string $plugin): string {
                return $plugin;
            }, (array) get_option('active_plugins', []))),
            'assetCount' => count($this->assetManifest),
            'remoteAssetCount' => count($this->remoteAssets),
            'warningCount' => count($this->warnings)
        ];
    }

    private function mediaManifest(): array {
        return array_values(array_filter($this->assetManifest, static function (array $asset): bool {
            return strpos((string) ($asset['mimeType'] ?? ''), 'image/') === 0;
        }));
    }

    private function streamZip(string $tmp): void {
        $filename = 'blogposter-wordpress-site-package-' . gmdate('Ymd-His') . '.zip';
        if (headers_sent()) {
            @unlink($tmp);
            wp_die(esc_html('BP_WP_EXPORT_HEADERS_SENT: Could not stream the package because headers were already sent.'));
        }
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . filesize($tmp));
        readfile($tmp);
        @unlink($tmp);
        exit;
    }

    private function absoluteUrl(string $rawUrl, string $baseUrl): string {
        $rawUrl = html_entity_decode(trim($rawUrl));
        if ($rawUrl === '' || strpos($rawUrl, 'data:') === 0 || strpos($rawUrl, 'mailto:') === 0 || strpos($rawUrl, 'tel:') === 0) {
            return '';
        }
        if (strpos($rawUrl, '//') === 0) {
            $scheme = wp_parse_url(home_url('/'), PHP_URL_SCHEME) ?: 'https';
            return $scheme . ':' . $rawUrl;
        }
        if (preg_match('/^https?:\/\//i', $rawUrl)) {
            return $rawUrl;
        }
        if (strpos($rawUrl, '/') === 0) {
            return home_url($rawUrl);
        }
        $parts = wp_parse_url($baseUrl);
        $basePath = isset($parts['path']) ? preg_replace('/\/[^\/]*$/', '/', $parts['path']) : '/';
        $origin = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? wp_parse_url(home_url('/'), PHP_URL_HOST));
        return $origin . $basePath . $rawUrl;
    }

    private function isLocalUrl(string $url): bool {
        $assetHost = wp_parse_url($url, PHP_URL_HOST);
        $siteHost = wp_parse_url(home_url('/'), PHP_URL_HOST);
        return $assetHost && $siteHost && strtolower($assetHost) === strtolower($siteHost);
    }

    private function guessAssetKind(string $url): string {
        $path = strtolower((string) wp_parse_url($url, PHP_URL_PATH));
        $extension = pathinfo($path, PATHINFO_EXTENSION);
        if ($extension === 'css') {
            return 'styles';
        }
        if ($extension === 'js') {
            return 'scripts';
        }
        if (in_array($extension, ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif'], true)) {
            return 'media';
        }
        if (in_array($extension, ['woff', 'woff2', 'ttf', 'otf', 'eot'], true)) {
            return 'fonts';
        }
        return 'assets';
    }

    private function guessMimeType(string $fileName): string {
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $map = [
            'css' => 'text/css',
            'js' => 'application/javascript',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            'ttf' => 'font/ttf'
        ];
        return $map[$extension] ?? 'application/octet-stream';
    }

    private function safeSlug(string $slug): string {
        $slug = trim($slug, '/');
        $slug = sanitize_title($slug ?: 'home');
        return $slug ?: 'home';
    }

    private function pageSlug(WP_Post $post, int $index): string {
        $path = trim((string) wp_parse_url(get_permalink($post), PHP_URL_PATH), '/');
        if ($path === '') {
            return $index === 0 ? 'home' : 'page-' . ($index + 1);
        }
        return $path;
    }
}

Blogposter_Visual_Exporter::bootstrap();
