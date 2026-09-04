'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const fontsManager = require('../mother/modules/fontsManager');
const { requestBackendEvent } = require('../mother/contracts/backendEventContracts');
const { BACKEND_EVENTS } = require('../mother/contracts/generatedBackendEventCatalog');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

function initializeFontsManagerForTest() {
  process.env.FONTS_MODULE_INTERNAL_SECRET = 'test-fonts-secret';
  delete global.fontProviders;
  delete global.fontsList;
  const emitter = new EventEmitter();
  fontsManager.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'fonts-manager-token'
  });
  return emitter;
}

afterEach(() => {
  delete global.fontProviders;
  delete global.fontsList;
});

test('fontsManager rejects unscoped or tokenless caller payloads', async () => {
  const emitter = initializeFontsManagerForTest();
  const wrongScope = {
    jwt: 'other-core-token',
    moduleName: 'pagesManager',
    moduleType: 'core',
    providerName: 'googleFonts',
    enabled: true,
    fontsModuleSecret: 'test-fonts-secret',
    initFunction: () => {},
    name: 'Boundary Font',
    url: 'https://fonts.example.test/boundary.css'
  };

  for (const eventName of ['listFontProviders', 'setFontProviderEnabled', 'registerFontProvider', 'listFonts', 'addFont']) {
    const result = await emitAsync(emitter, eventName, wrongScope);
    assert(result.err, `${eventName} should reject wrong module scope`);
    assert.match(result.err.message, /invalid payload/i);
  }

  const tokenlessToggle = await emitAsync(emitter, 'setFontProviderEnabled', {
    moduleName: 'fontsManager',
    moduleType: 'core',
    providerName: 'googleFonts',
    enabled: true
  });
  assert(tokenlessToggle.err);
  assert.match(tokenlessToggle.err.message, /invalid payload/i);
});

test('fontsManager accepts scoped core provider and font mutations', async () => {
  const emitter = initializeFontsManagerForTest();
  let providerInitialized = false;
  const base = {
    jwt: 'fonts-manager-token',
    moduleName: 'fontsManager',
    moduleType: 'core'
  };

  const initFunction = () => {
    providerInitialized = true;
  };
  const registered = await requestBackendEvent(emitter, BACKEND_EVENTS.REGISTER_FONT_PROVIDER, {
    ...base,
    fontsModuleSecret: 'test-fonts-secret',
    providerName: 'codexFonts',
    description: 'Boundary test provider',
    initFunction
  });
  assert.strictEqual(registered, true);
  assert.strictEqual(global.fontProviders.codexFonts.initFunction, initFunction);

  const enabled = await emitAsync(emitter, 'setFontProviderEnabled', {
    ...base,
    providerName: 'codexFonts',
    enabled: true
  });
  assert.ifError(enabled.err);
  assert.deepStrictEqual(enabled.result, { success: true });
  assert.strictEqual(providerInitialized, true);

  const added = await emitAsync(emitter, 'addFont', {
    ...base,
    name: 'Codex Boundary Font',
    url: 'https://fonts.example.test/codex-boundary.css',
    provider: 'codexFonts'
  });
  assert.ifError(added.err);
  assert.deepStrictEqual(added.result, { success: true });

  const listed = await emitAsync(emitter, 'listFonts', base);
  assert.ifError(listed.err);
  assert(listed.result.some(font => font.name === 'Codex Boundary Font'));
});
