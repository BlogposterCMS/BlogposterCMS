const rateLimit = require('express-rate-limit');
const { rate } = require('../../config/security');

const logBlockedRequest = (type) => (req, res, next, options) => {
  console.warn(`[RateLimiter BLOCKED] (${type}) IP: ${req.ip}, URL: ${req.originalUrl}`);
  next();
};

const logLimitReached = (type) => (req, res, options) => {
  console.log(`[RateLimiter LIMIT REACHED] (${type}) IP: ${req.ip}, URL: ${req.originalUrl}`);
};

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

module.exports = { apiLimiter, loginLimiter };
