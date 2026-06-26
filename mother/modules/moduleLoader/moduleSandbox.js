const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SERVICE_ENV_KEYS = Object.freeze({
  openai: ['OPENAI_API_KEY'],
  grok: ['GROK_API_KEY'],
  xai: ['XAI_API_KEY'],
  brave: ['BRAVE_API_KEY'],
  news: ['NEWS_MODEL']
});

const SANDBOX_SOURCE_BLOCKLIST = Object.freeze([
  {
    pattern: /\beval\s*\(/,
    message: 'eval() is not available in community modules.'
  },
  {
    pattern: /\bFunction\s*\(/,
    message: 'Function constructor is not available in community modules.'
  },
  {
    pattern: /(?:^|[^\w$])constructor\s*(?:\.|\[\s*['"`])\s*constructor\b/,
    message: 'constructor.constructor escape patterns are not available in community modules.'
  },
  {
    pattern: /\[\s*['"`]constructor['"`]\s*\]\s*(?:\.|\[\s*['"`])\s*constructor\b/,
    message: 'constructor.constructor escape patterns are not available in community modules.'
  },
  {
    pattern: /\bimport\s*\(/,
    message: 'dynamic import() is not available in community modules.'
  },
  {
    pattern: /\bWebAssembly\b/,
    message: 'WebAssembly is not available in community modules.'
  }
]);

function defineHiddenValue(target, key, value) {
  try {
    Object.defineProperty(target, key, {
      value,
      enumerable: false,
      configurable: false,
      writable: false
    });
  } catch {
    // Some host objects have locked-down descriptors already.
  }
}

function hardenSandboxFunction(fn) {
  if (typeof fn !== 'function') return fn;

  defineHiddenValue(fn, 'constructor', undefined);
  if (Object.prototype.hasOwnProperty.call(fn, 'prototype') && fn.prototype && typeof fn.prototype === 'object') {
    defineHiddenValue(fn.prototype, 'constructor', undefined);
    try {
      Object.setPrototypeOf(fn.prototype, null);
    } catch {
      // Ignore non-extensible function prototypes.
    }
    try {
      Object.freeze(fn.prototype);
    } catch {
      // Ignore host functions that cannot be frozen.
    }
  }

  try {
    Object.setPrototypeOf(fn, null);
  } catch {
    // Ignore host functions that do not allow prototype changes.
  }
  try {
    Object.freeze(fn);
  } catch {
    // Ignore host functions that cannot be frozen.
  }
  return fn;
}

function createSandboxFunction(fn) {
  return hardenSandboxFunction(function sandboxFacade(...args) {
    return fn.apply(this, args);
  });
}

function createMutableSandboxObject(entries = {}) {
  const obj = Object.create(null);
  for (const [key, value] of Object.entries(entries)) {
    obj[key] = value;
  }
  return obj;
}

function createSandboxObject(entries = {}) {
  return Object.freeze(createMutableSandboxObject(entries));
}

function createSandboxArray(values = []) {
  const arr = values.slice();
  try {
    Object.setPrototypeOf(arr, null);
  } catch {
    // Ignore arrays that cannot be re-prototyped.
  }
  return Object.freeze(arr);
}

function cloneSandboxData(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    const arr = [];
    seen.set(value, arr);
    for (const item of value) {
      arr.push(cloneSandboxData(item, seen));
    }
    return createSandboxArray(arr);
  }

  const obj = Object.create(null);
  seen.set(value, obj);
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'function') {
      obj[key] = cloneSandboxData(item, seen);
    }
  }
  return Object.freeze(obj);
}

function assertSandboxSourceAllowed(code, filePath) {
  for (const rule of SANDBOX_SOURCE_BLOCKLIST) {
    if (rule.pattern.test(code)) {
      throw new Error(`[MODULE LOADER] Sandbox rejected ${path.basename(filePath)}: ${rule.message}`);
    }
  }
}

function normalizeServiceName(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function readModuleApiDefinition(moduleRoot) {
  const apiDefinitionPath = path.join(moduleRoot, 'apiDefinition.json');
  if (!fs.existsSync(apiDefinitionPath)) {
    return { services: [] };
  }

  const parsed = JSON.parse(fs.readFileSync(apiDefinitionPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('apiDefinition.json must be a JSON object.');
  }
  return parsed;
}

function serviceNamesFromApiDefinition(apiDefinition = {}) {
  const services = Array.isArray(apiDefinition.services) ? apiDefinition.services : [];
  const names = new Set();
  for (const service of services) {
    let name = '';
    if (typeof service === 'string') {
      name = service;
    } else if (service && typeof service === 'object') {
      name = service.name || service.service || service.provider || '';
    }
    const normalized = normalizeServiceName(name);
    if (normalized) names.add(normalized);
  }
  return names;
}

function buildSandboxEnv(moduleRoot) {
  const apiDefinition = readModuleApiDefinition(moduleRoot);
  const env = Object.create(null);
  for (const serviceName of serviceNamesFromApiDefinition(apiDefinition)) {
    const keys = SERVICE_ENV_KEYS[serviceName] || [];
    for (const key of keys) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }
  }
  return Object.freeze(env);
}

function assertSandboxPathInside(moduleDir, candidatePath, label = 'path') {
  const root = path.resolve(moduleDir);
  const resolved = path.resolve(candidatePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
  if (compareResolved !== compareRoot && !compareResolved.startsWith(compareRootPrefix)) {
    throw new Error(`[MODULE LOADER] Sandbox ${label} must stay inside the module folder.`);
  }
  return resolved;
}

function resolveSandboxPath(moduleDir, requestedPath, label = 'path') {
  if (typeof requestedPath !== 'string') {
    throw new Error(`[MODULE LOADER] Sandbox ${label} must be a string path.`);
  }
  const resolved = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(moduleDir, requestedPath);
  assertSandboxPathInside(moduleDir, resolved, label);

  if (fs.existsSync(resolved)) {
    const realPath = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
    assertSandboxPathInside(moduleDir, realPath, label);
  }

  return resolved;
}

function createStatsFacade(stats) {
  return createSandboxObject({
    dev: stats.dev,
    ino: stats.ino,
    mode: stats.mode,
    nlink: stats.nlink,
    uid: stats.uid,
    gid: stats.gid,
    rdev: stats.rdev,
    size: stats.size,
    blksize: stats.blksize,
    blocks: stats.blocks,
    atimeMs: stats.atimeMs,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
    birthtimeMs: stats.birthtimeMs,
    atime: stats.atime?.toISOString?.() || null,
    mtime: stats.mtime?.toISOString?.() || null,
    ctime: stats.ctime?.toISOString?.() || null,
    birthtime: stats.birthtime?.toISOString?.() || null,
    isFile: createSandboxFunction(() => stats.isFile()),
    isDirectory: createSandboxFunction(() => stats.isDirectory()),
    isSymbolicLink: createSandboxFunction(() => stats.isSymbolicLink()),
    isBlockDevice: createSandboxFunction(() => stats.isBlockDevice()),
    isCharacterDevice: createSandboxFunction(() => stats.isCharacterDevice()),
    isFIFO: createSandboxFunction(() => stats.isFIFO()),
    isSocket: createSandboxFunction(() => stats.isSocket())
  });
}

function createDirentFacade(dirent) {
  return createSandboxObject({
    name: dirent.name,
    path: dirent.path,
    parentPath: dirent.parentPath,
    isFile: createSandboxFunction(() => dirent.isFile()),
    isDirectory: createSandboxFunction(() => dirent.isDirectory()),
    isSymbolicLink: createSandboxFunction(() => dirent.isSymbolicLink()),
    isBlockDevice: createSandboxFunction(() => dirent.isBlockDevice()),
    isCharacterDevice: createSandboxFunction(() => dirent.isCharacterDevice()),
    isFIFO: createSandboxFunction(() => dirent.isFIFO()),
    isSocket: createSandboxFunction(() => dirent.isSocket())
  });
}

function normalizeReadOptions(options) {
  if (typeof options === 'string') return options;
  if (options && typeof options === 'object' && options.encoding) {
    return cloneSandboxData(options);
  }
  throw new Error('[MODULE LOADER] Sandbox fs reads require an explicit text encoding.');
}

function createDeniedFsAsyncFacade() {
  const denied = createSandboxFunction(() => {
    throw new Error('[MODULE LOADER] Sandbox async fs facade is unavailable. Use synchronous read-only fs with an explicit encoding.');
  });
  return createSandboxObject({
    access: denied,
    readFile: denied,
    readdir: denied,
    stat: denied,
    lstat: denied,
    realpath: denied,
    appendFile: denied,
    chmod: denied,
    chown: denied,
    copyFile: denied,
    cp: denied,
    mkdir: denied,
    open: denied,
    rm: denied,
    rmdir: denied,
    rename: denied,
    unlink: denied,
    writeFile: denied
  });
}

function createScopedFsFacade(moduleDir) {
  const readPath = (value, label) => resolveSandboxPath(moduleDir, value, label);
  const deniedWrite = () => {
    throw new Error('[MODULE LOADER] Sandbox fs facade is read-only. Use a core module contract for writes.');
  };
  const deniedWriteFn = createSandboxFunction(deniedWrite);
  const deniedStream = createSandboxFunction(() => {
    throw new Error('[MODULE LOADER] Sandbox fs streams are unavailable. Use readFileSync() with an explicit text encoding.');
  });

  const realpathSync = function sandboxRealpathSync(filePath, options) {
    return fs.realpathSync(readPath(filePath, 'fs path'), options);
  };
  Object.defineProperty(realpathSync, 'native', {
    value: createSandboxFunction((filePath, options) => {
      const realpathNative = fs.realpathSync.native || fs.realpathSync;
      return realpathNative(readPath(filePath, 'fs path'), options);
    }),
    enumerable: true,
    configurable: false,
    writable: false
  });
  hardenSandboxFunction(realpathSync);

  return createSandboxObject({
    constants: cloneSandboxData(fs.constants),
    promises: createDeniedFsAsyncFacade(),
    existsSync: createSandboxFunction((filePath) => fs.existsSync(readPath(filePath, 'fs path'))),
    readFileSync: createSandboxFunction((filePath, options) => {
      return fs.readFileSync(readPath(filePath, 'fs path'), normalizeReadOptions(options));
    }),
    readdirSync: createSandboxFunction((dirPath, options) => {
      const entries = fs.readdirSync(readPath(dirPath, 'fs path'), options);
      const safeEntries = Array.isArray(entries) && options?.withFileTypes
        ? entries.map(createDirentFacade)
        : entries.map(entry => String(entry));
      return createSandboxArray(safeEntries);
    }),
    statSync: createSandboxFunction((filePath, options) => createStatsFacade(fs.statSync(readPath(filePath, 'fs path'), options))),
    lstatSync: createSandboxFunction((filePath, options) => createStatsFacade(fs.lstatSync(readPath(filePath, 'fs path'), options))),
    accessSync: createSandboxFunction((filePath, mode) => fs.accessSync(readPath(filePath, 'fs path'), mode)),
    realpathSync,
    createReadStream: deniedStream,
    appendFile: deniedWriteFn,
    appendFileSync: deniedWriteFn,
    chmod: deniedWriteFn,
    chmodSync: deniedWriteFn,
    chown: deniedWriteFn,
    chownSync: deniedWriteFn,
    copyFile: deniedWriteFn,
    copyFileSync: deniedWriteFn,
    cp: deniedWriteFn,
    cpSync: deniedWriteFn,
    createWriteStream: deniedWriteFn,
    mkdir: deniedWriteFn,
    mkdirSync: deniedWriteFn,
    open: deniedWriteFn,
    openSync: deniedWriteFn,
    rm: deniedWriteFn,
    rmSync: deniedWriteFn,
    rmdir: deniedWriteFn,
    rmdirSync: deniedWriteFn,
    rename: deniedWriteFn,
    renameSync: deniedWriteFn,
    unlink: deniedWriteFn,
    unlinkSync: deniedWriteFn,
    write: deniedWriteFn,
    writeFile: deniedWriteFn,
    writeFileSync: deniedWriteFn
  });
}

function resolveSandboxModulePath(moduleRoot, fromDir, reqPath) {
  const base = path.resolve(fromDir, reqPath);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.json`,
    path.join(base, 'index.js'),
    path.join(base, 'index.json')
  ];
  for (const candidate of candidates) {
    const resolved = resolveSandboxPath(moduleRoot, candidate, 'require path');
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }
  throw new Error(`Cannot resolve module '${reqPath}' inside sandbox.`);
}

function createPathPlatformFacade(pathModule) {
  return createSandboxObject({
    sep: pathModule.sep,
    delimiter: pathModule.delimiter,
    basename: createSandboxFunction((...args) => pathModule.basename(...args)),
    dirname: createSandboxFunction((...args) => pathModule.dirname(...args)),
    extname: createSandboxFunction((...args) => pathModule.extname(...args)),
    format: createSandboxFunction((value) => pathModule.format(value && typeof value === 'object' ? { ...value } : value)),
    isAbsolute: createSandboxFunction((...args) => pathModule.isAbsolute(...args)),
    join: createSandboxFunction((...args) => pathModule.join(...args)),
    normalize: createSandboxFunction((...args) => pathModule.normalize(...args)),
    parse: createSandboxFunction((...args) => cloneSandboxData(pathModule.parse(...args))),
    relative: createSandboxFunction((...args) => pathModule.relative(...args)),
    resolve: createSandboxFunction((...args) => pathModule.resolve(...args))
  });
}

function createPathFacade() {
  return createSandboxObject({
    sep: path.sep,
    delimiter: path.delimiter,
    basename: createSandboxFunction((...args) => path.basename(...args)),
    dirname: createSandboxFunction((...args) => path.dirname(...args)),
    extname: createSandboxFunction((...args) => path.extname(...args)),
    format: createSandboxFunction((value) => path.format(value && typeof value === 'object' ? { ...value } : value)),
    isAbsolute: createSandboxFunction((...args) => path.isAbsolute(...args)),
    join: createSandboxFunction((...args) => path.join(...args)),
    normalize: createSandboxFunction((...args) => path.normalize(...args)),
    parse: createSandboxFunction((...args) => cloneSandboxData(path.parse(...args))),
    relative: createSandboxFunction((...args) => path.relative(...args)),
    resolve: createSandboxFunction((...args) => path.resolve(...args)),
    posix: createPathPlatformFacade(path.posix),
    win32: createPathPlatformFacade(path.win32)
  });
}

function createHashFacade(hash) {
  const facade = createMutableSandboxObject();
  facade.update = createSandboxFunction((data, inputEncoding) => {
    hash.update(String(data), inputEncoding);
    return facade;
  });
  facade.digest = createSandboxFunction((encoding = 'hex') => hash.digest(encoding || 'hex'));
  return Object.freeze(facade);
}

function createCryptoFacade() {
  const crypto = require('crypto');
  return createSandboxObject({
    randomUUID: createSandboxFunction((options) => crypto.randomUUID(options)),
    randomBytes: createSandboxFunction((size, encoding = 'hex') => crypto.randomBytes(size).toString(encoding || 'hex')),
    createHash: createSandboxFunction((algorithm, options) => createHashFacade(crypto.createHash(algorithm, options))),
    createHmac: createSandboxFunction((algorithm, key, options) => createHashFacade(crypto.createHmac(algorithm, String(key), options))),
    timingSafeEqual: createSandboxFunction((left, right) => {
      const leftBuffer = Buffer.from(String(left));
      const rightBuffer = Buffer.from(String(right));
      if (leftBuffer.length !== rightBuffer.length) return false;
      return crypto.timingSafeEqual(leftBuffer, rightBuffer);
    })
  });
}

function createConsoleFacade() {
  return createSandboxObject({
    log: createSandboxFunction((...args) => console.log(...args)),
    info: createSandboxFunction((...args) => console.info(...args)),
    warn: createSandboxFunction((...args) => console.warn(...args)),
    error: createSandboxFunction((...args) => console.error(...args)),
    debug: createSandboxFunction((...args) => console.debug(...args))
  });
}

function createTimerFacade() {
  let nextTimerId = 1;
  const timers = new Map();

  const setManagedTimer = (setter, clearFn, repeats, handler, delay, args) => {
    if (typeof handler !== 'function') {
      throw new Error('[MODULE LOADER] Sandbox timers require a function callback.');
    }
    const id = nextTimerId++;
    const wrapped = () => {
      if (!repeats) timers.delete(id);
      handler(...args);
    };
    const handle = setter(wrapped, Number(delay) || 0);
    timers.set(id, { handle, clearFn });
    return id;
  };

  const clearManagedTimer = (id) => {
    const record = timers.get(id);
    if (record) {
      record.clearFn(record.handle);
      timers.delete(id);
    }
  };

  return createSandboxObject({
    setTimeout: createSandboxFunction((handler, delay, ...args) => setManagedTimer(setTimeout, clearTimeout, false, handler, delay, args)),
    setInterval: createSandboxFunction((handler, delay, ...args) => setManagedTimer(setInterval, clearInterval, true, handler, delay, args)),
    clearTimeout: createSandboxFunction(clearManagedTimer),
    clearInterval: createSandboxFunction(clearManagedTimer)
  });
}

function createSandboxProcess(sandboxEnv) {
  return createSandboxObject({
    env: sandboxEnv
  });
}

function loadModuleSandboxed(indexJsPath) {
  const moduleRoot = path.dirname(indexJsPath);
  const scopedFs = createScopedFsFacade(moduleRoot);
  const sandboxEnv = buildSandboxEnv(moduleRoot);
  const timers = createTimerFacade();
  const moduleCache = new Map();
  const allowedImports = new Map([
    ['crypto', createCryptoFacade()],
    ['node:crypto', createCryptoFacade()],
    ['path', createPathFacade()],
    ['node:path', createPathFacade()],
    ['fs', scopedFs],
    ['node:fs', scopedFs],
    ['fs/promises', scopedFs.promises],
    ['node:fs/promises', scopedFs.promises],
    ['sanitize-html', createSandboxFunction((...args) => require('sanitize-html')(...args))]
  ]);
  const context = createMutableSandboxObject({
    console: createConsoleFacade(),
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    clearTimeout: timers.clearTimeout,
    clearInterval: timers.clearInterval,
    process: createSandboxProcess(sandboxEnv)
  });
  vm.createContext(context, {
    codeGeneration: {
      strings: false,
      wasm: false
    }
  });

  function loadSandboxFile(filePath) {
    const resolvedPath = resolveSandboxPath(moduleRoot, filePath, 'require path');
    if (moduleCache.has(resolvedPath)) return moduleCache.get(resolvedPath).exports;

    if (resolvedPath.endsWith('.json')) {
      const jsonModule = createMutableSandboxObject({
        exports: cloneSandboxData(JSON.parse(fs.readFileSync(resolvedPath, 'utf8')))
      });
      moduleCache.set(resolvedPath, jsonModule);
      return jsonModule.exports;
    }

    if (!resolvedPath.endsWith('.js')) {
      throw new Error(`Sandbox can only load .js and .json files: ${resolvedPath}`);
    }

    const module = createMutableSandboxObject({
      exports: createMutableSandboxObject()
    });
    moduleCache.set(resolvedPath, module);
    const fileDir = path.dirname(resolvedPath);

    const sandboxRequire = hardenSandboxFunction(function sandboxRequire(reqPath) {
      if (allowedImports.has(reqPath)) {
        return allowedImports.get(reqPath);
      }
      if (reqPath.startsWith('./') || reqPath.startsWith('../')) {
        return loadSandboxFile(resolveSandboxModulePath(moduleRoot, fileDir, reqPath));
      }
      throw new Error(`Access to '${reqPath}' is denied`);
    });

    const code = fs.readFileSync(resolvedPath, 'utf8');
    assertSandboxSourceAllowed(code, resolvedPath);
    const wrappedCode = `(function(exports, require, module, __filename, __dirname) {\n${code}\n})`;
    const wrapper = vm.runInContext(wrappedCode, context, { filename: resolvedPath });
    wrapper(module.exports, sandboxRequire, module, resolvedPath, fileDir);
    return module.exports;
  }

  return loadSandboxFile(indexJsPath);
}

module.exports = {
  SERVICE_ENV_KEYS,
  assertSandboxPathInside,
  buildSandboxEnv,
  cloneSandboxData,
  createScopedFsFacade,
  createSandboxFunction,
  createSandboxObject,
  hardenSandboxFunction,
  loadModuleSandboxed,
  normalizeServiceName,
  readModuleApiDefinition,
  resolveSandboxPath,
  serviceNamesFromApiDefinition
};
