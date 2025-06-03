const rateLimit = require('express-rate-limit');
const { rate } = require('../../config/security');

const apiLimiter = rateLimit({
  windowMs: rate.api.windowMs,
  max: rate.api.max,
  message: rate.api.message,
  standardHeaders: rate.api.standardHeaders,
  legacyHeaders: rate.api.legacyHeaders
});

const loginLimiter = rateLimit({
  windowMs: rate.login.windowMs,
  max: rate.login.max,
  message: rate.login.message,
  standardHeaders: rate.login.standardHeaders,
  legacyHeaders: rate.login.legacyHeaders
});

const pageLimiter = rateLimit({
  windowMs: rate.pages.windowMs,
  max: rate.pages.max,
  message: rate.pages.message,
  standardHeaders: rate.pages.standardHeaders,
  legacyHeaders: rate.pages.legacyHeaders
});

module.exports = { apiLimiter, loginLimiter, pageLimiter };
