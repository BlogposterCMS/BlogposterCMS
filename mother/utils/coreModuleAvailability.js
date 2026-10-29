'use strict';

/** Update pauses are availability failures, never evidence of invalid credentials. */
function isModuleUpdating(error) {
  for (let depth = 0; error && depth < 8; depth++, error = error.cause) {
    if (error.code === 'CORE_MODULE_UPDATING') return true;
  }
  return false;
}

function respondIfModuleUpdating(res, error) {
  if (!isModuleUpdating(error)) return false;
  res.setHeader('Retry-After', '1');
  res.setHeader('Cache-Control', 'no-store');
  res.status(503).json({ ok: false, code: 'CORE_MODULE_UPDATING',
    error: 'A module is being updated. Please retry shortly.' });
  return true;
}

module.exports = { isModuleUpdating, respondIfModuleUpdating };
