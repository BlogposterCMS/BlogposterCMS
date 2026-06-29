'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  VALID_RUNTIME_MODULE,
  makeFixedTsHandler,
  makeParamTsHandler,
  setStaticCorsHeaders
} = require('./runtimeBrowserModules');

const STATIC_BLOCKED_FILENAMES = new Set([
  '.npmrc',
  '.yarnrc',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb'
]);

function blockBrowserSourceFiles(req, res, next) {
  const rawPath = String(req.path || '');
  let requestPath = rawPath;
  try {
    requestPath = decodeURIComponent(rawPath);
  } catch {
    requestPath = rawPath;
  }

  const filename = (requestPath.split(/[\\/]+/).pop() || '').toLowerCase();
  const isBlockedSource = /\.(?:ts|tsx)$/i.test(requestPath);
  const isBlockedSecret = /^\.env(?:\.|$)/i.test(filename);
  const isBlockedRuntimeFile = STATIC_BLOCKED_FILENAMES.has(filename);
  if (isBlockedSource || isBlockedSecret || isBlockedRuntimeFile) {
    res.status(404).send('Not found');
    return;
  }
  next();
}

function blockThemeExecutableAssets(req, res, next) {
  const rawPath = String(req.path || '');
  let requestPath = rawPath;
  try {
    requestPath = decodeURIComponent(rawPath);
  } catch {
    requestPath = rawPath;
  }

  // Themes are presentation-only; executable assets belong in widgets, modules or apps.
  if (/\.(?:asp|aspx|cjs|js|jsx|jsp|mjs|php|phtml|py|rb|sh|ts|tsx|vue|svelte)$/i.test(requestPath)) {
    res.status(404).send('Not found');
    return;
  }
  next();
}

