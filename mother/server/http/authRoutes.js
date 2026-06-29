'use strict';

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

function createAuthRoutes({
  csrfProtection,
  injectDevBanner,
  isDevAutoLoginAllowed,
  isProduction,
  loginLimiter,
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
      const loginJwt = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'issuePublicToken',
          { purpose: 'login', moduleName: 'auth' },
          (err, token) => err ? reject(err) : resolve(token)
        );
      });

      const user = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'loginWithStrategy',
          {
            jwt: loginJwt,
            moduleName: 'loginRoute',
            moduleType: 'public',
            strategy: 'adminLocal',
            payload: { username, password }
          },
          (err, result) => {
            if (err) return reject(err);
            if (!result) return reject(new Error('Invalid credentials'));
            resolve(result);
          }
        );
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
  renderLoginHtml
};
