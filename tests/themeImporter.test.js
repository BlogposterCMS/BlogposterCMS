const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

const htmlThemeImporter = require('../mother/modules/importer/importers/htmlTheme');
const wordpressImporter = require('../mother/modules/importer/importers/wordpress');
const wordpressSitePackageImporter = require('../mother/modules/importer/importers/wordpressSitePackage');

const SAMPLE_WXR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
  <channel>
    <title>Example Site</title>
    <link>https://example.test</link>
    <description>Export fixture</description>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:base_site_url>https://example.test</wp:base_site_url>
    <wp:author>
      <wp:author_id>7</wp:author_id>
      <wp:author_login><![CDATA[admin]]></wp:author_login>
      <wp:author_email>admin@example.test</wp:author_email>
      <wp:author_display_name><![CDATA[Admin User]]></wp:author_display_name>
    </wp:author>
    <wp:category>
      <wp:term_id>3</wp:term_id>
      <wp:category_nicename><![CDATA[news]]></wp:category_nicename>
      <wp:cat_name><![CDATA[News]]></wp:cat_name>
    </wp:category>
    <wp:tag>
      <wp:term_id>4</wp:term_id>
      <wp:tag_slug><![CDATA[launch]]></wp:tag_slug>
      <wp:tag_name><![CDATA[Launch]]></wp:tag_name>
    </wp:tag>
    <item>
      <title><![CDATA[Hello Import]]></title>
      <link>https://example.test/hello-import/</link>
      <dc:creator><![CDATA[admin]]></dc:creator>
      <content:encoded><![CDATA[<p>Hello <strong>world</strong>.</p>]]></content:encoded>
      <excerpt:encoded><![CDATA[Short intro]]></excerpt:encoded>
      <wp:post_id>42</wp:post_id>
      <wp:post_date_gmt>2024-01-02 03:04:05</wp:post_date_gmt>
      <wp:post_name><![CDATA[hello-import]]></wp:post_name>
      <wp:status><![CDATA[publish]]></wp:status>
      <wp:post_type><![CDATA[post]]></wp:post_type>
      <category domain="category" nicename="news"><![CDATA[News]]></category>
      <category domain="post_tag" nicename="launch"><![CDATA[Launch]]></category>
      <wp:postmeta>
        <wp:meta_key><![CDATA[_thumbnail_id]]></wp:meta_key>
        <wp:meta_value><![CDATA[55]]></wp:meta_value>
      </wp:postmeta>
      <wp:postmeta>
        <wp:meta_key><![CDATA[_wpml_language]]></wp:meta_key>
        <wp:meta_value><![CDATA[de_DE]]></wp:meta_value>
      </wp:postmeta>
      <wp:postmeta>
        <wp:meta_key><![CDATA[_wpml_trid]]></wp:meta_key>
        <wp:meta_value><![CDATA[group-42]]></wp:meta_value>
      </wp:postmeta>
      <wp:comment>
        <wp:comment_id>99</wp:comment_id>
        <wp:comment_author><![CDATA[Reader]]></wp:comment_author>
        <wp:comment_author_email>reader@example.test</wp:comment_author_email>
        <wp:comment_content><![CDATA[Nice post.]]></wp:comment_content>
        <wp:comment_approved>1</wp:comment_approved>
        <wp:comment_date_gmt>2024-01-03 04:05:06</wp:comment_date_gmt>
      </wp:comment>
    </item>
    <item>
      <title><![CDATA[Hero Image]]></title>
      <guid>https://example.test/wp-content/uploads/hero.png</guid>
      <wp:post_id>55</wp:post_id>
      <wp:post_type><![CDATA[attachment]]></wp:post_type>
      <wp:attachment_url>https://example.test/wp-content/uploads/hero.png</wp:attachment_url>
      <wp:post_mime_type>image/png</wp:post_mime_type>
      <wp:status><![CDATA[inherit]]></wp:status>
    </item>
    <item>
      <title>Old revision</title>
      <wp:post_id>56</wp:post_id>
      <wp:post_type><![CDATA[revision]]></wp:post_type>
    </item>
  </channel>
