'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const express = require('express');
const fs = require('fs');
const path = require('path');
const { canUseWeakLocalDevCredentials } = require('../../modules/auth/devAutoLogin');
const { sanitizeCookieName, sanitizeCookiePath } = require('../../utils/cookieUtils');

function renderLoginHtml({
  req,
  publicPath,
  injectDevBanner,
  isDevAutoLoginAllowed
}) {
  return Promise.resolve(isDevAutoLoginAllowed()).then(devAutoLoginAllowed => {
    let html = fs.readFileSync(path.join(publicPath, 'login.html'), 'utf8');
    html = html.replace('{{CSRF_TOKEN}}', req.csrfToken())
      .replace('{{DEV_AUTOLOGIN}}', devAutoLoginAllowed ? 'true' : '')
      .replace('{{DEV_USER}}', process.env.DEV_USER || 'admin')
      .replace('{{ALLOW_WEAK_CREDS}}', canUseWeakLocalDevCredentials(req) ? 'true' : '');
    return injectDevBanner(html);
  });
}

function safeAdminRedirectTarget(rawRedirect) {
  const fallback = '/admin/home';
  const raw = typeof rawRedirect === 'string' ? rawRedirect.trim() : '';
  if (!raw) return fallback;

  try {
    const url = new URL(raw, 'http://blogposter.local');
    if (url.origin !== 'http://blogposter.local' || !url.pathname.startsWith('/admin')) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function createAuthRoutes({
  csrfProtection,
  injectDevBanner,
  isDevAutoLoginAllowed,
  isProduction,
  loginLimiter,
  maybeIssueDevAdminSession = async () => null,
  motherEmitter,
  needsInitialSetup,
  publicPath,
  validateAdminToken
}) {
  const router = express.Router();

  router.post('/admin/api/login', loginLimiter, csrfProtection, async (req, res) => {
    const { username, password } = req.body;
    const weakPw = typeof password === 'string' && password.length < 12;
    const weakCreds = (username === 'admin' && password === '123') || weakPw;
    if (weakCreds) {
      const allowWeak = canUseWeakLocalDevCredentials(req);
      if (isProduction || !allowWeak) {
        return res
          .status(401)
          .json({ success: false, error: 'Weak credentials not allowed' });
      }
    }

    try {
      const loginJwt = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.ISSUE_PUBLIC_TOKEN, { purpose: 'login', moduleName: 'auth' });

      const user = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.LOGIN_WITH_STRATEGY, {
  jwt: loginJwt,
  moduleName: 'loginRoute',
  moduleType: 'public',
  strategy: 'adminLocal',
  payload: {
    username,
    password
  }
}).then(result => {
  if (!result) throw new Error('Invalid credentials');
  return result;
}, err => {
  throw err;
});

      const secureFlag = isProduction;
      if (secureFlag && req.protocol !== 'https') {
        console.warn('[LOGIN ROUTE] Secure cookie requested over non-HTTPS connection. Cookie may be ignored by the browser.');
      }

      res.cookie(sanitizeCookieName('admin_jwt'), user.jwt, {
        path: sanitizeCookiePath('/'),
        httpOnly: true,
        sameSite: 'strict',
        secure: secureFlag,
        maxAge: 2 * 60 * 60 * 1000
      });

      console.log(`[LOGIN ROUTE] User "${username}" authenticated successfully.`);
      return res.json({ success: true });
    } catch (err) {
      console.warn('[LOGIN ROUTE] Login failed =>', err.message);
      return res.status(401).json({ success: false, error: err.message });
    }
  });

  router.get('/admin/logout', (_req, res) => {
    res.clearCookie('admin_jwt', {
      path: sanitizeCookiePath('/'),
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction
    });
    res.redirect('/login');
  });

  router.get('/login', csrfProtection, async (req, res) => {
    try {
      if (await needsInitialSetup()) {
        return res.redirect('/install');
      }

      const adminJwt = req.cookies?.admin_jwt;
      if (adminJwt) {
        try {
          await validateAdminToken(adminJwt);
          return res.redirect('/admin/home');
        } catch (err) {
          console.warn('[GET /login] Invalid admin token =>', err.message);
          res.clearCookie('admin_jwt', {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: isProduction
          });
        }
      }

      const devJwt = await maybeIssueDevAdminSession(req, res, 'login route');
      if (devJwt) {
        return res.redirect(safeAdminRedirectTarget(req.query?.redirectTo));
      }

      const html = await renderLoginHtml({
        req,
        publicPath,
        injectDevBanner,
        isDevAutoLoginAllowed
      });
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.send(html);
    } catch (err) {
      console.error('[GET /login] Error:', err);
      res.status(500).send('Server misconfiguration');
    }
  });

  return router;
}

module.exports = {
  createAuthRoutes,
  renderLoginHtml,
  safeAdminRedirectTarget
};
