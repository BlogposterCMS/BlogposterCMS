/**
 *  config/security.js
 *  ==================================================================
 *  One file to rule all “DON’T‑HACK‑ME‑BRO” knobs ‑ and in the darkness
 *  bind them.
 *
 *    – Ships with sensible defaults for local dev.
 *    – Every setting can be overridden…
 *        • via   .env                  (CI/CD‑friendly)      OR
 *        • via   config/security.local.js  (git‑ignored).
 *    – Route files must never hard‑code magic numbers again.
 *  ================================================================== */

const env = process.env;

/*─────────────────────────────────────────────────────────────────────*
 *  #1  RATE LIMITER CONFIG
 *─────────────────────────────────────────────────────────────────────*/
const rate = {
  /* Login brute‑force – block after n tries in t window. */
  login : {
    windowMs        : 15 * 60 * 1000,      // 15 min
    max             : 10,                  // 10 shots ⇒ coffee‑break
    message         : { error: 'Too many login attempts – try again later.' },
    /* Header style (see express‑rate‑limit docs) */
    standardHeaders : true,
    legacyHeaders   : false
  }
};

/* .env overrides – operators can tune without touching code */
rate.login.windowMs = Number(env.LOGIN_LIMIT_WINDOW_MS ?? rate.login.windowMs);
rate.login.max      = Number(env.LOGIN_LIMIT_MAX       ?? rate.login.max);

/*─────────────────────────────────────────────────────────────────────*
 *  #2  CSRF CONFIG
 *─────────────────────────────────────────────────────────────────────*/
const csrf = {
  cookieName  : env.CSRF_COOKIE  ?? 'blog_csrf',
  headerName  : env.CSRF_HEADER  ?? 'x-csrf-token',
  ignoredPaths: ['/admin/api/auth/login']  // GET/HEAD only = harmless
};

/*─────────────────────────────────────────────────────────────────────*
 *  #3  EXPORT  – keep the shape tiny & predictable
 *      ⇒  require('config/security').rate.login.*
 *─────────────────────────────────────────────────────────────────────*/
module.exports = { rate, csrf };

/*─────────────────────────────────────────────────────────────────────*
 *  #4  OPTIONAL LOCAL OVERRIDES
 *      Just drop a   config/security.local.js   (in .gitignore)
 *      that `module.exports = { … }` and we deep‑merge it.
 *─────────────────────────────────────────────────────────────────────*/
try {
  Object.assign(module.exports, require('./security.local'));
  console.log('[SECURITY] Loaded local overrides from config/security.local.js');
} catch {
  /* totally fine – most setups won’t have a local override */
}
