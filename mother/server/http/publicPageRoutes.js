'use strict';

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');

function createPublicPageRoutes({
  activeTheme,
  motherEmitter,
  plainSpaceVersion,
  renderMode,
  rootDir,
  sanitizeSlug
}) {
  const router = express.Router();
  const pageHtmlPath = path.join(rootDir, 'public', 'index.html');
  const libraryRoot = path.join(process.cwd(), 'library');
  const builderPublicRoot = path.join(libraryRoot, 'public', 'builder');

  router.get('/p/:slug', async (req, res, next) => {
    try {
      const slug = sanitizeSlug(req.params.slug || '');

      try {
        global.pagesPublicToken = await new Promise((resolve, reject) => {
          motherEmitter.emit(
            'ensurePublicToken',
            {
              currentToken: global.pagesPublicToken,
              purpose: 'public',
              moduleName: 'publicRoute',
              moduleType: 'core'
            },
            (err, data) => (err ? reject(err) : resolve(data))
          );
        });

        const page = await new Promise((resolve, reject) => {
          motherEmitter.emit(
            'getPageBySlug',
            {
              jwt: global.pagesPublicToken,
              moduleName: 'pagesManager',
              moduleType: 'core',
              slug
            },
            (err, result) => (err ? reject(err) : resolve(result))
          );
        });

        if (page?.id) return next();
      } catch (lookupErr) {
        console.warn('[SERVER] /p/:slug lookup failed ->', lookupErr.message);
      }

      const filePath = path.join(builderPublicRoot, slug, 'index.html');
      if (!filePath.startsWith(builderPublicRoot) || !fs.existsSync(filePath)) {
        return next();
      }
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:slug?', async (req, res, next) => {
    try {
      const requestedSlug = req.params.slug;
      const slug = sanitizeSlug(typeof requestedSlug === 'string' ? requestedSlug : '');

      try {
        global.pagesPublicToken = await new Promise((resolve, reject) => {
          motherEmitter.emit(
            'ensurePublicToken',
            {
              currentToken: global.pagesPublicToken,
              purpose: 'public',
              moduleName: 'publicRoute',
              moduleType: 'core'
            },
            (err, data) => (err ? reject(err) : resolve(data))
          );
        });
      } catch (tokenErr) {
        console.error('[SERVER] Failed to obtain public token ->', tokenErr);
        return res.status(500).send('Server misconfiguration');
      }

      const page = await new Promise((resolve, reject) => {
        const eventName = slug ? 'getPageBySlug' : 'getStartPage';
        const payload = slug
          ? { jwt: global.pagesPublicToken, moduleName: 'pagesManager', moduleType: 'core', slug }
          : { jwt: global.pagesPublicToken, moduleName: 'pagesManager', moduleType: 'core' };

        motherEmitter.emit(eventName, payload, (err, record) => {
          if (err) return reject(err);
          resolve(record);
        });
      });

      if (!page?.id) return next();

      const pageId = page.id;
      const lane = 'public';
      const token = global.pagesPublicToken;
      const slugToUse = slug || sanitizeSlug(page.slug);
      const nonce = crypto.randomBytes(16).toString('base64');

      let html = fs.readFileSync(pageHtmlPath, 'utf8');
      if (renderMode === 'server') {
        html = html.replace(
          /<script type="module" src="\/build\/pageRenderer.js"><\/script>\s*/i,
          ''
        );
      }
      const inject = `<script nonce="${nonce}">
      window.PAGE_ID = ${JSON.stringify(pageId)};
      window.PAGE_SLUG = ${JSON.stringify(slugToUse)};
      window.LANE    = ${JSON.stringify(lane)};
      window.PUBLIC_TOKEN = ${JSON.stringify(token)};
      window.ACTIVE_THEME = ${JSON.stringify(activeTheme)};
      window.PLAINSPACE_VERSION = ${JSON.stringify(plainSpaceVersion)};
      window.NONCE  = ${JSON.stringify(nonce)};
    </script>`;
      html = html.replace('</head>', inject + '</head>');

      res.setHeader('Content-Security-Policy', `script-src 'self' blob: 'nonce-${nonce}';`);
      res.send(html);
    } catch (err) {
      console.error('[SERVER] /:slug render error ->', err);
      next(err);
    }
  });

  return router;
}

module.exports = {
  createPublicPageRoutes
};