</rss>`;

function onceWrap(cb) {
  let called = false;
  return (...args) => {
    if (called) return;
    called = true;
    if (typeof cb === 'function') cb(...args);
  };
}

function loadModule(relPath) {
  const base = path.resolve(__dirname, '..', relPath);
  const code = fs.readFileSync(path.join(base, 'index.js'), 'utf8');
  function customRequire(name) {
    if (name === '../../mother/emitters/motherEmitter' || name === '../../emitters/motherEmitter' || name === '../emitters/motherEmitter') {
      return { onceCallback: onceWrap };
    }
    if (name.startsWith('./') || name.startsWith('../')) {
      return require(path.join(base, name));
    }
    return require(name);
  }
  const sandbox = { module: {}, exports: {}, require: customRequire, console };
  sandbox.__dirname = base;
  vm.runInNewContext(code, sandbox, { filename: path.join(relPath, 'index.js') });
  return sandbox.module.exports;
}

async function emitAsync(emitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    emitter.emit(eventName, payload, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

test('wordpress importer builds a WXR dry-run plan', async () => {
  const plan = await wordpressImporter._internals.buildImportPlan({ xml: SAMPLE_WXR });

  assert.strictEqual(plan.site.title, 'Example Site');
  assert.strictEqual(plan.totals.entries, 1);
  assert.strictEqual(plan.totals.attachments, 1);
  assert.strictEqual(plan.totals.comments, 1);
  assert.strictEqual(plan.totals.skipped, 1);
  assert.strictEqual(plan.entries[0].contentType, 'post');
  assert.strictEqual(plan.entries[0].status, 'published');
  assert.strictEqual(plan.totals.legacyWordPressTerms, 2);
  assert.strictEqual(plan.totals.collections, 1);
  assert.strictEqual(plan.legacyWordPressTerms.length, 2);
  assert.strictEqual(plan.collections[0].slug, 'news');
  assert.strictEqual(plan.collections[0].title, 'News');
  assert.deepStrictEqual(plan.collections[0].entrySourceIds, ['42']);
  assert.strictEqual(plan.entries[0].language, 'de-de');
  assert.strictEqual(plan.entries[0].metadata.wordpress.language, 'de-de');
  assert.deepStrictEqual(plan.entries[0].metadata.wordpress.translation, { groupId: 'group-42' });
  assert.strictEqual(plan.entries[0].metadata.wordpress.terms.length, 2);
  assert.strictEqual(plan.attachments[0].mimeType, 'image/png');
});

test('htmlTheme importer plans and installs a static theme safely', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bp-html-theme-'));
  const sourceDir = path.join(tmpRoot, 'source-theme');
  const themeBaseDir = path.join(tmpRoot, 'themes');

  try {
    await fs.promises.mkdir(path.join(sourceDir, 'assets'), { recursive: true });
    await fs.promises.writeFile(path.join(sourceDir, 'index.html'), [
      '<!doctype html>',
      '<html><head>',
      '<title>Landing Theme</title>',
      '<link rel="stylesheet" href="assets/site.css">',
      '</head><body><img src="assets/hero.png"></body></html>'
    ].join(''), 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'assets', 'site.css'), 'body { color: #111; }', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'assets', 'hero.png'), Buffer.from([0, 1, 2, 3]));

    const plan = await htmlThemeImporter._internals.buildImportPlan({ sourceDir });
    assert.strictEqual(plan.installable, true);
    assert.strictEqual(plan.theme.slug, 'landing-theme');
    assert.strictEqual(plan.entrypoints.html, 'index.html');
    assert.strictEqual(plan.entrypoints.css, 'assets/site.css');
    assert.strictEqual(plan.entrypoints.script, undefined);
    assert.deepStrictEqual(plan.policy.blocked, []);
    assert(plan.references.includes('assets/site.css'));
    assert(plan.references.includes('assets/hero.png'));

    const installed = await htmlThemeImporter.import({
      sourceDir,
      themeBaseDir,
      dryRun: false
    });
    assert.strictEqual(installed.success, true);
    assert.strictEqual(installed.installed.slug, 'landing-theme');
    assert.strictEqual(
      fs.existsSync(path.join(themeBaseDir, 'landing-theme', 'theme.json')),
      true
    );
    assert.strictEqual(
      fs.existsSync(path.join(themeBaseDir, 'landing-theme', 'theme.js')),
      false
    );
    assert.strictEqual(
      fs.existsSync(path.join(themeBaseDir, 'landing-theme', 'source', 'index.html')),
      true
    );
    const themeJson = JSON.parse(await fs.promises.readFile(path.join(themeBaseDir, 'landing-theme', 'theme.json'), 'utf8'));
    assert.strictEqual(Object.prototype.hasOwnProperty.call(themeJson, 'slug'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(themeJson.assets || {}, 'js'), false);
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('htmlTheme importer blocks executable theme behavior', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bp-html-theme-blocked-'));
  const sourceDir = path.join(tmpRoot, 'source-theme');
  const themeBaseDir = path.join(tmpRoot, 'themes');

  try {
    await fs.promises.mkdir(path.join(sourceDir, 'assets'), { recursive: true });
    await fs.promises.writeFile(path.join(sourceDir, 'index.html'), [
      '<!doctype html>',
      '<html><head>',
      '<title>Interactive Theme</title>',
      '<link rel="stylesheet" href="assets/site.css">',
      '</head><body onclick="openMenu()"><script src="assets/theme.js"></script></body></html>'
    ].join(''), 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'assets', 'site.css'), '@import url("https://cdn.example.test/theme.css");', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'assets', 'theme.js'), 'fetch("/api/theme-feature");', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'template.php'), '<?php echo "feature"; ?>', 'utf8');

    const plan = await htmlThemeImporter._internals.buildImportPlan({ sourceDir });
    assert.strictEqual(plan.installable, false);
    assert(plan.policy.blocked.some(item => item.includes('THEME_SCRIPT_FILE')));
    assert(plan.policy.blocked.some(item => item.includes('THEME_SCRIPT_TAG')));
    assert(plan.policy.blocked.some(item => item.includes('THEME_INLINE_HANDLER')));
    assert(plan.policy.blocked.some(item => item.includes('THEME_CSS_IMPORT')));
    assert(plan.policy.blocked.some(item => item.includes('THEME_EXECUTABLE_FILE')));

    await assert.rejects(
      htmlThemeImporter.import({
        sourceDir,
        themeBaseDir,
        dryRun: false
      }),
      /Theme import blocked/
    );
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('wordpressSitePackage importer plans and applies rendered site packages', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bp-wp-site-package-'));
  const sourceDir = path.join(tmpRoot, 'package');

  try {
    await fs.promises.mkdir(path.join(sourceDir, 'theme'), { recursive: true });
    await fs.promises.mkdir(path.join(sourceDir, 'pages', 'home'), { recursive: true });
    await fs.promises.mkdir(path.join(sourceDir, 'pages', 'child'), { recursive: true });
    await fs.promises.mkdir(path.join(sourceDir, 'media'), { recursive: true });
    await fs.promises.writeFile(path.join(sourceDir, 'theme', 'global.css'), ':root { --brand: #123456; --text-color: #111111; } body { font-family: Inter, sans-serif; margin: 24px; }', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'pages', 'home', 'rendered.html'), '<main><h1>Hello</h1></main>', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'pages', 'child', 'rendered.html'), '<main><h1>Child</h1></main>', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'pages', 'home', 'page.css'), '.hero { color: var(--brand); }', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'pages', 'home', 'source.json'), JSON.stringify({
      postId: 1,
      postType: 'page',
      language: 'de_DE',
      excerpt: 'Home excerpt',
      publishedAt: '2024-01-02T00:00:00.000Z',
      terms: [{ wpDomain: 'category', sourceId: '3', slug: 'news', name: 'News' }],
      translation: { groupId: 'home-group' },
      seo: { title: 'Home SEO', description: 'Home meta description', canonicalUrl: 'https://example.test/' },
      metaKeys: ['_yoast_wpseo_title'],
      meta: { _yoast_wpseo_title: ['Home SEO'] }
    }, null, 2), 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'pages', 'child', 'source.json'), JSON.stringify({
      postId: 2,
      postType: 'page',
      parentId: 1,
      parentSourceId: 'wp-post-1',
      language: 'de_DE',
      excerpt: 'Child excerpt',
      terms: [{ wpDomain: 'category', sourceId: '3', slug: 'news', name: 'News' }],
      seo: { title: 'Child SEO', description: 'Child meta description', canonicalUrl: 'https://example.test/child/' }
    }, null, 2), 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'media', 'hero.png'), Buffer.from([1, 2, 3, 4]));
    await fs.promises.writeFile(path.join(sourceDir, 'manifest.json'), JSON.stringify({
      format: 'blogposter-wordpress-site-package',
      version: '1.0.0',
      source: {
        platform: 'wordpress',
        siteUrl: 'https://example.test',
        language: 'de_DE'
      },
      theme: {
        name: 'Captured Theme',
        styles: ['theme/global.css']
      },
      pages: [{
        sourceId: 'wp-post-2',
        slug: '/child/',
        title: 'Child',
        url: 'https://example.test/child/',
        status: 'publish',
        rendered: {
          htmlPath: 'pages/child/rendered.html'
        },
        normalized: {
          sourcePath: 'pages/child/source.json'
        },
        mapping: { confidence: 0.45 }
      }, {
        sourceId: 'wp-post-1',
        slug: '/',
        title: 'Home',
        url: 'https://example.test/',
        status: 'publish',
        rendered: {
          htmlPath: 'pages/home/rendered.html',
          styles: ['pages/home/page.css'],
          scripts: ['pages/home/runtime.js']
        },
        normalized: {
          sourcePath: 'pages/home/source.json'
        },
        mapping: { confidence: 0.35 }
      }],
      menus: [{
        id: 5,
        slug: 'main-menu',
        name: 'Main Menu',
        locations: [{ key: 'primary', label: 'Primary Navigation' }],
        items: [{
          id: 50,
          title: 'Home',
          url: '/',
          menuOrder: 0,
          parentId: 0,
          object: 'page',
          objectId: 1
        }, {
          id: 51,
          title: 'Child',
          url: '/child/',
          menuOrder: 1,
          parentId: 50,
          object: 'page',
          objectId: 2
        }]
      }],
      seo: {
        homeTitle: 'Example Site',
        homeDescription: 'Example description',
        permalinkStructure: '/%postname%/'
      },
      redirects: [{
        sourceId: 'redirection-1',
        fromPath: '/old-home',
        toPath: '/',
        statusCode: 301
      }],
      media: [{
        sourceId: 'hero',
        fileName: 'hero.png',
        path: 'media/hero.png',
        mimeType: 'image/png',
        title: 'Hero'
      }]
    }, null, 2), 'utf8');

    const plan = await wordpressSitePackageImporter._internals.buildImportPlan({ sourceDir });
    assert.strictEqual(plan.installable, true);
    assert.strictEqual(plan.package.sourcePlatform, 'wordpress');
    assert.deepStrictEqual(plan.pages.map(page => page.sourceId), ['wp-post-1', 'wp-post-2']);
    assert.strictEqual(plan.totals.pages, 2);
    assert.strictEqual(plan.totals.renderedPages, 2);
    assert.strictEqual(plan.totals.pageScripts, 1);
    assert.strictEqual(plan.totals.themeStyles, 1);
    assert.strictEqual(plan.totals.menus, 1);
    assert.strictEqual(plan.totals.redirects, 1);
    assert.strictEqual(plan.pages[0].wordpress.seo.title, 'Home SEO');
    assert.strictEqual(plan.pages[0].wordpress.translation.groupId, 'home-group');
    assert.strictEqual(plan.pages[0].wordpress.terms[0].slug, 'news');
    assert.strictEqual(plan.pages[1].parentSourceId, 'wp-post-1');
    assert.strictEqual(plan.theme.tokens.cssVariables.brand, '#123456');
    assert.strictEqual(plan.theme.tokens.roles.primary, '#123456');
    assert(plan.styleHints.scannedStyles.includes('theme/global.css'));
    assert.deepStrictEqual(plan.policy.blocked, []);
    assert(plan.warnings.some(warning => warning.includes('blocked behavior')));

    const em = new EventEmitter();
    const calls = [];
    em.on('createMediaAttachment', (payload, cb) => {
      calls.push(['createMediaAttachment', payload.sourceId, payload.storagePath]);
      cb(null, { attachmentId: 11 });
    });
    em.on('createContentEntry', (payload, cb) => {
      calls.push(['createContentEntry', payload.sourceId, payload.slug, payload.meta.blockedScripts.length, payload.parentId || null, payload.excerpt, payload.meta.wordpress?.terms?.length || 0]);
      cb(null, { entryId: payload.sourceId === 'wp-post-1' ? 22 : 23 });
    });
    let nextPageId = 33;
    em.on('createPage', (payload, cb) => {
      calls.push([
        'createPage',
        payload.meta?.sourceId,
        payload.slug,
        payload.language,
        payload.skipContentMirror === true,
        payload.meta?.contentEntryId,
        payload.meta?.designId || null,
        payload.parent_id || null,
        payload.translations?.[0]?.seoTitle,
        payload.meta?.wordpress?.terms?.length || 0
      ]);
      cb(null, { pageId: nextPageId++ });
    });
    em.on('registerNavigationLocation', (payload, cb) => {
      calls.push(['registerNavigationLocation', payload.key, payload.label]);
      cb(null, { id: 41, key: payload.key });
    });
    em.on('upsertNavigationMenu', (payload, cb) => {
      calls.push(['upsertNavigationMenu', payload.key, payload.locationKey]);
      cb(null, { id: 42, key: payload.key });
    });
    em.on('setNavigationMenuItems', (payload, cb) => {
      calls.push(['setNavigationMenuItems', payload.menuId, payload.items.length]);
      cb(null, {
        done: true,
        items: payload.items.map((item, index) => ({
          id: 90 + index,
          meta: item.meta
        }))
      });
    });
    em.on('updateNavigationMenuItem', (payload, cb) => {
      calls.push(['updateNavigationMenuItem', payload.itemId, payload.parentId]);
      cb(null, { id: payload.itemId, parent_id: payload.parentId });
    });
    em.on('setSeoDefaults', (payload, cb) => {
      calls.push(['setSeoDefaults', payload.title, payload.description]);
      cb(null, { id: 7, title: payload.title });
    });
    em.on('upsertSeoMeta', (payload, cb) => {
      calls.push(['upsertSeoMeta', payload.path, payload.canonicalUrl]);
      cb(null, { id: 8, targetKey: payload.path });
    });
    em.on('upsertRedirectRule', (payload, cb) => {
      calls.push(['upsertRedirectRule', payload.fromPath, payload.toPath, payload.statusCode, payload.language]);
      cb(null, { id: 9, fromPath: payload.fromPath });
    });

    const applied = await wordpressSitePackageImporter.import({
      sourceDir,
      dryRun: false,
      motherEmitter: em,
      jwt: 't'
    });
    assert.strictEqual(applied.success, true);
    assert.strictEqual(applied.applied.applied, true);
    assert(calls.some(([eventName]) => eventName === 'createMediaAttachment'));
    assert(calls.some(([eventName, sourceId, slug, blockedCount, parentId, excerpt, termCount]) =>
      eventName === 'createContentEntry' && sourceId === 'wp-post-1' && slug === 'home' && blockedCount === 1 && parentId === null && excerpt === 'Home excerpt' && termCount === 1
    ));
    assert(calls.some(([eventName, sourceId, slug, blockedCount, parentId]) =>
      eventName === 'createContentEntry' && sourceId === 'wp-post-2' && slug === 'child' && blockedCount === 0 && parentId === 22
    ));
    assert(calls.some(([eventName, sourceId, slug, language, skipMirror, entryId, designId, parentId, seoTitle, termCount]) =>
      eventName === 'createPage' &&
      sourceId === 'wp-post-1' &&
      slug === 'home' &&
      language === 'de-de' &&
      skipMirror === true &&
      entryId === 22 &&
      designId === null &&
      parentId === null &&
      seoTitle === 'Home SEO' &&
      termCount === 1
    ));
    assert(calls.some(([eventName, sourceId, slug, language, skipMirror, entryId, designId, parentId, seoTitle]) =>
      eventName === 'createPage' &&
      sourceId === 'wp-post-2' &&
      slug === 'child' &&
      language === 'de-de' &&
      skipMirror === true &&
      entryId === 23 &&
      designId === null &&
      parentId === 33 &&
      seoTitle === 'Child SEO'
    ));
    assert(calls.some(([eventName, key, label]) =>
      eventName === 'registerNavigationLocation' && key === 'primary' && label === 'Primary Navigation'
    ));
    assert(calls.some(([eventName, key, locationKey]) =>
      eventName === 'upsertNavigationMenu' && key === 'wp-main-menu-primary' && locationKey === 'primary'
    ));
    assert(calls.some(([eventName, menuId, count]) =>
      eventName === 'setNavigationMenuItems' && menuId === 42 && count === 2
    ));
    assert(calls.some(([eventName, itemId, parentId]) =>
      eventName === 'updateNavigationMenuItem' && itemId === 91 && parentId === 90
    ));
    assert(calls.some(([eventName, title, description]) =>
      eventName === 'setSeoDefaults' && title === 'Example Site' && description === 'Example description'
    ));
    assert(calls.some(([eventName, pathKey, canonicalUrl]) =>
      eventName === 'upsertSeoMeta' && pathKey === '/' && canonicalUrl === 'https://example.test/'
    ));
    assert(calls.some(([eventName, fromPath, toPath, statusCode, language]) =>
      eventName === 'upsertRedirectRule' && fromPath === '/old-home' && toPath === '/' && statusCode === 301 && language === ''
    ));
    assert.strictEqual(applied.applied.pageEntries.length, 2);
    assert.strictEqual(applied.applied.pageEntries[1].parentPageId, 33);
    assert.strictEqual(applied.applied.navigation.menus[0].nestedItems, 1);
    assert.strictEqual(applied.applied.seo.pages.length, 2);
    assert.strictEqual(applied.applied.redirects.rules.length, 1);
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('wordpressSitePackage importer carries normalized HTML and mapper hints for visual imports', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bp-wp-visual-package-'));
  const sourceDir = path.join(tmpRoot, 'package');

  try {
    await fs.promises.mkdir(path.join(sourceDir, 'pages', 'about'), { recursive: true });
    await fs.promises.mkdir(path.join(sourceDir, 'theme'), { recursive: true });
    await fs.promises.mkdir(path.join(sourceDir, 'assets', 'media'), { recursive: true });
    await fs.promises.mkdir(path.join(sourceDir, 'assets', 'scripts'), { recursive: true });
    await fs.promises.mkdir(path.join(sourceDir, 'assets', 'fonts'), { recursive: true });
    await fs.promises.mkdir(path.join(sourceDir, 'reports'), { recursive: true });
    await fs.promises.writeFile(
      path.join(sourceDir, 'theme', 'global.css'),
      '@font-face { font-family: "Imported Brand"; src: url("../assets/fonts/brand.woff2") format("woff2"); } :root { --brand-primary: #336699; --surface-background: #f8fafc; } body { font-family: "Source Sans", sans-serif; padding: 32px; }',
      'utf8'
    );
    await fs.promises.writeFile(path.join(sourceDir, 'assets', 'media', 'hero.png'), Buffer.from([4, 3, 2, 1]));
    await fs.promises.writeFile(path.join(sourceDir, 'assets', 'scripts', 'swiper.js'), 'window.Swiper = function() {};', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'assets', 'fonts', 'brand.woff2'), Buffer.from([0, 1, 0, 2]));
    await fs.promises.writeFile(
      path.join(sourceDir, 'pages', 'about', 'rendered.html'),
      '<main><section class="swiper" data-aos="fade-up"><h1>About</h1><img src="../../assets/media/hero.png" alt="Hero"><script src="../../assets/scripts/swiper.js"></script></section></main>',
      'utf8'
    );
    await fs.promises.writeFile(
      path.join(sourceDir, 'pages', 'about', 'normalized.html'),
      '<main><section><h1>About</h1><p>Studio-ready copy.</p><img src="../../assets/media/hero.png" alt="Hero"></section></main>',
      'utf8'
    );
    await fs.promises.writeFile(path.join(sourceDir, 'pages', 'about', 'source.json'), JSON.stringify({
      postId: 12,
      builder: 'gutenberg'
    }, null, 2), 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'reports', 'blocked-behavior.json'), JSON.stringify({
      generatedAt: '2026-06-27T00:00:00.000Z',
      remoteAssets: [{ url: 'https://cdn.example.com/theme.js', kind: 'scripts' }],
      warnings: [{
        code: 'BP_WP_EXPORT_RENDER_FALLBACK',
        postId: '12',
        message: 'Frontend capture failed; exported a rendered WordPress content fallback for this post.'
      }]
    }, null, 2), 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'manifest.json'), JSON.stringify({
      format: 'blogposter-wordpress-site-package',
      version: '1.0.0',
      source: {
        language: 'it_IT'
      },
      reports: {
        mappingHints: 'reports/mapping-hints.json',
        blockedBehavior: 'reports/blocked-behavior.json'
      },
      theme: {
        name: 'Visual Theme',
        styles: ['theme/global.css']
      },
      pages: [{
        sourceId: 'wp-post-12',
        slug: 'about',
        title: 'About',
        status: 'publish',
        rendered: {
          htmlPath: 'pages/about/rendered.html',
          scripts: ['assets/scripts/swiper.js'],
          media: ['assets/media/hero.png']
        },
        normalized: {
          htmlPath: 'pages/about/normalized.html',
          sourcePath: 'pages/about/source.json'
        },
        mapping: {
          confidence: 0.74,
          nativeWidgets: ['textBox', 'buttonLink'],
          mapperHints: { headings: 1, buttons: 1 },
          source: { builder: 'gutenberg' },
          fallback: 'normalized-html-with-rendered-js-reference'
        }
      }],
      assets: [{
        sourceId: 'asset-hero',
        fileName: 'hero.png',
        path: 'assets/media/hero.png',
        mimeType: 'image/png',
        kind: 'media'
      }, {
        sourceId: 'asset-swiper',
        fileName: 'swiper.js',
        path: 'assets/scripts/swiper.js',
        mimeType: 'application/javascript',
        kind: 'scripts'
      }, {
        sourceId: 'asset-brand-font',
        fileName: 'brand.woff2',
        path: 'assets/fonts/brand.woff2',
        mimeType: 'font/woff2',
        kind: 'fonts'
      }]
    }, null, 2), 'utf8');

    const plan = await wordpressSitePackageImporter._internals.buildImportPlan({ sourceDir });
    assert.strictEqual(plan.totals.normalizedPages, 1);
    assert.strictEqual(plan.totals.nativeWidgetHints, 2);
    assert.strictEqual(plan.totals.assets, 3);
    assert.strictEqual(plan.totals.fonts, 1);
    assert.strictEqual(plan.pages[0].hasNormalizedHtml, true);
    assert.strictEqual(plan.pages[0].normalizedHtmlPath, 'pages/about/normalized.html');
    assert.strictEqual(plan.pages[0].sourcePath, 'pages/about/source.json');
    assert.strictEqual(plan.pages[0].wordpress.postId, '12');
    assert.strictEqual(plan.pages[0].mapping.source.builder, 'gutenberg');
    assert.deepStrictEqual(plan.pages[0].mapping.nativeWidgets, ['textBox', 'buttonLink']);
    assert.strictEqual(plan.pages[0].mapping.mapperHints.headings, 1);
    assert.strictEqual(plan.reports.mappingHints, 'reports/mapping-hints.json');
    assert.strictEqual(plan.reports.exporterWarnings[0].code, 'BP_WP_EXPORT_RENDER_FALLBACK');
    assert.strictEqual(plan.reports.remoteAssets[0].url, 'https://cdn.example.com/theme.js');
    assert(plan.warnings.some(warning => warning.includes('BP_WP_EXPORT_RENDER_FALLBACK')));
    assert(plan.warnings.some(warning => warning.includes('remote asset')));
    assert.strictEqual(plan.styleHints.tokens.cssVariables['brand-primary'], '#336699');
    assert.strictEqual(plan.styleHints.tokens.roles.primary, '#336699');

    const em = new EventEmitter();
    let createdPayload = null;
    let createdPagePayload = null;
    let savedDesignPayload = null;
    const uploadedAssets = [];
    em.on('uploadFileToFolder', (payload, cb) => {
      uploadedAssets.push(payload);
      cb(null, { success: true, fileName: payload.fileName, mimeType: 'application/octet-stream' });
    });
    em.on('makeFilePublic', (payload, cb) => {
      cb(null, { success: true, shareLink: `/share/${path.basename(payload.filePath)}` });
    });
    em.on('createContentEntry', (payload, cb) => {
      createdPayload = payload;
      cb(null, { entryId: 77 });
    });
    em.on('designer.saveDesign', (payload, cb) => {
      savedDesignPayload = payload;
      cb(null, { id: 'design-77', version: 1 });
    });
    em.on('createPage', (payload, cb) => {
      createdPagePayload = payload;
      cb(null, { pageId: 88 });
    });

    const applied = await wordpressSitePackageImporter.import({
      sourceDir,
      dryRun: false,
      motherEmitter: em,
      jwt: 't'
    });
    assert.strictEqual(applied.success, true);
    assert(createdPayload);
    assert(uploadedAssets.some(payload => payload.fileName.includes('hero.png')));
    assert(uploadedAssets.some(payload => payload.fileName.includes('brand.woff2')));
    assert.strictEqual(createdPayload.content.importMode, 'wordpress-visual-package');
    assert(createdPayload.content.html.includes('/share/'));
    assert(createdPayload.content.html.includes('<script src="/share/'));
    assert(createdPayload.content.normalizedHtml.includes('Studio-ready copy'));
    assert(createdPayload.content.normalizedHtml.includes('/share/'));
    assert.strictEqual(createdPayload.content.styleHints.tokens.roles.primary, '#336699');
    assert.strictEqual(createdPayload.content.behaviorHints.summary.nativeCandidates >= 2, true);
    assert(createdPayload.content.behaviorHints.behaviors.some(item => item.type === 'swiper'));
    assert(createdPayload.content.behaviorHints.behaviors.some(item => item.type === 'animation'));
    assert.deepStrictEqual(createdPayload.content.nativeWidgets, ['textBox', 'buttonLink']);
    assert.strictEqual(createdPayload.content.designerDraft.source, 'wordpress-visual-mapper');
    assert.strictEqual(createdPayload.content.designerDraft.styleHints.tokens.roles.primary, '#336699');
    assert(createdPayload.content.designerDraft.behaviorHints.behaviors.some(item => item.rebuildAs === 'scene-effects'));
    assert.strictEqual(createdPayload.content.designerDraft.widgets[0].widgetId, 'textBox');
    assert.strictEqual(createdPayload.content.designerDraft.widgets[0].code.meta.source, 'wordpress-visual-mapper');
    assert(createdPayload.content.designerDraft.widgets.some(widget =>
      widget.widgetId === 'mediaBlock' && widget.code.html.includes('/share/')
    ));
    assert.strictEqual(createdPayload.meta.normalizedHtmlPath, 'pages/about/normalized.html');
    assert.strictEqual(createdPayload.meta.sourcePath, 'pages/about/source.json');
    assert(createdPayload.meta.blockedScripts[0].includes('/share/'));
    assert(createdPayload.meta.importedAssets.some(asset =>
      asset.path === 'assets/fonts/brand.woff2' && asset.publicUrl.includes('/share/') && asset.kind === 'fonts'
    ));
    assert(createdPayload.meta.behaviorHints.behaviors.some(item => item.type === 'swiper'));
    assert.strictEqual(createdPayload.meta.designerDraft.summary.nativeWidgets, 3);
    assert(savedDesignPayload);
    assert.strictEqual(savedDesignPayload.design.isDraft, true);
    assert.strictEqual(savedDesignPayload.widgets[0].widgetId, 'textBox');
    assert(savedDesignPayload.widgets.some(widget => widget.widgetId === 'mediaBlock'));
    assert(createdPagePayload);
    assert.strictEqual(createdPagePayload.slug, 'about');
    assert.strictEqual(createdPagePayload.language, 'it-it');
    assert.strictEqual(createdPagePayload.skipContentMirror, true);
    assert.strictEqual(createdPagePayload.meta.designId, 'design-77');
    assert.strictEqual(createdPagePayload.meta.contentEntryId, 77);
    assert(createdPagePayload.translations[0].html.includes('Studio-ready copy'));
    assert.strictEqual(applied.applied.pages[0].designerDraft.result.id, 'design-77');
    assert.strictEqual(applied.applied.pageEntries[0].pageId, 88);
    assert.strictEqual(applied.applied.assetUrlMap['assets/media/hero.png'].includes('/share/'), true);
    assert.strictEqual(applied.applied.assetUrlMap['assets/fonts/brand.woff2'].includes('/share/'), true);
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('wordpressSitePackage importer blocks theme scripts before applying', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bp-wp-site-package-blocked-'));
  const sourceDir = path.join(tmpRoot, 'package');

  try {
    await fs.promises.mkdir(path.join(sourceDir, 'theme'), { recursive: true });
    await fs.promises.writeFile(path.join(sourceDir, 'theme', 'global.css'), 'body { color: #111; }', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'theme', 'theme.js'), 'window.themeFeature = true;', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'manifest.json'), JSON.stringify({
      format: 'blogposter-wordpress-site-package',
      version: '1.0.0',
      theme: {
        styles: ['theme/global.css'],
        scripts: ['theme/theme.js']
      },
      pages: []
    }, null, 2), 'utf8');

    const plan = await wordpressSitePackageImporter._internals.buildImportPlan({ sourceDir });
    assert.strictEqual(plan.installable, false);
    assert(plan.policy.blocked.some(item => item.includes('THEME_SCRIPT_ASSET')));

    await assert.rejects(
      wordpressSitePackageImporter.import({
        sourceDir,
        dryRun: false,
        motherEmitter: new EventEmitter(),
        jwt: 't'
      }),
      /WordPress site package import blocked/
    );
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('importer module lists, dry-runs and applies WordPress imports through core events', async () => {
  const imp = loadModule('mother/modules/importer');
  const em = new EventEmitter();
  await imp.initialize({ motherEmitter: em, isCore: true, jwt: 't' });

  const listed = await emitAsync(em, 'listImporters', {
    jwt: 't',
    moduleName: 'importer',
    moduleType: 'core',
    decodedJWT: { permissions: { importers: { list: true } } }
  });
  assert(listed.includes('wordpress'));
  assert(listed.includes('wordpressSitePackage'));

  await new Promise(resolve => {
    em.emit('listImporters', {
      jwt: 't',
      moduleName: 'importer',
      moduleType: 'core',
      decodedJWT: { permissions: {} }
    }, err => {
      assert(err);
      resolve();
    });
  });

  const dryRun = await emitAsync(em, 'runImport', {
    jwt: 't',
    moduleName: 'importer',
    moduleType: 'core',
    importerName: 'wordpress',
    decodedJWT: { permissions: { importers: { run: true } } },
    options: { xml: SAMPLE_WXR }
  });
  assert.strictEqual(dryRun.success, true);
  assert.strictEqual(dryRun.dryRun, true);
  assert.strictEqual(dryRun.plan.totals.entries, 1);

  const calls = [];
  let entryPayload = null;
  em.on('registerContentType', (payload, cb) => {
    calls.push(['registerContentType', payload.key]);
    cb(null, { key: payload.key });
  });
  em.on('createMediaAttachment', (payload, cb) => {
    calls.push(['createMediaAttachment', payload.sourceId]);
    cb(null, { attachmentId: 55 });
  });
  em.on('createPage', (payload, cb) => {
    calls.push([
      'createPage',
      payload.title,
      payload.slug,
      payload.parent_id || null,
      payload.meta?.isCollection === true,
      payload.is_content === true,
      payload.skipContentMirror === true,
      payload.language,
      payload.translations?.[0]?.language
    ]);
    cb(null, { pageId: `page-${String(payload.slug).replace(/[^a-z0-9]+/gi, '-')}` });
  });
  em.on('createContentEntry', (payload, cb) => {
    entryPayload = payload;
    calls.push(['createContentEntry', payload.sourceId]);
    cb(null, { entryId: 42 });
  });
  em.on('createComment', (payload, cb) => {
    calls.push(['createComment', payload.meta.sourceId]);
    cb(null, { commentId: 99 });
  });

  const applied = await emitAsync(em, 'runImport', {
    jwt: 't',
    moduleName: 'importer',
    moduleType: 'core',
    importerName: 'wordpress',
    decodedJWT: { permissions: { importers: { run: true } } },
    options: { xml: SAMPLE_WXR, dryRun: false }
  });

  assert.strictEqual(applied.success, true);
  assert.strictEqual(applied.applied.applied, true);
  assert(calls.some(([eventName]) => eventName === 'createContentEntry'));
  assert(calls.some(([eventName]) => eventName === 'createComment'));
  assert(calls.some(([eventName]) => eventName === 'createMediaAttachment'));
  assert(calls.some(call =>
    call[0] === 'createPage' &&
    call[1] === 'News' &&
    call[2] === 'news' &&
    call[3] === null &&
    call[4] === true &&
    call[5] === false &&
    call[6] === true &&
    call[7] === 'en' &&
    call[8] === 'en'
  ));
  assert(calls.some(call =>
    call[0] === 'createPage' &&
    call[1] === 'Hello Import' &&
    call[2] === 'news/hello-import' &&
    call[3] === 'page-news' &&
    call[4] === false &&
    call[5] === true &&
    call[6] === true &&
    call[7] === 'de-de' &&
    call[8] === 'de-de'
  ));
  assert.strictEqual(applied.applied.collections.length, 1);
  assert.strictEqual(applied.applied.pageEntries.length, 1);
  assert.strictEqual(calls.some(([eventName]) => eventName === 'registerContentTaxonomy'), false);
  assert.strictEqual(calls.some(([eventName]) => eventName === 'upsertContentTerm'), false);
  assert.strictEqual(calls.some(([eventName]) => eventName === 'assignContentTerm'), false);
  assert.strictEqual(entryPayload.meta.wordpress.terms.length, 2);
  assert.strictEqual(entryPayload.language, 'de-de');
  assert.strictEqual(entryPayload.meta.wordpress.language, 'de-de');
  assert.strictEqual(entryPayload.meta.blogposter.primaryCollection.slug, 'news');
});

test('theme manager lists themes with permission checks', async () => {
  const themeManager = loadModule('mother/modules/themeManager');
  const em = new EventEmitter();
  let activeTheme = 'default';
  let settingPayload = null;

  em.on('getSetting', (payload, cb) => {
    assert.strictEqual(payload.moduleName, 'settingsManager');
    assert.strictEqual(payload.key, 'ACTIVE_THEME');
    cb(null, activeTheme);
  });
  em.on('setSetting', (payload, cb) => {
    settingPayload = payload;
    activeTheme = payload.value;
    cb(null, { done: true });
  });

  await themeManager.initialize({ motherEmitter: em, isCore: true, jwt: 't' });

  const themes = await emitAsync(em, 'listThemes', {
    jwt: 't',
    moduleName: 'themeManager',
    moduleType: 'core',
    decodedJWT: { permissions: { themes: { list: true } } }
  });
  assert(Array.isArray(themes));

  const theme = await emitAsync(em, 'getTheme', {
    jwt: 't',
    moduleName: 'themeManager',
    moduleType: 'core',
    decodedJWT: { permissions: { themes: { list: true } } },
    slug: 'default'
  });
  assert.strictEqual(theme.slug, 'default');
  assert.strictEqual(theme.assets.css, '/themes/default/theme.css');

  const current = await emitAsync(em, 'getActiveTheme', {
    jwt: 't',
    moduleName: 'themeManager',
    moduleType: 'core',
    decodedJWT: { permissions: { themes: { list: true } } }
  });
  assert.strictEqual(current.slug, 'default');

  const activated = await emitAsync(em, 'activateTheme', {
    jwt: 't',
    moduleName: 'themeManager',
    moduleType: 'core',
    decodedJWT: { permissions: { themes: { activate: true } } },
    slug: 'default'
  });
  assert.strictEqual(activated.done, true);
  assert.strictEqual(activated.theme.slug, 'default');
  assert.strictEqual(settingPayload.moduleName, 'settingsManager');
  assert.strictEqual(settingPayload.key, 'ACTIVE_THEME');
  assert.strictEqual(settingPayload.value, 'default');

  await new Promise(resolve => {
    em.emit('listThemes', {
      jwt: 't',
      moduleName: 'themeManager',
      moduleType: 'core',
      decodedJWT: { permissions: {} }
    }, err => {
      assert(err);
      resolve();
    });
  });
});

test('importer module rejects missing core JWT payload', async () => {
  const imp = loadModule('mother/modules/importer');
  const em = new EventEmitter();
  await imp.initialize({ motherEmitter: em, isCore: true, jwt: 't' });

  await new Promise(resolve => {
    em.emit('runImport', { importerName: 'wordpress', moduleName: 'importer', moduleType: 'core' }, err => {
      assert(err);
      resolve();
    });
  });
});

test('importer module rejects operational option overrides from runImport', async () => {
  const imp = loadModule('mother/modules/importer');
  const em = new EventEmitter();
  await imp.initialize({ motherEmitter: em, isCore: true, jwt: 't' });

  await new Promise(resolve => {
    em.emit('runImport', {
      jwt: 't',
      moduleName: 'importer',
      moduleType: 'core',
      importerName: 'htmlTheme',
      decodedJWT: { permissions: { importers: { run: true } } },
      options: {
        sourceDir: path.join(os.tmpdir(), 'theme-source'),
        themeBaseDir: path.join(os.tmpdir(), 'outside-themes')
      }
    }, err => {
      assert(err);
      assert.match(err.message, /cannot override themeBaseDir/);
      resolve();
    });
  });
});

test('importer module only reads local import files from staging roots', async () => {
  const imp = loadModule('mother/modules/importer');
  const em = new EventEmitter();
  const outsideRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bp-import-outside-'));
  const stagingRoot = path.join(__dirname, '..', 'temp_uploads', 'imports', `test-${Date.now()}`);

  try {
    await imp.initialize({ motherEmitter: em, isCore: true, jwt: 't' });

    const outsideFile = path.join(outsideRoot, 'wordpress.xml');
    await fs.promises.writeFile(outsideFile, SAMPLE_WXR, 'utf8');

    await new Promise(resolve => {
      em.emit('runImport', {
        jwt: 't',
        moduleName: 'importer',
        moduleType: 'core',
        importerName: 'wordpress',
        decodedJWT: { permissions: { importers: { run: true } } },
        options: { filePath: outsideFile }
      }, err => {
        assert(err);
        assert.match(err.message, /inside an import staging root/);
        resolve();
      });
    });

    await fs.promises.mkdir(stagingRoot, { recursive: true });
    const stagedFile = path.join(stagingRoot, 'wordpress.xml');
    await fs.promises.writeFile(stagedFile, SAMPLE_WXR, 'utf8');

    const staged = await emitAsync(em, 'runImport', {
      jwt: 't',
      moduleName: 'importer',
      moduleType: 'core',
      importerName: 'wordpress',
      decodedJWT: { permissions: { importers: { run: true } } },
      options: { filePath: stagedFile }
    });
    assert.strictEqual(staged.success, true);
    assert.strictEqual(staged.plan.totals.entries, 1);
  } finally {
    await fs.promises.rm(outsideRoot, { recursive: true, force: true });
    await fs.promises.rm(stagingRoot, { recursive: true, force: true });
  }
});
