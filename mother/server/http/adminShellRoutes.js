'use strict';

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { hasPermission } = require('../../modules/userManagement/permissionUtils');
const { createOriginToken } = require('../security/originToken');

function prepareAdminShellHtml({
  activeTheme,
  adminToken,
  csrfToken,
  escapeHtml,
  injectDevBanner,
  pageId,
  plainSpaceVersion,
  publicPath,
  renderMode,
  slug
}) {
  const nonce = crypto.randomBytes(16).toString('base64');
  let html = fs.readFileSync(path.join(publicPath, 'admin.html'), 'utf8');
  if (renderMode === 'server') {
    html = html.replace(
      /<script type="module" src="\/build\/pageRenderer.js"><\/script>\s*/i,
      ''
    );
  }

  const csrfSafe = escapeHtml(csrfToken);
  const headInjection = `
      <meta name="csrf-token" content="${csrfSafe}">
      <script nonce="${nonce}">
        window.CSRF_TOKEN = ${JSON.stringify(csrfToken)};
        window.PAGE_ID     = ${JSON.stringify(pageId ?? null)};
        window.PAGE_SLUG   = ${JSON.stringify(slug)};
        window.ADMIN_TOKEN = ${JSON.stringify(adminToken)};
        window.ACTIVE_THEME = ${JSON.stringify(activeTheme)};
        window.PLAINSPACE_VERSION = ${JSON.stringify(plainSpaceVersion)};
        window.NONCE       = ${JSON.stringify(nonce)};
      </script>
    </head>`;

  html = html.replace('</head>', headInjection);
  html = injectDevBanner(html);

  return { html, nonce };
}

function fetchAdminPageBySlug({ adminJwt, motherEmitter, slug }) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'getPageBySlug',
      {
        jwt: adminJwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        slug,
        lane: 'admin'
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
  });
}

