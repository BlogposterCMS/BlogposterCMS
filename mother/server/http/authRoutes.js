'use strict';

const { respondIfModuleUpdating } = require('../../utils/coreModuleAvailability');


const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const express = require('express');
const fs = require('fs');
const path = require('path');
const { canUseWeakLocalDevCredentials } = require('../../modules/auth/devAutoLogin');
const { sanitizeCookieName, sanitizeCookiePath } = require('../../utils/cookieUtils');
const { GENERIC_MESSAGE } = require('../../modules/userManagement/passwordRecoveryService');
const EMAIL_FIELD = '<div class="field"><input id="email" name="email" type="email" autocomplete="email" placeholder=" " required maxlength="254"><label for="email">Administrator email</label></div>';

function passwordField(token) {
  return `<input type="hidden" name="token" value="${escapeHtml(token)}">
    <div class="field"><input id="newPassword" name="newPassword" type="password" autocomplete="new-password" placeholder=" " required minlength="12" maxlength="256"><label for="newPassword">New password</label></div>
    <p>Use at least 12 characters with uppercase, lowercase and a number.</p>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function renderRecoveryPage({ csrfToken, title, action, fields = '', message = '', error = false }) {
  const notice = message ? `<p role="${error ? 'alert' : 'status'}" class="${error ? 'error-message' : ''}">${escapeHtml(message)}</p>` : '';
  const form = fields ? `<form method="post" action="${action}">
    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
    ${fields}
    <button type="submit" class="button primary block">${action.endsWith('forgot-password') ? 'Send reset link' : 'Set new password'}</button>
  </form>` : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - BlogposterCMS</title><link rel="stylesheet" href="/assets/css/site.css"></head>
<body><div class="app-scope login-page"><main class="login-form form-container">
  <img class="logo" src="/assets/icons/blogpostercms-logo.svg" alt="BlogposterCMS">
  <h1 class="cms-title">${escapeHtml(title)}</h1>${notice}${form}
  <div class="secondary-actions"><a class="text-link" href="/admin/login">Back to login</a>
    ${action.endsWith('reset-password') ? '<a class="text-link" href="/admin/forgot-password">Request a new link</a>' : ''}
  </div>
</main></div></body></html>`;
}

function sendRecoveryPage(res, options, status = 200) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Referrer-Policy', 'no-referrer');
  return res.status(status).send(renderRecoveryPage(options));
}

function renderLoginHtml({
  req,
  publicPath,
  injectDevBanner,
  isDevAutoLoginAllowed
}) {
  return Promise.resolve(isDevAutoLoginAllowed()).then(devAutoLoginAllowed => {
    let html = fs.readFileSync(path.join(publicPath, 'login.html'), 'utf8');
    html = html.replace('{{CSRF_TOKEN}}', req.csrfToken())
      .replace('{{LOGIN_NOTICE}}', req.query?.reset === 'success' ? '<div role="status" aria-live="polite">Your password has been reset. Log in with the new password.</div>' : '')
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
  passwordRecovery,
  publicPath,
  validateAdminToken
}) {
  const router = express.Router();

  router.get('/admin/forgot-password', csrfProtection, (req, res) => {
    sendRecoveryPage(res, {
      csrfToken: req.csrfToken(), title: 'Reset administrator password',
      action: '/admin/forgot-password',
      fields: EMAIL_FIELD,
      message: req.query?.sent === '1' ? GENERIC_MESSAGE : ''
    });
  });

  router.post('/admin/forgot-password', loginLimiter, csrfProtection, async (req, res) => {
    try {
      await passwordRecovery.requestReset(req.body?.email);
      return res.redirect(303, '/admin/forgot-password?sent=1');
    } catch (error) {
      if (respondIfModuleUpdating(res, error)) return;
      console.error(`[${error.code || 'ADMIN_RESET_REQUEST_FAILED'}]`, error.message);
      const known = ['ADMIN_RESET_EMAIL_INVALID', 'ADMIN_RESET_MAIL_UNAVAILABLE'].includes(error.code);
      return sendRecoveryPage(res, {
        csrfToken: req.csrfToken(), title: 'Reset administrator password',
        action: '/admin/forgot-password',
        fields: EMAIL_FIELD,
        message: known ? error.message : 'Password recovery is temporarily unavailable. Contact the site operator.', error: true
      }, error.code === 'ADMIN_RESET_EMAIL_INVALID' ? 400 : 503);
    }
  });

  router.get('/admin/reset-password', loginLimiter, csrfProtection, async (req, res) => {
    const token = typeof req.query?.token === 'string' ? req.query.token : '';
    try {
      await passwordRecovery.verifyToken(token);
      return sendRecoveryPage(res, {
        csrfToken: req.csrfToken(), title: 'Set a new password', action: '/admin/reset-password',
        fields: passwordField(token)
      });
    } catch (error) {
      if (respondIfModuleUpdating(res, error)) return;
      return sendRecoveryPage(res, {
        csrfToken: req.csrfToken(), title: 'Reset link unavailable', action: '/admin/reset-password',
        message: error.code === 'ADMIN_RESET_INVALID' ? error.message : 'Password recovery is temporarily unavailable. Contact the site operator.', error: true
      }, error.code === 'ADMIN_RESET_INVALID' ? 400 : 503);
    }
  });

  router.post('/admin/reset-password', loginLimiter, csrfProtection, async (req, res) => {
    try {
      await passwordRecovery.resetPassword(req.body?.token, req.body?.newPassword);
      return res.redirect(303, '/admin/login?reset=success');
    } catch (error) {
      if (respondIfModuleUpdating(res, error)) return;
      return sendRecoveryPage(res, {
        csrfToken: req.csrfToken(), title: 'Set a new password', action: '/admin/reset-password',
        fields: error.code === 'ADMIN_RESET_WEAK_PASSWORD' ? passwordField(typeof req.body?.token === 'string' ? req.body.token : '') : '',
        message: ['ADMIN_RESET_INVALID', 'ADMIN_RESET_WEAK_PASSWORD'].includes(error.code) ? error.message : 'Password recovery is temporarily unavailable. Contact the site operator.', error: true
      }, ['ADMIN_RESET_INVALID', 'ADMIN_RESET_WEAK_PASSWORD'].includes(error.code) ? 400 : 503);
    }
  });

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
      if (respondIfModuleUpdating(res, err)) return;
      console.warn('[LOGIN ROUTE] Login failed =>', err.message);
      return res.status(401).json({ success: false, error: err.message });
    }
  });

  router.get('/admin/logout', loginLimiter, (_req, res) => {
    res.clearCookie('admin_jwt', {
      path: sanitizeCookiePath('/'),
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction
    });
    res.redirect('/admin/login');
  });

  // Reserve CMS authentication for the admin namespace. Public /login pages and
  // site-owned redirect rules must continue through the public runtime.
  router.get('/admin/login', loginLimiter, csrfProtection, async (req, res) => {
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
          if (respondIfModuleUpdating(res, err)) return;
          console.warn('[GET /admin/login] Invalid admin token =>', err.message);
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
      if (respondIfModuleUpdating(res, err)) return;
      console.error('[GET /admin/login] Error:', err);
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
