'use strict';

const Tokens = require('csrf');
const cookie = require('cookie');
const { csrf: csrfConfig } = require('../../config/security');
const { sanitizeCookieName, sanitizeCookiePath } = require('./cookieUtils');

const tokens = new Tokens();
const isProduction = process.env.NODE_ENV === 'production';

function csrfProtection(req, res, next) {
  if (csrfConfig.ignoredPaths.includes(req.path)) {
    return next();
  }

  const cookies = req.cookies || cookie.parse(req.headers.cookie || '');
  let secret = cookies[csrfConfig.cookieName];

  if (!secret) {
    secret = tokens.secretSync();
    res.cookie(
      sanitizeCookieName(csrfConfig.cookieName),
      secret,
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction,
        path: sanitizeCookiePath('/')
      }
    );
  }

  req.csrfToken = () => tokens.create(secret);

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const token = req.headers[csrfConfig.headerName] || req.body?._csrf || req.query?._csrf;
  if (!token || !tokens.verify(secret, token)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
}

module.exports = csrfProtection;

