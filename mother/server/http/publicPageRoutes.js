'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { verifyOriginToken } = require('../security/originToken');
const { loadPublicPresentation, escapeHtml, scriptJson } = require('../../modules/pagesManager/publicPresentation');
const { renderPublicSeoHead } = require('../../modules/seoManager/publicHead');
const analyticsCollector = require('../../modules/analyticsManager/collector');
const { clientDimensions } = require('../../modules/analyticsManager/domain');

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

      const requestPublic = async (resource, action, params = {}) => {
        const result = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CMS_PUBLIC_RUNTIME_REQUEST, {
          jwt: global.pagesPublicToken,
          moduleName: 'runtimeManager',
          moduleType: 'core',
          resource, action, params
        });
        return result.data;
      };
      // Reuse the public facade's publication/lane filtering even for server HTML.
      // Never turn an admin session or a raw page record into public bootstrap data.
      // A signed preview renders the parent-owned draft. Its shell must also
      // boot on a fresh site without a published start page or matching slug.
      const page = livePreviewRequested
        ? { id: '__designer_live_preview__', slug, language: 'en' }
        : await requestPublic('pages', slug ? 'getBySlug' : 'start', { slug, language: 'en' });

      if (!page?.id) return next();

      const pageId = page.id;
      const lane = 'public';
      const token = global.pagesPublicToken;
      const slugToUse = slug || sanitizeSlug(page.slug);
      const nonce = crypto.randomBytes(16).toString('base64');
      const language = page.language || 'en';
      // Signed Designer previews get their state from the existing parent bridge.
      const presentation = livePreviewRequested ? null
        : await loadPublicPresentation(requestPublic, slugToUse, language);

      let html = await fs.promises.readFile(pageHtmlPath, 'utf8');
      if (presentation) {
        presentation.bootstrap.pathname = req.path;
        html = html.replace('<html ', '<html data-bp-public-layout-ready="true" ');
        html = html.replace(/<title>[\s\S]*?<\/title>/i,
          () => `<title>${escapeHtml(presentation.bootstrap.envelope.meta?.seoTitle || page.title || '')}</title>`);
        html = html.replace('</head>', () => presentation.head + '</head>');
        const seoHead = renderPublicSeoHead(presentation.bootstrap.envelope.meta, {
          baseUrl: process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`,
          pathname: req.path
        });
        html = html.replace('</head>', () => seoHead + '</head>');
        html = html.replace('<!-- public-initial-presentation -->', () => presentation.body);
      }
      if (renderMode === 'server') {
        html = html.replace(
          /<script type="module" src="\/build\/pageRenderer.js"><\/script>\s*/i,
          ''
        );
      }
      const inject = `<script nonce="${nonce}">
      window.PAGE_ID = ${scriptJson(pageId)};
      window.PAGE_SLUG = ${scriptJson(slugToUse)};
      window.LANE    = ${scriptJson(lane)};
      window.LANG = ${scriptJson(language)};
      window.PUBLIC_TOKEN = ${scriptJson(token)};
      window.PLAINSPACE_VERSION = ${scriptJson(plainSpaceVersion)};
      window.NONCE  = ${scriptJson(nonce)};
      ${presentation ? `window.BP_PUBLIC_BOOTSTRAP = ${scriptJson(presentation.bootstrap)};` : ''}
    </script>`;
      html = html.replace('</head>', () => inject + '</head>');
      html = injectDevReload(html);

      res.setHeader('Content-Security-Policy', `script-src 'self' blob: 'nonce-${nonce}';`);
      // The HTML contains a short-lived public token and a fresh CSP nonce.
      res.setHeader('Cache-Control', 'no-store');
      // Count completed public HTML deliveries, not internal renderer reads or
      // signed previews. DNT/GPC opt-outs do not enter visitor analytics.
      if (!livePreviewRequested && req.method === 'GET' && req.get('DNT') !== '1' && req.get('Sec-GPC') !== '1') {
        res.once('finish', () => {
          if (res.statusCode === 200) analyticsCollector.record({ kind: 'page', event: 'pageDelivered', page: String(pageId), outcome: 'success',
            ...clientDimensions(req.get('user-agent'), req.get('referer')) });
        });
      }
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
