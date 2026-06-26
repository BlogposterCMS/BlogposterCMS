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
  assert.strictEqual(plan.legacyWordPressTerms.length, 2);
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
    await fs.promises.mkdir(path.join(sourceDir, 'media'), { recursive: true });
    await fs.promises.writeFile(path.join(sourceDir, 'theme', 'global.css'), ':root { --brand: #123456; }', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'pages', 'home', 'rendered.html'), '<main><h1>Hello</h1></main>', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'pages', 'home', 'page.css'), '.hero { color: var(--brand); }', 'utf8');
    await fs.promises.writeFile(path.join(sourceDir, 'media', 'hero.png'), Buffer.from([1, 2, 3, 4]));
    await fs.promises.writeFile(path.join(sourceDir, 'manifest.json'), JSON.stringify({
      format: 'blogposter-wordpress-site-package',
      version: '1.0.0',
      source: {
        platform: 'wordpress',
        siteUrl: 'https://example.test'
      },
      theme: {
        name: 'Captured Theme',
        styles: ['theme/global.css']
      },
      pages: [{
        sourceId: 'front-page',
        slug: '/',
        title: 'Home',
        status: 'publish',
        rendered: {
          htmlPath: 'pages/home/rendered.html',
          styles: ['pages/home/page.css'],
          scripts: ['pages/home/runtime.js']
        },
        mapping: { confidence: 0.35 }
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
    assert.strictEqual(plan.totals.pages, 1);
    assert.strictEqual(plan.totals.renderedPages, 1);
    assert.strictEqual(plan.totals.pageScripts, 1);
    assert.strictEqual(plan.totals.themeStyles, 1);
    assert.deepStrictEqual(plan.policy.blocked, []);
    assert(plan.warnings.some(warning => warning.includes('blocked behavior')));

    const em = new EventEmitter();
    const calls = [];
    em.on('createMediaAttachment', (payload, cb) => {
      calls.push(['createMediaAttachment', payload.sourceId, payload.storagePath]);
      cb(null, { attachmentId: 11 });
    });
    em.on('createContentEntry', (payload, cb) => {
      calls.push(['createContentEntry', payload.sourceId, payload.slug, payload.meta.blockedScripts.length]);
      cb(null, { entryId: 22 });
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
    assert(calls.some(([eventName, sourceId, slug, blockedCount]) =>
      eventName === 'createContentEntry' && sourceId === 'front-page' && slug === 'home' && blockedCount === 1
    ));
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
  assert.strictEqual(calls.some(([eventName]) => eventName === 'registerContentTaxonomy'), false);
  assert.strictEqual(calls.some(([eventName]) => eventName === 'upsertContentTerm'), false);
  assert.strictEqual(calls.some(([eventName]) => eventName === 'assignContentTerm'), false);
  assert.strictEqual(entryPayload.meta.wordpress.terms.length, 2);
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
