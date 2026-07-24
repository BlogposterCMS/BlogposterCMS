'use strict';

const assert = require('assert');
const EventEmitter = require('events');

const sitePresets = require('../mother/modules/sitePresets');
const service = require('../mother/modules/sitePresets/sitePresetsService');
const colorService = require('../mother/modules/colorLibrary/colorLibraryService');
const fontService = require('../mother/modules/fontPackages/fontPackagesService');

function emitAsync(emitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    emitter.emit(eventName, payload, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function createSettingsEmitter() {
  const emitter = new EventEmitter();
  const settings = new Map();
  emitter.on('getSetting', (payload, callback) => callback(null, settings.get(payload.key) ?? null));
  emitter.on('setSetting', (payload, callback) => {
    settings.set(payload.key, payload.value);
    callback(null, { done: true });
  });
  return { emitter, settings };
}

beforeEach(() => {
  service.resetMutationQueue();
  colorService.resetMutationQueue();
  fontService.resetMutationQueue();
});

test('installed Site Presets use one declarative contract for central defaults and page demos', () => {
  const [preset] = service.listInstalledPresets();
  assert.strictEqual(preset.id, 'site-preset-default');
  assert.strictEqual(preset.source, 'installed');
  assert.strictEqual(preset.colorScheme.colors[0].id, 'default-1');
  assert.strictEqual(Object.keys(preset.fontPackage.roles).length, 14);
  assert.strictEqual(preset.pageDemos[0].elements[0].presetId, 'text.heading');
  assert.strictEqual(JSON.stringify(preset).includes('theme.css'), false);
});

test('Site Preset contract rejects executable fields and unknown central element presets', () => {
  const base = service.listInstalledPresets()[0];
  assert.throws(
    () => service.normalizePresetPackage({ ...base, scripts: ['theme.js'] }),
    /SITE_PRESETS_UNKNOWN_FIELD|SITE_PRESETS_EXECUTABLE_FIELD_FORBIDDEN/
  );
  assert.throws(
    () => service.normalizePresetPackage({
      ...base,
      pageDemos: [{
        id: 'unsafe-demo',
        name: 'Unsafe',
        elements: [{ presetId: 'custom-widget-code' }]
      }]
    }),
    /SITE_PRESETS_UNKNOWN_ELEMENT_PRESET/
  );
});

test('users save the same Site Preset package shape and apply it through central color and font services', async () => {
  const { emitter, settings } = createSettingsEmitter();
  await sitePresets.initialize({ motherEmitter: emitter, isCore: true, jwt: 'internal' });
  const installed = service.listInstalledPresets()[0];

  const created = await emitAsync(emitter, 'sitePresets.create', {
    jwt: 'caller',
    moduleName: 'sitePresets',
    moduleType: 'core',
    decodedJWT: { permissions: { builder: { publish: true } } },
    preset: {
      ...installed,
      id: undefined,
      name: 'User Brand',
      developer: 'User',
      source: undefined
    }
  });
  assert.strictEqual(created.preset.source, 'user');
  assert(created.preset.id.startsWith('user-preset-'));
  assert.deepStrictEqual(
    Object.keys(created.preset).filter(key => key !== 'source'),
    Object.keys(installed).filter(key => key !== 'source')
  );

  const applied = await emitAsync(emitter, 'sitePresets.apply', {
    jwt: 'caller',
    moduleName: 'sitePresets',
    moduleType: 'core',
    decodedJWT: { permissions: { builder: { publish: true } } },
    id: created.preset.id
  });
  assert.strictEqual(applied.applied, true);
  assert.strictEqual(applied.colorScheme.colors[0].id, 'default-1');
  assert.strictEqual(applied.fontPackage.id, 'font-package-default');
  assert.strictEqual(
    settings.get(service.SITE_PRESETS_LAST_APPLIED_KEY),
    created.preset.id
  );
  assert(settings.has(colorService.COLOR_LIBRARY_STORAGE_KEY));
  assert(settings.has(fontService.FONT_PACKAGES_STORAGE_KEY));
});

test('Site Preset events preserve Builder permissions and installed packages are read-only', async () => {
  const { emitter } = createSettingsEmitter();
  await sitePresets.initialize({ motherEmitter: emitter, isCore: true, jwt: 'internal' });

  await assert.rejects(
    emitAsync(emitter, 'sitePresets.list', {
      jwt: 'caller',
      moduleName: 'sitePresets',
      moduleType: 'core',
      decodedJWT: { permissions: {} }
    }),
    /SITE_PRESETS_FORBIDDEN/
  );
  await assert.rejects(
    emitAsync(emitter, 'sitePresets.delete', {
      jwt: 'caller',
      moduleName: 'sitePresets',
      moduleType: 'core',
      decodedJWT: { permissions: { builder: { publish: true } } },
      id: 'site-preset-default'
    }),
    /SITE_PRESETS_INSTALLED_READ_ONLY/
  );
});
