const assert = require('assert');
const EventEmitter = require('events');

const themeManager = require('../mother/modules/themeManager');

function baseThemeMeta() {
  return {
    slug: 'default',
    name: 'default',
    version: '',
    developer: '',
    description: '',
    assets: {
      css: '/themes/default/theme.css',
      scss: '/themes/default/theme.scss'
    }
  };
}

async function emitAsync(emitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    emitter.emit(eventName, payload, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

test('theme manager sanitizes theme metadata and asset paths', () => {
  const sanitized = themeManager._internals.sanitizeThemeMeta(baseThemeMeta(), {
    name: ' Default Theme \x00',
    version: '1.2.3',
    developer: 'Theme Team',
    description: 'x'.repeat(600),
    assets: {
      css: '/themes/default/theme.css',
      scss: '/themes/default/theme.scss'
    }
  });

  assert.strictEqual(sanitized.slug, 'default');
  assert.strictEqual(sanitized.name, 'Default Theme');
  assert.strictEqual(sanitized.version, '1.2.3');
  assert.strictEqual(sanitized.developer, 'Theme Team');
  assert.strictEqual(sanitized.description.length, 500);
  assert.strictEqual(sanitized.assets.css, '/themes/default/theme.css');
  assert.strictEqual(sanitized.assets.scss, '/themes/default/theme.scss');

  const overridden = themeManager._internals.sanitizeThemeMeta(baseThemeMeta(), {
    assets: {
      css: '/themes/default/dist/app.min.css',
      scss: '/themes/default/styles/theme.scss'
    }
  });

  assert.strictEqual(overridden.assets.css, '/themes/default/dist/app.min.css');
  assert.strictEqual(overridden.assets.scss, '/themes/default/styles/theme.scss');
});

test('theme manager rejects capability fields and JavaScript assets in theme manifests', () => {
  assert.throws(
    () => themeManager._internals.sanitizeThemeMeta(baseThemeMeta(), {
      slug: 'evil'
    }),
    /field "slug" is not allowed/
  );

  assert.throws(
    () => themeManager._internals.sanitizeThemeMeta(baseThemeMeta(), {
      moduleName: 'themeFeatureModule'
    }),
    /field "moduleName" is not allowed/
  );

  assert.throws(
    () => themeManager._internals.sanitizeThemeMeta(baseThemeMeta(), {
      imported: {
        entrypoints: {
          script: 'theme.js'
        }
      }
    }),
    /theme\.json\.imported\.entrypoints\.script is not allowed/
  );

  assert.throws(
    () => themeManager._internals.sanitizeThemeMeta(baseThemeMeta(), {
      assets: {
        js: '/themes/default/theme.js'
      }
    }),
    /theme asset "js" is not allowed/
  );
});

test('theme manager rejects invalid declared presentation asset paths', () => {
  assert.throws(
    () => themeManager._internals.sanitizeThemeMeta(baseThemeMeta(), {
      assets: {
        css: 'https://evil.test/theme.css'
      }
    }),
    /invalid css asset path/
  );

  assert.throws(
    () => themeManager._internals.sanitizeThemeMeta(baseThemeMeta(), {
      assets: {
        scss: '/themes/other/theme.scss'
      }
    }),
    /invalid scss asset path/
  );
});

test('theme manager rejects unsafe theme slugs before filesystem or settings access', async () => {
  const em = new EventEmitter();
  await themeManager.initialize({ motherEmitter: em, isCore: true, jwt: 't' });

  await assert.rejects(
    emitAsync(em, 'getTheme', {
      jwt: 't',
      moduleName: 'themeManager',
      moduleType: 'core',
      decodedJWT: { permissions: { themes: { list: true } } },
      slug: '../../default'
    }),
    /Invalid theme slug/
  );

  await assert.rejects(
    emitAsync(em, 'activateTheme', {
      jwt: 't',
      moduleName: 'themeManager',
      moduleType: 'core',
      decodedJWT: { permissions: { themes: { activate: true } } },
      slug: 'https://evil.test/default'
    }),
    /Invalid theme slug/
  );
});

test('theme manager ignores unsafe active theme settings', async () => {
  const em = new EventEmitter();
  em.on('getSetting', (payload, cb) => {
    assert.strictEqual(payload.key, 'ACTIVE_THEME');
    cb(null, '../../default');
  });

  await themeManager.initialize({ motherEmitter: em, isCore: true, jwt: 't' });

  const active = await emitAsync(em, 'getActiveTheme', {
    jwt: 't',
    moduleName: 'themeManager',
    moduleType: 'core',
    decodedJWT: { permissions: { themes: { list: true } } }
  });

  assert.strictEqual(active.slug, 'default');
});
