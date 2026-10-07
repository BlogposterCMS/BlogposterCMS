'use strict';

const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const httpsRedirect = require('../../utils/httpsRedirect');
const limitedApps = new WeakSet();

function mountRequestLimits(app) {
  if (limitedApps.has(app)) return;
  // Static routes intentionally precede Helmet/HTTPS. Register only the work
  // limit before them so their existing CORS and sandbox contracts stay intact.
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(value => value.trim()));
  else app.set('trust proxy', false);
  const requestLimit = Number(process.env.HTTP_RATE_LIMIT_MAX || 3000);
  if (!Number.isSafeInteger(requestLimit) || requestLimit < 1) {
    throw Object.assign(new Error('HTTP_RATE_LIMIT_CONFIG_INVALID'), { code: 'HTTP_RATE_LIMIT_CONFIG_INVALID' });
  }
  app.use(rateLimit({ windowMs: 60 * 1000, limit: requestLimit,
    standardHeaders: true, legacyHeaders: false, message: { error: 'HTTP_RATE_LIMIT_EXCEEDED' } }));
  limitedApps.add(app);
}

function mountSecurityMiddleware(app, { isProduction }) {
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(value => value.trim()));
  } else {
    app.set('trust proxy', false);
  }

  app.use(helmet());

  mountRequestLimits(app);

  if (isProduction) {
    app.use(httpsRedirect);
  }

  const bodyLimit = process.env.BODY_LIMIT || '20mb';
  app.use(bodyParser.json({ limit: bodyLimit }));
  app.use(bodyParser.urlencoded({ extended: true, limit: bodyLimit }));
  app.use(cookieParser());
}

module.exports = {
  mountSecurityMiddleware,
  mountRequestLimits
};
