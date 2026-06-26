const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSandboxModule(p) {
  function sandboxRequire(reqPath) {
    if (reqPath.startsWith('./') || reqPath.startsWith('../')) {
      const resolved = path.resolve(path.dirname(p), reqPath);
      if (!resolved.startsWith(path.dirname(p))) {
        throw new Error('Invalid require path');
      }
      return require(resolved);
    }
    return require(reqPath);
  }
  const context = {
    module: { exports: {} },
    exports: {},
    require: sandboxRequire,
    __filename: p,
    __dirname: path.dirname(p),
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    process: { env: {} }
  };
  vm.createContext(context);
  const code = fs.readFileSync(p, 'utf8');
  vm.runInContext(code, context, { filename: p });
  return context.module.exports;
}

test('exposes __dirname and __filename inside sandboxed module', () => {
  const modPath = path.resolve(__dirname, 'sandboxModule/index.js');
  const mod = loadSandboxModule(modPath);
  const res = mod.check();
  expect(res.dir).toBe(path.dirname(modPath));
  expect(res.file).toBe(modPath);
});
