'use strict';

const fs = require('fs');
const path = require('path');
const { BROWSER_PREFIX, ownsBrowserFile } = require('../../modules/updater/coreModuleBrowserFiles');
const { runModuleWorker } = require('../../modules/updater/coreModuleWorker');
const { setStaticCorsHeaders } = require('./runtimeBrowserModules');
const { WIDGET_POLICY } = require('../../modules/updater/coreWidgetPackages');

const GENERATION = /^[a-f0-9]{64}$/;
const PUBLIC_ASSET = /\.(?:js|css|map|svg|png|jpe?g|gif|webp|woff2?|ttf)$/;
const PREFIX = '/_module-assets/';

function browserUrl(moduleName, generationId, filename) {
  return `${PREFIX}${moduleName}/${generationId}/${filename}`;
}

/** Rewrite only owned resource attributes in trusted, signed application HTML. */
function versionHtml(html, moduleName, generationId) {
  return html.replace(/\b(src|href)=(['"])(\/[^'"<>]*)\2/g, (match, attribute, quote, value) => {
    const pathname = value.split(/[?#]/, 1)[0];
    const filename = pathname.startsWith('/build/') ? `public${pathname}` : pathname.slice(1);
    if (!ownsBrowserFile(moduleName, filename)) return match;
    return `${attribute}=${quote}${browserUrl(moduleName, generationId, filename)}${value.slice(pathname.length)}${quote}`;
  });
}

function checkedFile(root, relative) {
  const filename = path.resolve(root, relative);
  const normalizedRoot = fs.realpathSync(root);
  const actual = fs.realpathSync(filename);
  if (!actual.startsWith(`${normalizedRoot}${path.sep}`) || actual !== filename || !fs.statSync(actual).isFile()) {
    throw Object.assign(new Error('CORE_MODULE_BROWSER_PATH_DENIED'), { code: 'CORE_MODULE_BROWSER_PATH_DENIED' });
  }
  return actual;
}

function mountCoreModuleBrowserAssets(app, { rootDir, inspect = runModuleWorker }) {
  const generations = new Map();
  const inspections = new Map();
  const inspectionLanes = [Promise.resolve(), Promise.resolve()];
  let nextLane = 0;
  async function inspectGeneration(moduleName, generationId) {
    const key = `${moduleName}/${generationId}`;
    if (generations.has(key)) return generations.get(key);
    if (inspections.has(key)) return inspections.get(key);
    // Public asset requests must not spawn unbounded verification workers.
    if (inspections.size >= 128 || (inspect === runModuleWorker && !fs.existsSync(
      path.join(rootDir, 'data/core-module-updates', moduleName, generationId, 'manifest.json')))) {
      throw new Error('CORE_MODULE_BROWSER_GENERATION_UNAVAILABLE');
    }
    // A dashboard can request many widget generations together after startup.
    // Queue valid requests behind two workers instead of rejecting the third widget.
    const lane = nextLane++ % inspectionLanes.length;
    const job = inspectionLanes[lane].then(() => inspect({ rootDir, moduleName, generationId, operation: 'inspect' }))
      .then(selection => {
        if (selection.generationId !== generationId) throw new Error('CORE_MODULE_BROWSER_GENERATION_MISMATCH');
        if (generations.size >= 96) generations.delete(generations.keys().next().value);
        generations.set(key, selection);
        return selection;
      }).finally(() => inspections.delete(key));
    inspectionLanes[lane] = job.catch(() => {});
    inspections.set(key, job);
    return job;
  }
  app.get('/apps/designer/index.html', setStaticCorsHeaders, async (req, res, next) => {
    const selected = app.locals.coreModuleLifecycle?.browserSelection('designerManager');
    if (!selected || !fs.existsSync(path.join(selected.moduleDir, BROWSER_PREFIX, 'apps/designer/index.html'))) return next();
    res.set('Cache-Control', 'no-store');
    try {
      // Keep the manifest's launch URL and sandbox handshake intact. Only code
      // resources select immutable generations; app identity does not change.
      const selection = await inspectGeneration('designerManager', selected.generationId);
      const file = checkedFile(path.join(selection.moduleDir, BROWSER_PREFIX), 'apps/designer/index.html');
      return res.type('html').send(versionHtml(await fs.promises.readFile(file, 'utf8'), 'designerManager', selected.generationId));
    } catch {
      return res.status(503).json({ error: 'CORE_MODULE_BROWSER_ASSET_UNAVAILABLE' });
    }
  });

  for (const [moduleName, widget] of Object.entries(WIDGET_POLICY)) {
    app.get(`/${widget.entry}`, setStaticCorsHeaders, (req, res, next) => {
      const selected = app.locals.coreModuleLifecycle?.browserSelection(moduleName);
      if (!selected) return next();
      res.set('Cache-Control', 'no-store');
      return res.redirect(307, browserUrl(moduleName, selected.generationId, widget.entry));
    });
  }

  // Sandboxed app frames have an opaque origin. Use the same public-asset CORS
  // contract as canonical browser files, without changing frame permissions.
  app.get(`${PREFIX}:moduleName/:generationId/*`, setStaticCorsHeaders, async (req, res) => {
    const { moduleName, generationId } = req.params;
    const filename = req.params[0];
    if ((moduleName !== 'designerManager' && !Object.prototype.hasOwnProperty.call(WIDGET_POLICY, moduleName)) || !GENERATION.test(generationId) ||
        !/^[A-Za-z0-9_./-]+$/.test(filename) || filename.split('/').some(part => !part || part.startsWith('.'))) {
      return res.status(404).end();
    }
    const owned = ownsBrowserFile(moduleName, filename);
    const html = filename === 'apps/designer/index.html';
    const shared = filename.startsWith('public/build/') || filename.startsWith('ui/');
    if ((!owned && !shared) || (!html && !PUBLIC_ASSET.test(filename))) return res.status(404).end();
    try {
      // Old tabs may request an earlier generation after a server restart.
      // Reuse signed store verification, never accept a caller's directory.
      const selection = await inspectGeneration(moduleName, generationId);
      if (!owned) {
        // Shared ES modules keep their canonical URL and singleton identity.
        // Only the selected package's own assets use generation URLs.
        res.set('Cache-Control', 'no-store');
        return res.redirect(307, `/${filename.replace(/^public\//, '')}`);
      }
      const assetRoot = owned ? path.join(selection.moduleDir, BROWSER_PREFIX) :
        path.join(rootDir, filename.startsWith('public/build/') ? 'public/build' : 'ui');
      const relative = owned ? filename : filename.replace(/^(?:public\/build|ui)\//, '');
      const file = checkedFile(assetRoot, relative);
      // HTML includes launch query context; immutable caching is only for assets.
      res.set('Cache-Control', html ? 'no-store' : 'public, max-age=31536000, immutable');
      res.set('X-Content-Type-Options', 'nosniff');
      if (html) return res.type('html').send(versionHtml(await fs.promises.readFile(file, 'utf8'), moduleName, generationId));
      return res.sendFile(file);
    } catch (error) {
      const status = error.code === 'ENOENT' ? 404 : 503;
      res.set('Cache-Control', 'no-store');
      return res.status(status).json({ error: 'CORE_MODULE_BROWSER_ASSET_UNAVAILABLE' });
    }
  });
}

module.exports = { mountCoreModuleBrowserAssets, versionHtml };