function createAdminAppFrameHtml({
  adminJwt,
  appName,
  configuredOrigins,
  csrfToken,
  escapeHtml,
  iframeSrc,
  injectDevBanner,
  manifest,
  originPublicKeyBase64,
  originToken,
  pageTitle
}) {
  const titleSafe = escapeHtml(pageTitle);
  const csrfSafe = escapeHtml(csrfToken);
  const adminSafe = escapeHtml(adminJwt);
  const appSafe = escapeHtml(appName);
  const allowedOriginsSafe = escapeHtml(configuredOrigins.join(','));
  const originPublicKeySafe = escapeHtml(originPublicKeyBase64);
  const agentSurfaceConfig = manifest.agentSurface
    ? (manifest.agentSurface === true ? 'true' : JSON.stringify(manifest.agentSurface))
    : '';
  const agentSurfaceSafe = escapeHtml(agentSurfaceConfig);
  const originTokenAttr = originToken ? ` data-origin-token="${escapeHtml(originToken)}"` : '';
  const appSandbox = 'allow-scripts allow-forms allow-downloads allow-popups allow-modals';

  let html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${titleSafe}</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="${csrfSafe}"><meta name="admin-token" content="${adminSafe}"><meta name="app-name" content="${appSafe}"><meta name="app-agent-surface" content="${agentSurfaceSafe}"><meta name="app-frame-allowed-origins" content="${allowedOriginsSafe}"><meta name="app-frame-origin-public-key" content="${originPublicKeySafe}"><link rel="stylesheet" href="/assets/css/app.css"><script src="/build/meltdownEmitter.js"></script><script src="/build/openExplorer.js"></script><script type="module" src="/build/agentConsole.js"></script><script type="module" src="/build/appFrameLoader.js"></script></head><body class="dashboard-app"><iframe id="app-frame" src="${iframeSrc}" data-allowed-origins="${allowedOriginsSafe}"${originTokenAttr} sandbox="${appSandbox}" allow="clipboard-read; clipboard-write" referrerpolicy="origin" frameborder="0" style="width:100%;height:100vh;overflow:hidden;"></iframe></body></html>`;
  html = injectDevBanner(html);
  return html;
}

function createAdminShellRoutes({
  activeTheme,
  csrfProtection,
  dispatchAppLoaderEvent,
  escapeHtml,
  injectDevBanner,
  isDevAutoLoginAllowed,
  isProduction,
  maybeIssueDevAdminSession,
  motherEmitter,
  needsInitialSetup,
  plainSpaceVersion,
  publicPath,
  renderMode,
  rootDir,
  sanitizeSlug,
  securityConfig,
  validateAdminToken
}) {
  const router = express.Router();

  router.get('/admin', csrfProtection, async (_req, res) => {
    try {
      if (await needsInitialSetup()) {
        return res.redirect('/install');
      }
      return res.redirect('/login');
    } catch (err) {
      console.error('[GET /admin] Error:', err);
      return res.redirect('/login');
    }
  });

  router.get('/admin/home', csrfProtection, async (req, res) => {
    try {
      if (await needsInitialSetup()) {
        return res.redirect('/install');
      }

      if (req.cookies?.admin_jwt) {
        try {
          await validateAdminToken(req.cookies.admin_jwt);
          const slug = sanitizeSlug('home');
          let pageId = null;
          try {
            const page = await fetchAdminPageBySlug({
              adminJwt: req.cookies.admin_jwt,
              motherEmitter,
              slug
            });
            if (page?.id) pageId = page.id;
          } catch (pageErr) {
            console.warn('[GET /admin/home] Failed to load home page context =>', pageErr.message);
          }

          const { html, nonce } = prepareAdminShellHtml({
            activeTheme,
            adminToken: req.cookies.admin_jwt,
            csrfToken: req.csrfToken(),
            escapeHtml,
            injectDevBanner,
            pageId,
            plainSpaceVersion,
            publicPath,
            renderMode,
            slug
          });

          res.setHeader('Content-Security-Policy', `script-src 'self' blob: 'nonce-${nonce}';`);
          return res.send(html);
        } catch (err) {
          console.warn('[GET /admin/home] Invalid admin token =>', err.message);
          res.clearCookie('admin_jwt', {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: isProduction
          });
        }
      }

      const devAutoLoginAllowed = await isDevAutoLoginAllowed();
      let html = fs.readFileSync(path.join(publicPath, 'login.html'), 'utf8');
      html = html.replace('{{CSRF_TOKEN}}', req.csrfToken())
        .replace('{{DEV_AUTOLOGIN}}', devAutoLoginAllowed ? 'true' : '')
        .replace('{{DEV_USER}}', process.env.DEV_USER || '')
        .replace('{{ALLOW_WEAK_CREDS}}', (process.env.ALLOW_WEAK_CREDS === 'I_KNOW_THIS_IS_LOCAL') ? 'true' : '');
      html = injectDevBanner(html);
      return res.send(html);
    } catch (err) {
      console.error('[ADMIN /home] Error:', err);
      const devAutoLoginAllowed = await isDevAutoLoginAllowed();
      let html = fs.readFileSync(path.join(publicPath, 'login.html'), 'utf8');
      html = html.replace('{{CSRF_TOKEN}}', req.csrfToken())
        .replace('{{DEV_AUTOLOGIN}}', devAutoLoginAllowed ? 'true' : '')
        .replace('{{DEV_USER}}', process.env.DEV_USER || '')
        .replace('{{ALLOW_WEAK_CREDS}}', (process.env.ALLOW_WEAK_CREDS === 'I_KNOW_THIS_IS_LOCAL') ? 'true' : '');
      html = injectDevBanner(html);
      return res.send(html);
    }
  });

  router.get('/admin/studio/design/:designId?', csrfProtection, (req, res) => {
    const designId = String(req.params.designId || '').replace(/[\r\n/\\]/g, '').trim();
    const queryIndex = req.originalUrl.indexOf('?');
    const queryString = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    const target = designId
      ? `/admin/app/designer/${encodeURIComponent(designId)}`
      : '/admin/app/designer';
    return res.redirect(302, `${target}${queryString}`);
  });

  router.get('/admin/app/:appName/:pageId?', csrfProtection, async (req, res) => {
    const adminJwt = req.cookies?.admin_jwt;
    if (!adminJwt) {
      const jump = `/login?redirectTo=${encodeURIComponent(req.originalUrl)}`;
      return res.redirect(jump);
    }

    let decoded;
    try {
      decoded = await validateAdminToken(adminJwt);
    } catch (err) {
      console.warn('[GET /admin/app] Invalid admin token =>', err.message);
      res.clearCookie('admin_jwt', {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction
      });
      const jump = `/login?redirectTo=${encodeURIComponent(req.originalUrl)}`;
      return res.redirect(jump);
    }

    const appName = sanitizeSlug(req.params.appName);
    const appDir = path.join(rootDir, 'apps', appName);
    let launchInfo;
    try {
      launchInfo = await dispatchAppLoaderEvent(adminJwt, decoded, 'getAppLaunchInfo', { appName });
    } catch (err) {
      console.warn('[GET /admin/app] launch info failed =>', err.message);
      if (/Forbidden/i.test(err.message)) return res.status(403).send('Forbidden');
      if (/Unknown app|Missing app\.json|Invalid app name/i.test(err.message)) {
        return res.status(404).send('App not found');
      }
      return res.status(500).send('Invalid app manifest');
    }

    const manifest = launchInfo?.appInfo || {};
    if (
      Array.isArray(manifest.permissions) &&
      !manifest.permissions.every(permission => hasPermission(decoded, permission))
    ) {
      return res.status(403).send('Forbidden');
    }

    const indexPath = path.join(appDir, 'index.html');
    if (!launchInfo.isActive || !manifest.hasIndexHtml || !manifest.isBuilt || !fs.existsSync(indexPath)) {
      return res.status(500).send('App build missing');
    }

    const requiredEvents = Array.isArray(manifest.requiredEvents) ? manifest.requiredEvents : [];
    const missingEvents = requiredEvents.filter(eventName => !motherEmitter.listenerCount(eventName));
    if (missingEvents.length) {
      const appSafe = escapeHtml(appName);
      const missingList = missingEvents.map(eventName => `<li>${escapeHtml(eventName)}</li>`).join('');
      const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${appSafe} unavailable</title></head>` +
        `<body class="dashboard-app"><p>App "${appSafe}" cannot start because required API events are missing:</p><ul>${missingList}</ul></body></html>`;
      return res.status(503).send(html);
    }

    const idParam = sanitizeSlug(req.params.pageId || '');
    let pageTitle = manifest.title || manifest.name || 'App';
    let designVersion = null;
    let pageId = null;
    let designId = null;
    if (appName === 'designer' && idParam) {
      designId = idParam;
      try {
        const design = await new Promise((resolve, reject) => {
          motherEmitter.emit('designer.getDesign', { id: designId }, (err, result) => {
            if (err) return reject(err);
            resolve(result);
          });
        });
        if (design?.design?.title) pageTitle = design.design.title;
        const dv = parseInt(design?.design?.version, 10);
        if (!Number.isNaN(dv)) designVersion = String(dv);
      } catch (err) {
        console.warn('[GET /admin/app] failed to fetch design title =>', err.message);
      }
    } else if (idParam) {
      pageId = idParam;
    }

    const configuredOrigins = Array.isArray(securityConfig.postMessage?.allowedOrigins)
      ? securityConfig.postMessage.allowedOrigins.filter(Boolean)
      : [];
    const requestHost = req.get('host');
    if (requestHost) {
      try {
        const origin = new URL(`${req.protocol}://${requestHost}`).origin;
        if (!configuredOrigins.includes(origin)) configuredOrigins.push(origin);
      } catch (err) {
        console.warn('[GET /admin/app] Failed to derive request origin =>', err.message);
      }
    }

    const queryParams = new URLSearchParams();
    if (appName === 'designer' && designId) {
      queryParams.set('designId', designId);
      if (designVersion) queryParams.set('designVersion', designVersion);
    } else if (pageId) {
      queryParams.set('pageId', pageId);
    }

    let originToken = null;
    const originPublicKeyPem = securityConfig.postMessage?.originToken?.publicKey || '';
    const originPublicKeyBase64 = originPublicKeyPem
      ? Buffer.from(originPublicKeyPem, 'utf8').toString('base64')
      : '';
    if (configuredOrigins.length) {
      originToken = createOriginToken(configuredOrigins, securityConfig);
      if (originToken) queryParams.set('originToken', originToken);
    }

    const queryString = queryParams.toString();
    const iframeSrc = `/apps/${appName}/index.html${queryString ? `?${queryString}` : ''}`;
    const html = createAdminAppFrameHtml({
      adminJwt,
      appName,
      configuredOrigins,
      csrfToken: req.csrfToken(),
      escapeHtml,
      iframeSrc,
      injectDevBanner,
      manifest,
      originPublicKeyBase64,
      originToken,
      pageTitle
    });
    return res.send(html);
  });

  router.get('/admin/*', csrfProtection, async (req, res, next) => {
    let adminJwt = req.cookies?.admin_jwt;

    if (!adminJwt) {
      adminJwt = await maybeIssueDevAdminSession(req, res, 'admin wildcard');
    }

    if (!adminJwt) {
      const jump = `/login?redirectTo=${encodeURIComponent(req.originalUrl)}`;
      return res.redirect(jump);
    }

    try {
      await validateAdminToken(adminJwt);
    } catch (err) {
      console.warn('[GET /admin/*] Invalid admin token =>', err.message);
      res.clearCookie('admin_jwt', {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction
      });
      const jump = `/login?redirectTo=${encodeURIComponent(req.originalUrl)}`;
      return res.redirect(jump);
    }

    let rawSlug = req.params[0] || '';
    let pageId = null;
    const lastSlash = rawSlug.lastIndexOf('/');
    if (lastSlash !== -1) {
      const maybeId = rawSlug.slice(lastSlash + 1);
      if (/^\d+$/.test(maybeId)) {
        pageId = parseInt(maybeId, 10) || null;
        rawSlug = rawSlug.slice(0, lastSlash);
      } else if (/^[a-f0-9]{24}$/i.test(maybeId)) {
        pageId = maybeId.toLowerCase();
        rawSlug = rawSlug.slice(0, lastSlash);
      }
    }

    const slug = sanitizeSlug(rawSlug);

    try {
      const page = await fetchAdminPageBySlug({ adminJwt, motherEmitter, slug });
      if (!page?.id || page.lane !== 'admin') return next();

      const { html, nonce } = prepareAdminShellHtml({
        activeTheme,
        adminToken: adminJwt,
        csrfToken: req.csrfToken(),
        escapeHtml,
        injectDevBanner,
        pageId: pageId ?? page.id,
        plainSpaceVersion,
        publicPath,
        renderMode,
        slug
      });

      res.setHeader('Content-Security-Policy', `script-src 'self' blob: 'nonce-${nonce}';`);
      res.send(html);
    } catch (err) {
      console.error('[ADMIN /admin/*] Error:', err);
      next(err);
    }
  });

  return router;
}

module.exports = {
  createAdminAppFrameHtml,
  createAdminShellRoutes,
  fetchAdminPageBySlug,
  prepareAdminShellHtml
};