function makeStaticRealpathGuard(rootPath, label) {
  const root = path.resolve(rootPath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;

  return (req, res, next) => {
    try {
      const relativePath = String(req.path || '').replace(/^\/+/, '');
      if (relativePath.includes('\0')) {
        res.status(400).send('Bad request');
        return;
      }

      const candidate = path.resolve(root, relativePath);
      const compareCandidate = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
      if (compareCandidate !== compareRoot && !compareCandidate.startsWith(compareRootPrefix)) {
        res.status(403).send('Forbidden');
        return;
      }

      if (fs.existsSync(candidate)) {
        const realCandidate = fs.realpathSync(candidate);
        const compareRealCandidate = process.platform === 'win32'
          ? realCandidate.toLowerCase()
          : realCandidate;
        if (compareRealCandidate !== compareRoot && !compareRealCandidate.startsWith(compareRootPrefix)) {
          res.status(403).send('Forbidden');
          return;
        }
      }

      next();
    } catch (err) {
      console.warn(`[STATIC] Blocked ${label} asset path:`, err.message);
      res.status(400).send('Bad request');
    }
  };
}

function mountModulePublicLoaderRoutes(app, { rootDir, modulePublicLoaderRoot }) {
  const modulePublicLoaderTsPaths = {
    pagesManager: path.join(rootDir, 'mother', 'modules', 'pagesManager', 'publicLoader.ts'),
    widgetManager: path.join(rootDir, 'mother', 'modules', 'widgetManager', 'publicLoader.ts')
  };

  Object.entries(modulePublicLoaderTsPaths).forEach(([moduleName, loaderTsPath]) => {
    app.get(
      `/mother/modules/${moduleName}/publicLoader.js`,
      makeFixedTsHandler(loaderTsPath)
    );
    app.head(
      `/mother/modules/${moduleName}/publicLoader.js`,
      makeFixedTsHandler(loaderTsPath)
    );
  });

  app.get('/modules/:moduleName/publicLoader.js', setStaticCorsHeaders, async (req, res, next) => {
    const moduleName = String(req.params.moduleName || '');
    if (!VALID_RUNTIME_MODULE.test(moduleName)) {
      return res.status(400).send('Bad request');
    }

    const loaderPath = path.resolve(modulePublicLoaderRoot, moduleName, 'publicLoader.js');
    const relativePath = path.relative(modulePublicLoaderRoot, loaderPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return res.status(403).send('Forbidden');
    }

    try {
      await fs.promises.access(loaderPath, fs.constants.R_OK);
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(loaderPath);
    } catch {
      next();
    }
  });

  app.head('/modules/:moduleName/publicLoader.js', setStaticCorsHeaders, async (req, res, next) => {
    const moduleName = String(req.params.moduleName || '');
    if (!VALID_RUNTIME_MODULE.test(moduleName)) {
      return res.status(400).end();
    }

    const loaderPath = path.resolve(modulePublicLoaderRoot, moduleName, 'publicLoader.js');
    const relativePath = path.relative(modulePublicLoaderRoot, loaderPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return res.status(403).end();
    }

    try {
      await fs.promises.access(loaderPath, fs.constants.R_OK);
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.end();
    } catch {
      next();
    }
  });
}

function mountStaticAssetRoutes(app, { rootDir, securityConfig }) {
  const publicPath = path.join(rootDir, 'public');
  const assetsPath = path.join(publicPath, 'assets');
  const buildPath = path.join(publicPath, 'build');
  const widgetsPath = path.join(rootDir, 'widgets');
  const designerMainTs = path.join(rootDir, 'ui', 'designer', 'app', 'main');
  const designerManagersTs = path.join(rootDir, 'ui', 'designer', 'app', 'managers');
  const modulePublicLoaderRoot = path.join(rootDir, 'modules');
  const appStaticPath = path.join(rootDir, 'apps');
  const themesPath = path.join(publicPath, 'themes');
  const guardAppStaticRoot = makeStaticRealpathGuard(appStaticPath, 'apps');
  const guardWidgetStaticRoot = makeStaticRealpathGuard(widgetsPath, 'widgets');
  const guardThemeStaticRoot = makeStaticRealpathGuard(themesPath, 'themes');

  app.get('/apps/designer/main/:moduleName.js', makeParamTsHandler(designerMainTs, 'moduleName'));
  app.head('/apps/designer/main/:moduleName.js', makeParamTsHandler(designerMainTs, 'moduleName'));
  app.get('/apps/designer/managers/:moduleName.js', makeParamTsHandler(designerManagersTs, 'moduleName'));
  app.head('/apps/designer/managers/:moduleName.js', makeParamTsHandler(designerManagersTs, 'moduleName'));
  mountModulePublicLoaderRoutes(app, { rootDir, modulePublicLoaderRoot });

  app.use('/admin/assets', blockBrowserSourceFiles, express.static(path.join(publicPath, 'assets')));
  app.use('/build', setStaticCorsHeaders, express.static(buildPath));
  app.use('/ui', setStaticCorsHeaders, blockBrowserSourceFiles, express.static(path.join(rootDir, 'ui')));
  app.get('/apps/designer/origin-public-key.json', (req, res) => {
    const publicKeyPem = securityConfig.postMessage?.originToken?.publicKey;
    if (!publicKeyPem) {
      res.status(503).json({ error: 'Origin public key unavailable' });
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.json({ publicKey: publicKeyPem });
  });
  app.use('/apps', setStaticCorsHeaders, guardAppStaticRoot, blockBrowserSourceFiles, express.static(appStaticPath));
  app.use('/widgets', setStaticCorsHeaders, guardWidgetStaticRoot, blockBrowserSourceFiles, express.static(widgetsPath));
  app.use('/plainspace', blockBrowserSourceFiles, express.static(path.join(publicPath, 'plainspace')));

  app.get('/assets/icon-list.json', async (_req, res) => {
    try {
      const files = await fs.promises.readdir(path.join(assetsPath, 'icons'));
      const icons = files.filter(fileName => fileName.endsWith('.svg'));
      res.json(icons);
    } catch (err) {
      console.error('[SERVER] Failed to build icon manifest', err);
      res.status(500).json({ error: 'Unable to load icons' });
    }
  });

  app.use('/assets', setStaticCorsHeaders, blockBrowserSourceFiles, express.static(assetsPath));
  app.use('/themes', setStaticCorsHeaders, guardThemeStaticRoot, blockThemeExecutableAssets, express.static(themesPath));
  app.use('/favicon.ico', express.static(path.join(publicPath, 'favicon.ico')));
  app.use('/fonts', setStaticCorsHeaders, express.static(path.join(publicPath, 'fonts')));

  return {
    assetsPath,
    buildPath,
    publicPath,
    widgetsPath
  };
}

module.exports = {
  STATIC_BLOCKED_FILENAMES,
  blockBrowserSourceFiles,
  blockThemeExecutableAssets,
  makeStaticRealpathGuard,
  mountModulePublicLoaderRoutes,
  mountStaticAssetRoutes,
  setStaticCorsHeaders
};
