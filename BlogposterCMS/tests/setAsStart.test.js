const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function loadSetupFunction() {
  const base = path.resolve(__dirname, '../mother/modules/pagesManager');
  const code = fs.readFileSync(path.join(base, 'index.js'), 'utf8');
  function customRequire(name) {
    if (name === 'dotenv') return { config: () => {} };
    if (name.startsWith('./') || name.startsWith('../')) {
      if (name === './pagesService') {
        return {};
      }
      if (name === '../../emitters/motherEmitter') {
        return { onceCallback: cb => {
          let called = false;
          return (...args) => {
            if (called) return;
            called = true;
            if (typeof cb === 'function') cb(...args);
          };
        } };
      }
      return require(path.join(base, name));
    }
    return require(name);
  }
  const sandbox = {
    module: {},
    exports: {},
    require: customRequire,
    console,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(code, sandbox, { filename: 'pagesManager/index.js' });
  return sandbox.setupPagesManagerEvents;
}

async function testSetAsStartLanguage() {
  const setup = loadSetupFunction();
  const emitter = new EventEmitter();
  const pages = {
    1: { id: 1, language: 'de', status: 'published', is_start: false },
    2: { id: 2, language: 'de', status: 'published', is_start: true },
    3: { id: 3, language: 'en', status: 'published', is_start: true }
  };
  let lastUpdate = null;

  emitter.on('dbSelect', (payload, cb) => {
    if (payload.data?.rawSQL === 'GET_PAGE_BY_ID') {
      const pageId = payload.data[0];
      return cb(null, pages[pageId] || null);
    }
    cb(null, null);
  });

  emitter.on('dbUpdate', (payload, cb) => {
    lastUpdate = payload;
    if (payload.data.rawSQL === 'SET_AS_START') {
      const { pageId, language } = payload.data.params[0];
      for (const p of Object.values(pages)) {
        if (p.language === language) p.is_start = false;
      }
      if (pages[pageId]) {
        pages[pageId].is_start = true;
        pages[pageId].language = language;
      }
    }
    cb(null, { ok: true });
  });

  setup(emitter);

  await new Promise((resolve, reject) => {
    emitter.emit('setAsStart', {
      jwt: 't',
      moduleName: 'pagesManager',
      moduleType: 'core',
      pageId: 1
    }, err => err ? reject(err) : resolve());
  });

  assert.strictEqual(lastUpdate.data.params[0].language, 'de');
  assert.strictEqual(pages[1].is_start, true);
  assert.strictEqual(pages[2].is_start, false);
  assert.strictEqual(pages[3].is_start, true);
}

test('setAsStart updates language specific start page', async () => {
  await testSetAsStartLanguage();
});

