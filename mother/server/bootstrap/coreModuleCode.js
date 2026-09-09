'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const { lifecycleError } = require('./coreModuleScope');

/** Load a verified generation with local caches and canonical shared imports.
 * This is trusted core code, not a sandbox. The updater must verify every byte
 * and the compatible host before calling this loader.
 */
function loadCoreModuleCode({ moduleName, moduleDir, canonicalModuleDir }) {
  const root = fs.realpathSync(moduleDir);
  const canonicalRoot = fs.realpathSync(canonicalModuleDir);
  const cache = new Map();
  const hostRequire = createRequire(path.join(canonicalRoot, 'index.js'));
  const inside = filename => filename === root || filename.startsWith(`${root}${path.sep}`);

  function resolveLocal(request, parent) {
    const candidate = path.resolve(path.dirname(parent), request);
    if (!inside(candidate)) return null;
    for (const filename of [candidate, `${candidate}.js`, `${candidate}.json`, path.join(candidate, 'index.js')]) {
      if (fs.existsSync(filename) && fs.lstatSync(filename).isFile()) {
        if (!inside(fs.realpathSync(filename))) throw lifecycleError('CORE_MODULE_CODE_PATH_ESCAPE', moduleName);
        return filename;
      }
    }
    throw lifecycleError('CORE_MODULE_CODE_MISSING', moduleName);
  }

  function load(filename) {
    if (!inside(fs.realpathSync(filename)) || fs.lstatSync(filename).isSymbolicLink()) {
      throw lifecycleError('CORE_MODULE_CODE_PATH_ESCAPE', moduleName);
    }
    if (cache.has(filename)) return cache.get(filename).exports;
    const record = { exports: {}, filename, loaded: false };
    cache.set(filename, record);
    try {
      if (path.extname(filename) === '.json') {
        record.exports = JSON.parse(fs.readFileSync(filename, 'utf8'));
      } else {
        if (path.extname(filename) !== '.js') throw lifecycleError('CORE_MODULE_CODE_TYPE_UNSUPPORTED', moduleName);
        const canonicalFile = path.join(canonicalRoot, path.relative(root, filename));
        const sharedRequire = createRequire(canonicalFile);
        const requireGeneration = request => {
          if (typeof request !== 'string') throw lifecycleError('CORE_MODULE_IMPORT_INVALID', moduleName);
          const local = request.startsWith('.') ? resolveLocal(request, filename) : null;
          return local ? load(local) : sharedRequire(request);
        };
        requireGeneration.resolve = request => (
          request.startsWith('.') ? resolveLocal(request, filename) || sharedRequire.resolve(request) : sharedRequire.resolve(request)
        );
        // Keep __dirname within this immutable generation for module-owned data.
        // Imports escaping its directory resolve against the original host.
        const execute = vm.compileFunction(fs.readFileSync(filename, 'utf8'),
          ['exports', 'require', 'module', '__filename', '__dirname'], { filename });
        execute.call(record.exports, record.exports, requireGeneration, record, filename, path.dirname(filename));
      }
      record.loaded = true;
      return record.exports;
    } catch (error) { cache.delete(filename); throw error; }
  }

  // Resolve host dependencies before evaluating the entry; no global cache is
  // cleared, so other modules retain their singleton services and active jobs.
  if (!hostRequire.resolve('./index.js')) throw lifecycleError('CORE_MODULE_ENTRY_INVALID', moduleName);
  return load(path.join(root, 'index.js'));
}

module.exports = { loadCoreModuleCode };
