const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSetupFunction(getPageBySlugLocal) {
  const base = path.resolve(__dirname, '../mother/modules/pagesManager');
  const code = fs.readFileSync(path.join(base, 'index.js'), 'utf8');

  function customRequire(name) {
    if (name === 'dotenv') return { config: () => {} };
    if (name === './pagesService') {
      return {
        ensurePagesManagerDatabase: async () => {},
        ensurePageSchemaAndTable: async () => {},
        getPageBySlugLocal,
      };
    }
    if (name === '../../emitters/motherEmitter') {
      return {
        onceCallback: cb => {
          let called = false;
          return (...args) => {
            if (called) return;
            called = true;
            if (typeof cb === 'function') cb(...args);
          };
        },
      };
    }
    if (name === '../userManagement/permissionUtils') {
      return { hasPermission: () => true };
    }
    return require(path.join(base, name));
  }

  const sandbox = {
    module: {},
    exports: {},
    require: customRequire,
    console,
    setTimeout,
    clearTimeout,
    process,
  };
  vm.runInNewContext(code, sandbox, { filename: 'pagesManager/index.js' });
  return sandbox.setupPagesManagerEvents;
}

function emitCreate(setup, emitter, payload = {}) {
  setup(emitter);
  return new Promise(resolve => {
    emitter.emit(
      'createPage',
      {
        jwt: 't',
        moduleName: 'pagesManager',
        moduleType: 'core',
        title: 'About',
        slug: 'about',
        lane: 'public',
        ...payload,
      },
      (err, res) => resolve({ err, res })
    );
  });
}

test('createPage returns DUPLICATE_SLUG without auto suffixing', async () => {
  const setup = loadSetupFunction(async () => ({ id: 1, slug: 'about' }));
  const emitter = new EventEmitter();
  let dbUpdates = 0;
  emitter.on('dbUpdate', () => {
    dbUpdates += 1;
  });

  const { err } = await emitCreate(setup, emitter);

  assert.strictEqual(err.code, 'DUPLICATE_SLUG');
  assert.strictEqual(err.userMessage, 'A page with this slug already exists in this lane.');
  assert.strictEqual(err.details.slug, 'about');
  assert.strictEqual(err.details.lane, 'public');
  assert.strictEqual(dbUpdates, 0);
});

test('createPage auto-suffixes only when autoSuffixSlug is true', async () => {
  const checkedSlugs = [];
  const setup = loadSetupFunction(async (_emitter, _jwt, slug) => {
    checkedSlugs.push(slug);
    return slug === 'about' ? { id: 1, slug } : null;
  });
  const emitter = new EventEmitter();
  let insertedSlug;

  emitter.on('dbUpdate', (payload, cb) => {
    insertedSlug = payload.data.params.slug;
    cb(null, { insertedId: 7 });
  });

  const { err, res } = await emitCreate(setup, emitter, { autoSuffixSlug: true });

  assert.ifError(err);
  assert.strictEqual(res.pageId, 7);
  assert.deepStrictEqual(checkedSlugs, ['about', 'about-1']);
  assert.strictEqual(insertedSlug, 'about-1');
});

test('createPage maps database unique violations to DUPLICATE_SLUG', async () => {
  const setup = loadSetupFunction(async () => null);
  const emitter = new EventEmitter();

  emitter.on('dbUpdate', (_payload, cb) => {
    const err = new Error('duplicate key value violates unique constraint');
    err.code = '23505';
    cb(err);
  });

  const { err } = await emitCreate(setup, emitter);

  assert.strictEqual(err.code, 'DUPLICATE_SLUG');
});

test('createPage can skip Content Engine mirroring for importer page projections', async () => {
  const setup = loadSetupFunction(async () => null);
  const emitter = new EventEmitter();
  let mirrored = false;

  emitter.on('dbUpdate', (_payload, cb) => {
    cb(null, { insertedId: 9 });
  });
  emitter.on('getContentEntryBySource', (_payload, cb) => {
    cb(null, null);
  });
  emitter.on('createContentEntry', (_payload, cb) => {
    mirrored = true;
    cb(null, { entryId: 99 });
  });

  const { err, res } = await emitCreate(setup, emitter, { skipContentMirror: true });

  assert.ifError(err);
  assert.strictEqual(res.pageId, 9);
  assert.strictEqual(mirrored, false);
});
