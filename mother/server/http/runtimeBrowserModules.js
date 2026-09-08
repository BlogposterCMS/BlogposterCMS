'use strict';

const fs = require('fs');
const path = require('path');

const runtimeTsCache = new Map();
const VALID_RUNTIME_MODULE = /^[A-Za-z0-9_-]+$/;
function browserTsOptions(ts) {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    resolveJsonModule: true,
    allowSyntheticDefaultImports: true,
    importHelpers: false,
    sourceMap: false,
    removeComments: false
  };
}

function setStaticCorsHeaders(_req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}

async function compileBrowserModule(tsPath) {
  // The existing browser build emits adjacent .js files. Production must never
  // fall back to a compiler, including when an image is missing an artifact.
  if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
    try {
      return await fs.promises.readFile(tsPath.replace(/\.ts$/, '.js'), 'utf8');
    } catch (cause) {
      const error = new Error(`[BROWSER_MODULE_BUILD_MISSING] Cannot read built module: ${tsPath}`, { cause });
      error.code = 'BROWSER_MODULE_BUILD_MISSING';
      throw error;
    }
  }

  // Keep source-refresh behavior in development without loading TS at startup.
  const ts = require('typescript');
  const stat = await fs.promises.stat(tsPath);
  const cached = runtimeTsCache.get(tsPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    if (typeof cached.code === 'string') return cached.code;
    if (cached.promise) return cached.promise;
  }

  const compilePromise = (async () => {
    const source = await fs.promises.readFile(tsPath, 'utf8');
    const result = ts.transpileModule(source, {
      compilerOptions: browserTsOptions(ts),
      fileName: path.basename(tsPath)
    });

    if (Array.isArray(result.diagnostics) && result.diagnostics.length > 0) {
      const formatted = result.diagnostics
        .map(diag => {
          if (!diag) return '';
          if (typeof diag.messageText === 'string') return diag.messageText;
          return diag.messageText?.messageText || '';
        })
        .filter(Boolean)
        .join('; ');
      if (formatted) {
        console.warn(`[runtime-ts] Diagnostics while compiling ${tsPath}: ${formatted}`);
      }
    }

    const output = result.outputText || '';
    runtimeTsCache.set(tsPath, { mtimeMs: stat.mtimeMs, code: output });
    return output;
  })();

  runtimeTsCache.set(tsPath, { mtimeMs: stat.mtimeMs, promise: compilePromise });

  try {
    return await compilePromise;
  } catch (err) {
    runtimeTsCache.delete(tsPath);
    throw err;
  }
}

function makeParamTsHandler(baseDir, paramName) {
  const normalizedBase = path.resolve(baseDir);
  return async (req, res, next) => {
    const raw = req.params?.[paramName];
    if (!raw || !VALID_RUNTIME_MODULE.test(raw)) return next();

    const tsCandidate = path.resolve(normalizedBase, `${raw}.ts`);
    if (!tsCandidate.startsWith(normalizedBase + path.sep)) return next();

    try {
      await fs.promises.access(tsCandidate, fs.constants.R_OK);
    } catch {
      return next();
    }

    try {
      const code = await compileBrowserModule(tsCandidate);
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.send(code);
    } catch (err) {
      console.error(`[BROWSER_MODULE_LOAD_FAILED] Failed to load ${tsCandidate}:`, err);
      res
        .status(500)
        .type('application/javascript')
        .send("console.error('BROWSER_MODULE_LOAD_FAILED');");
    }
  };
}

function makeFixedTsHandler(tsPath) {
  const normalizedPath = path.resolve(tsPath);
  return async (_req, res, next) => {
    try {
      await fs.promises.access(normalizedPath, fs.constants.R_OK);
    } catch {
      return next();
    }

    try {
      const code = await compileBrowserModule(normalizedPath);
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.send(code);
    } catch (err) {
      console.error(`[BROWSER_MODULE_LOAD_FAILED] Failed to load ${normalizedPath}:`, err);
      res
        .status(500)
        .type('application/javascript')
        .send("console.error('BROWSER_MODULE_LOAD_FAILED');");
    }
  };
}

module.exports = {
  VALID_RUNTIME_MODULE,
  compileBrowserModule,
  makeFixedTsHandler,
  makeParamTsHandler,
  setStaticCorsHeaders
};
