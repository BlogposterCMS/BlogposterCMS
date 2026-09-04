'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { verifyOriginToken } = require('../security/originToken');

function createPublicPageRoutes({
  injectDevReload = html => html,
  motherEmitter,
  plainSpaceVersion,
  renderMode,
  rootDir,
  sanitizeSlug,
  securityConfig
}) {
  const router = express.Router();
  const pageHtmlPath = path.join(rootDir, 'public', 'index.html');
  const libraryRoot = path.join(process.cwd(), 'library');
  const builderPublicRoot = path.join(libraryRoot, 'public', 'builder');

  router.get('/p/*', async (req, res, next) => {
    try {
      // Express exposes the remainder of a wildcard route as parameter 0. Keep
      // every path segment so nested page slugs resolve through the same
      // sanitized page and builder boundaries as single-segment slugs.
      const slug = sanitizeSlug(req.params[0] || '');

      try {
        global.pagesPublicToken = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.ENSURE_PUBLIC_TOKEN, {
              currentToken: global.pagesPublicToken,
              purpose: 'public',
              moduleName: 'publicRoute',
              moduleType: 'core'
            });

        const page = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_PAGE_BY_SLUG, {
              jwt: global.pagesPublicToken,
              moduleName: 'pagesManager',
              moduleType: 'core',
              slug
            });

        if (page?.id) return next();
      } catch (lookupErr) {
        console.warn('[SERVER] /p/* lookup failed ->', lookupErr.message);
      }

      const filePath = path.join(builderPublicRoot, slug, 'index.html');
      if (!filePath.startsWith(builderPublicRoot) || !fs.existsSync(filePath)) {
        return next();
      }
      const html = await fs.promises.readFile(filePath, 'utf8');
      res.type('html');
      res.send(injectDevReload(html));
    } catch (err) {
      next(err);
    }
  });

  router.get('*', async (req, res, next) => {
    try {
      const livePreviewRequested = String(req.query?.['designer-live-preview'] || '') === '1';
      if (livePreviewRequested) {
        const verification = verifyOriginToken(req.query?.originToken, securityConfig);
        if (!verification.valid) {
          res.setHeader('Cache-Control', 'no-store');
          return res.status(403).json({
            error: 'Live Preview authorization failed.',
            code: verification.code
          });
        }
        // The signed, expiring Designer token is the only exception to the
        // global SAMEORIGIN frame policy. The outer app iframe remains sandboxed.
        res.removeHeader('X-Frame-Options');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
      }
      // The wildcard contains the pathname without the query string. Strip
      // only leading separators here; sanitizeSlug remains the authoritative
      // normalizer and length boundary before the database lookup.
      const requestedSlug = String(req.params[0] || '').replace(/^\/+/, '');
      const slug = sanitizeSlug(typeof requestedSlug === 'string' ? requestedSlug : '');

      try {
        global.pagesPublicToken = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.ENSURE_PUBLIC_TOKEN, {
              currentToken: global.pagesPublicToken,
              purpose: 'public',
              moduleName: 'publicRoute',
              moduleType: 'core'
            });
      } catch (tokenErr) {
        console.error('[SERVER] Failed to obtain public token ->', tokenErr);
        return res.status(500).send('Server misconfiguration');
      }

      const eventName = slug ? BACKEND_EVENTS.GET_PAGE_BY_SLUG : BACKEND_EVENTS.GET_START_PAGE;
      const payload = slug ? {
        jwt: global.pagesPublicToken,
        moduleName: 'pagesManager',
        moduleType: 'core',
        slug
      } : {
        jwt: global.pagesPublicToken,
        moduleName: 'pagesManager',
        moduleType: 'core'
      };
      const page = await requestBackendEvent(motherEmitter, eventName, payload);

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
      window.PLAINSPACE_VERSION = ${JSON.stringify(plainSpaceVersion)};
      window.NONCE  = ${JSON.stringify(nonce)};
    </script>`;
      html = html.replace('</head>', inject + '</head>');
      html = injectDevReload(html);

      res.setHeader('Content-Security-Policy', `script-src 'self' blob: 'nonce-${nonce}';`);
      res.send(html);
    } catch (err) {
      console.error('[SERVER] /* render error ->', err);
      next(err);
    }
  });

  return router;
}

module.exports = {
  createPublicPageRoutes
};
