/**
 *  config/runtime.js
 *  ------------------------------------------------------------------
 *  “Where do I put that port/path/feature‑flag again…?”
 *  Answer: here.
 *  This stays tiny: only VALUES – no logic please.
 *  ------------------------------------------------------------------ */

const env = process.env;
const appEnv = env.APP_ENV || 'development';

// Central production flag used across the app
const isProduction = appEnv === 'production';

module.exports = {
  appEnv,
  isProduction,
  /* HTTP & networking */
  port        : Number(env.PORT        ?? 3000),
  publicUrl   : env.PUBLIC_URL        ?? 'http://localhost:3000',
  behindProxy : env.TRUST_PROXY === 'false',      // if you use e.g. nginx / Heroku make it "true"

  /* Folders (resolved in mother/index.js) */
  paths: {
    public     : env.PUBLIC_PATH      ?? '../public',
    adminViews : env.ADMIN_VIEWS_PATH ?? 'views/admin-partials',
    assets     : env.ASSETS_PATH      ?? 'assets'
  },

  /* Feature Flags – flip without redeploying code */
  features: {
    enableMarketplace : env.FEAT_MARKETPLACE   === 'true',
    allowRegistration : env.ALLOW_REGISTRATION === 'true',
    renderMode: (env.RENDER_MODE || 'client').toLowerCase() === 'server' ? 'server' : 'client'
  }
};

/* Optional runtime.local.js (git‑ignored) */
try {
  const local = require('./runtime.local');
  const { features: localFeatures, ...rest } = local;
  Object.assign(module.exports, rest);
  if (localFeatures) {
    module.exports.features = {
      ...module.exports.features,
      ...localFeatures
    };
  }
  console.log('[RUNTIME] Loaded local overrides from config/runtime.local.js');
} catch { /* nothing to override – carry on */ }
