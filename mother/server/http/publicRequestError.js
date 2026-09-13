'use strict';

const UNAVAILABLE_CODES = new Set([
  'EVENT_CONTRACT_TIMEOUT', 'EVENT_CONTRACT_DISPATCH_REJECTED',
  'CORE_MODULE_UPDATING', 'CORE_MODULE_SCOPE_CLOSED',
  'CORE_MODULE_CREDENTIAL_ISSUANCE_FAILED', 'AUTH_TOKEN_EXPIRED',
  'SQLITE_BUSY', 'SQLITE_LOCKED', 'ECONNREFUSED', 'ETIMEDOUT'
]);

function publicRequestError(error, _req, res, next) {
  if (res.headersSent) return next(error);
  let unavailable = false;
  let cause = error;
  for (let depth = 0; cause && depth < 6; depth += 1, cause = cause.cause) {
    if (UNAVAILABLE_CODES.has(cause.code)) { unavailable = true; break; }
  }
  const code = unavailable ? 'BLOGPOSTER_PUBLIC_UNAVAILABLE' : 'BLOGPOSTER_PUBLIC_REQUEST_FAILED';
  // Error payloads can contain credentials or content. Keep the public boundary bounded.
  console.error(`[${code}]`);
  res.set('Cache-Control', 'no-store');
  res.set('X-Blogposter-Error', code);
  if (unavailable) res.set('Retry-After', '30');
  return res.status(unavailable ? 503 : 500).type('text/plain')
    .send('This page is temporarily unavailable. Please try again later.');
}

module.exports = { publicRequestError };
