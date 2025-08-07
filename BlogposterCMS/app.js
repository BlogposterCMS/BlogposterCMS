/**
 * app.js
 *
 * Steps to achieve the apparently impossible:
 * 1) Load .env
 * 2) Possibly load local "secret overrides"
 * 3) Initialize Express + middlewares
 * 4) Load core modules (Auth, DB, etc.) – fatal on error
 * 5) Load optional modules (moduleLoader) – non‑fatal on error
 * 6) Mount STATIC assets (before CSRF / API routes)
 * 7) Mount CSRF guard on /admin/api
 * 8) Mount JSON‑auth, API, SPA & public routes
 * 9) Start the server
 */

'use strict';
require('dotenv').config();

const fs           = require('fs');
const path         = require('path');
const express      = require('express');
const helmet       = require('helmet');
const bodyParser   = require('body-parser');
const cookieParser = require('cookie-parser');
const csurf        = require('csurf');
const { loginLimiter } = require('./mother/utils/rateLimiters');
const crypto = require('crypto');
const { sanitizeCookieName, sanitizeCookiePath, sanitizeCookieDomain } = require('./mother/utils/cookieUtils');
const { isProduction, features } = require('./config/runtime');
const renderMode = features?.renderMode || 'client';
const { hasPermission } = require('./mother/modules/userManagement/permissionUtils');






const { motherEmitter, meltdownForModule } = require('./mother/emitters/motherEmitter');
const moduleNameFromStack = require('./mother/utils/moduleNameFromStack');

function handleGlobalError(err) {
  console.error('[GLOBAL] Unhandled error =>', err);

  const moduleName = moduleNameFromStack(err.stack || '');
  if (moduleName) {
    meltdownForModule(err.message, moduleName, motherEmitter);
  }
}

process.on('uncaughtException', handleGlobalError);
process.on('unhandledRejection', (reason) => {
  let err;
  if (reason instanceof Error) {
    err = reason;
  } else if (reason && typeof reason === 'object' && reason.stack) {
    err = new Error(String(reason.message || reason.toString()));
    err.stack = reason.stack;
  } else {
    err = new Error(String(reason));
  }
  handleGlobalError(err);
});

//───────────────────────────────────────────────────────────────────────────
// ENV sanity checks
//───────────────────────────────────────────────────────────────────────────
function abort(msg, howToFix) {
  console.error('\n==================  BLOGPOSTER CMS – CONFIG ERROR  ==================');
  console.error('✖ ' + msg);
  if (howToFix) {
    console.error('\nHow to fix:');
    console.error('  → ' + howToFix.split('\n').join('\n  '));
  }
  console.error('=====================================================================\n');
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
  abort(
    'Missing or too‑short JWT_SECRET (min. 64 random hex chars).',
    'Run:\n' +
    '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
    'and add it to .env as JWT_SECRET=<paste>'
  );
}

if (!process.env.AUTH_MODULE_INTERNAL_SECRET || process.env.AUTH_MODULE_INTERNAL_SECRET.length < 48) {
  abort(
    'Missing/short AUTH_MODULE_INTERNAL_SECRET (min. 48 chars).',
    'Run:\n' +
    '  node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"\n' +
    'and add it to .env as AUTH_MODULE_INTERNAL_SECRET=<paste>'
  );
}

//───────────────────────────────────────────────────────────────────────────
// Salts & token configs
//───────────────────────────────────────────────────────────────────────────
const JWT_SECRET         = process.env.JWT_SECRET;
const AUTH_MODULE_SECRET = process.env.AUTH_MODULE_INTERNAL_SECRET;
const userPasswordSalt   = process.env.USER_PASSWORD_SALT || '';
const moduleDbSalt       = process.env.MODULE_DB_SALT     || '';
const tokenSalts = {
  high  : process.env.TOKEN_SALT_HIGH,
  medium: process.env.TOKEN_SALT_MEDIUM,
  low   : process.env.TOKEN_SALT_LOW
};
const jwtExpiryConfig = {
  high  : process.env.JWT_EXPIRY_HIGH,
  medium: process.env.JWT_EXPIRY_MEDIUM,
  low   : process.env.JWT_EXPIRY_LOW
};

const ACTIVE_THEME = (process.env.ACTIVE_THEME || 'default')
  .replace(/[^a-zA-Z0-9_-]/g, '') || 'default';

let PLAINSPACE_VERSION = '';
try {
  const infoPath = path.join(__dirname, 'mother', 'modules', 'plainSpace', 'moduleInfo.json');
  if (fs.existsSync(infoPath)) {
    const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    if (info && typeof info.version === 'string') {
      PLAINSPACE_VERSION = info.version;
    }
  }
} catch (err) {
  console.warn('[SERVER] Failed to load PlainSpace moduleInfo:', err.message);
}

//───────────────────────────────────────────────────────────────────────────
// Load local secret overrides (optional .secrets.js files)
//───────────────────────────────────────────────────────────────────────────
(function loadSecretsOverrides() {
  const overridesDir = path.join(__dirname, 'overrides');
  if (!fs.existsSync(overridesDir)) return;
  fs.readdirSync(overridesDir)
    .filter(f => f.endsWith('.secrets.js'))
    .forEach(f => {
      try {
        require(path.join(overridesDir, f));
        console.log(`[SECRETS] Loaded override ${f}`);
      } catch (e) {
        console.error(`[SECRETS] Failed to load ${f}:`, e.message);
      }
    });
})();

//───────────────────────────────────────────────────────────────────────────
// Helper to get a high‑trust token for DB manager
//───────────────────────────────────────────────────────────────────────────
function getModuleTokenForDbManager() {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'issueModuleToken',
      {
        skipJWT         : true,
        authModuleSecret: AUTH_MODULE_SECRET,
        moduleType      : 'core',
        moduleName      : 'auth',
        trustLevel      : 'high',
        signAsModule    : 'databaseManager'
      },
      (err, token) => err ? reject(err) : resolve(token)
    );
  });
}

//───────────────────────────────────────────────────────────────────────────
// MAIN async IIFE
//───────────────────────────────────────────────────────────────────────────
(async () => {
  // Instantiate Express
  const app  = express();
  const port = process.env.PORT || 3000;

  // Helper to sanitize slugs for safe use in HTML/JS contexts
  function sanitizeSlug(str) {
    return String(str)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 96);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  // Helper to verify an admin JWT against the current user database
  function validateAdminToken(token) {
    return new Promise((resolve, reject) => {
      if (!token) return reject(new Error('Missing token'));
      motherEmitter.emit(
        'validateToken',
        {
          skipJWT: true,
          authModuleSecret: AUTH_MODULE_SECRET,
          moduleName: 'auth',
          moduleType: 'core',
          tokenToValidate: token
        },
        (err, decoded) => (err ? reject(err) : resolve(decoded))
      );
    });
  }

  // Helper to check if the system still requires the initial setup
  async function needsInitialSetup() {
    try {
      const pubTok = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'issuePublicToken',
          { purpose: 'firstInstallCheck', moduleName: 'auth' },
          (err, tok) => (err ? reject(err) : resolve(tok))
        );
      });

      const [installVal, userCount] = await Promise.all([
        new Promise((resolve, reject) => {
          motherEmitter.emit(
            'getPublicSetting',
            {
              jwt: pubTok,
              moduleName: 'settingsManager',
              moduleType: 'core',
              key: 'FIRST_INSTALL_DONE'
            },
            (err, val) => (err ? reject(err) : resolve(val))
          );
        }),
        new Promise((resolve, reject) => {
          motherEmitter.emit(
            'getUserCount',
            { jwt: pubTok, moduleName: 'userManagement', moduleType: 'core' },
            (err, count = 0) => (err ? reject(err) : resolve(count))
          );
        })
      ]);

      return installVal !== 'true' && userCount === 0;
    } catch (err) {
      console.error('[needsInitialSetup] Error:', err.message);
      return true; // default to requiring setup when uncertain
    }
  }

  // Set up paths
  const publicPath = path.join(__dirname, 'public');
  const assetsPath = path.join(publicPath, 'assets');
  const buildPath = path.join(publicPath, 'build');
  app.use('/admin/assets', express.static(path.join(publicPath, 'assets')));
  app.use('/build', express.static(buildPath));
  app.use('/apps', express.static(path.join(__dirname, 'apps')));
  app.use(
    '/plainspace',
    express.static(path.join(__dirname, 'apps', 'plainspace'))
  );
  app.use(
    '/plainspace',
    express.static(path.join(publicPath, 'plainspace'))
  );
  app.use('/assets', express.static(assetsPath));
  app.use('/themes', express.static(path.join(publicPath, 'themes')));
  app.use('/favicon.ico', express.static(path.join(publicPath,'favicon.ico')));
  app.use('/fonts', express.static(path.join(publicPath,'fonts')));

  // Trust reverse proxy headers only if explicitly allowed
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(x => x.trim()));
  } else {
    app.set('trust proxy', false);
  }

  // Security headers
  app.use(helmet());

  // HTTPS redirect in production
  if (isProduction) {
    const httpsRedirect = require('./mother/utils/httpsRedirect');
    app.use(httpsRedirect);
  }

  // Body parser + cookies (allow larger payloads for media uploads)
  const bodyLimit = process.env.BODY_LIMIT || '20mb';
  app.use(bodyParser.json({ limit: bodyLimit }));
  app.use(bodyParser.urlencoded({ extended: true, limit: bodyLimit }));
  app.use(cookieParser());

  // CSRF protection
  const csrfProtection = csurf({
    cookie: { httpOnly: true, sameSite: 'strict' }
  })

  // 1) Load core Auth module
  console.log('[SERVER INIT] Loading Auth module…');
  require(path.join(__dirname, 'mother', 'modules', 'auth', 'index.js'))
    .initialize({
      motherEmitter,
      isCore: true,
      JWT_SECRET,
      userPasswordSalt,
      moduleDbSalt,
      tokenSalts,
      jwtExpiryConfig
    });
  console.log('[SERVER INIT] Auth module loaded.');

  // 2) Obtain DB‑manager token
  console.log('[SERVER INIT] Requesting DB‑manager token…');
  const dbManagerToken = await getModuleTokenForDbManager();
  console.log('[SERVER INIT] dbManagerToken obtained.');

  // 3) Load other core modules
  const coreList = [
    { name:'databaseManager',     path:'mother/modules/databaseManager',     extra:{ app } },
    { name:'notificationManager', path:'mother/modules/notificationManager', extra:{ app } },
    { name:'settingsManager',     path:'mother/modules/settingsManager',     extra:{} },
    { name:'widgetManager',       path:'mother/modules/widgetManager',       extra:{} },
    { name:'appLoader',           path:'mother/modules/appLoader',           extra:{} },
    { name:'userManagement',      path:'mother/modules/userManagement',      extra:{ app } },
    { name:'pagesManager',        path:'mother/modules/pagesManager',        extra:{} },
    { name:'dependencyLoader',    path:'mother/modules/dependencyLoader',    extra:{ jwtToken: dbManagerToken } },
    { name:'requestManager',      path:'mother/modules/requestManager',      extra:{} },
    { name:'unifiedSettings',     path:'mother/modules/unifiedSettings',     extra:{ app } },
    { name:'serverManager',       path:'mother/modules/serverManager',       extra:{ app } },
    { name:'mediaManager',        path:'mother/modules/mediaManager',        extra:{ app } },
    { name:'shareManager',        path:'mother/modules/shareManager',        extra:{ app } },
    { name:'translationManager',  path:'mother/modules/translationManager',  extra:{} },
    { name:'plainSpace',          path:'mother/modules/plainSpace',          extra:{ app } },
    { name:'importer',            path:'mother/modules/importer',            extra:{} },
    { name:'fontsManager',        path:'mother/modules/fontsManager',        extra:{} }
  ];

  for (const mod of coreList) {
    console.log(`[SERVER INIT] Loading ${mod.name}…`);
    await require(path.join(__dirname, mod.path, 'index.js'))
      .initialize({
        motherEmitter,
        isCore: true,
        jwt: dbManagerToken,
        moduleDbSalt,
        ...mod.extra
      });
    console.log(`[SERVER INIT] ${mod.name} loaded.`);
  }



  // ──────────────────────────────────────────────────────────────────────────
  // 4) Load optional modules
  // ──────────────────────────────────────────────────────────────────────────
  try {
    console.log('[SERVER INIT] Loading optional moduleLoader…');
    const loader = require(path.join(__dirname, 'mother', 'modules', 'moduleLoader', 'index.js'));
    await loader.loadAllModules({ emitter: motherEmitter, app, jwt: dbManagerToken });
    console.log('[SERVER INIT] moduleLoader done.');
  } catch (e) {
    console.error('[SERVER INIT] moduleLoader fizzled →', e.message);
  }

  // Build app registry from /apps directory
  try {
    console.log('[SERVER INIT] Loading appLoader…');
    const loadApps = require(path.join(__dirname, 'mother', 'modules', 'appLoader', 'index.js'));
    await loadApps({ emitter: motherEmitter, jwt: dbManagerToken });
    console.log('[SERVER INIT] appLoader done.');
  } catch (e) {
    console.error('[SERVER INIT] appLoader fizzled →', e.message);
  }

  

// ──────────────────────────────────────────────────────────────────────────
// 5) Meltdown API – proxy front-end requests into motherEmitter events
// ──────────────────────────────────────────────────────────────────────────

app.post('/api/meltdown', async (req, res) => {
  // 1) Read event name first so we know if it is public
  const { eventName, payload = {} } = req.body || {};
  const PUBLIC_EVENTS = [
    'issuePublicToken',
    'ensurePublicToken',
    'removeListenersByModule',
    'deactivateModule'
  ];

  // 2) Extract the JWT. Explicit header token overrides the cookie
  //    to allow public operations even if a stale admin cookie exists.
  const headerJwt = req.get('X-Public-Token') || null;
  const cookieJwt = req.cookies?.admin_jwt || null;
  const jwt = headerJwt || cookieJwt;

  // 3) If no JWT and this is not a public event => reject
  if (!jwt && !PUBLIC_EVENTS.includes(eventName)) {
    return res.status(401).json({ error: 'Authentication required: missing JWT.' });
  }

  if (!PUBLIC_EVENTS.includes(eventName) && jwt) {
    try {
      payload.decodedJWT = await validateAdminToken(jwt);
      payload.jwt = jwt;
    } catch (err) {
      console.warn('[POST /api/meltdown] Invalid admin token =>', err.message);
      res.clearCookie('admin_jwt', {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction
      });
      return res.status(401).json({ error: 'Invalid token' });
    }
  } else if (jwt) {
    payload.jwt = jwt;
  }

  // 4) Emit the event and return JSON
  motherEmitter.emit(eventName, payload, (err, data) => {
    if (err) {
      const safeEvent = String(eventName).replace(/[\n\r]/g, '');
      console.error('[MELTDOWN] Event "%s" failed => %s', safeEvent, err.message);
      return res.status(500).json({ error: err.message });
    }
    return res.json({ eventName, data });
  });
});

// Batch variant to reduce number of requests from the admin UI
app.post('/api/meltdown/batch', async (req, res) => {
  const { events } = req.body || {};
  if (!Array.isArray(events)) {
    return res.status(400).json({ error: 'Invalid events array' });
  }

  const PUBLIC_EVENTS = [
    'issuePublicToken',
    'ensurePublicToken',
    'removeListenersByModule',
    'deactivateModule'
  ];

  const headerJwt = req.get('X-Public-Token') || null;
  const cookieJwt = req.cookies?.admin_jwt || null;
  const globalJwt = headerJwt || cookieJwt;

  const results = [];

  for (const ev of events) {
    const { eventName, payload = {} } = ev || {};
    if (!eventName) {
      results.push({ error: 'Missing eventName' });
      continue;
    }

    let jwt = payload.jwt || globalJwt;

    if (!jwt && !PUBLIC_EVENTS.includes(eventName)) {
      results.push({ eventName, error: 'Authentication required: missing JWT.' });
      continue;
    }

    if (!PUBLIC_EVENTS.includes(eventName) && jwt) {
      try {
        payload.decodedJWT = await validateAdminToken(jwt);
        payload.jwt = jwt;
      } catch (err) {
        console.warn('[POST /api/meltdown/batch] Invalid admin token =>', err.message);
        results.push({ eventName, error: 'Invalid token' });
        continue;
      }
    } else if (jwt) {
      payload.jwt = jwt;
    }

    try {
      const data = await new Promise((resolve, reject) => {
        motherEmitter.emit(eventName, payload, (err, d) => err ? reject(err) : resolve(d));
      });
      results.push({ eventName, data });
    } catch (err) {
      const safeEvent = String(eventName).replace(/[\n\r]/g, '');
      console.error('[MELTDOWN BATCH] Event "%s" failed => %s', safeEvent, err.message);
      results.push({ eventName, error: err.message });
    }
  }

  return res.json({ results });
});


// ─────────────────────────────────────────────────────────────────
// 6) CSRF-protected login endpoint
// ─────────────────────────────────────────────────────────────────

app.post('/admin/api/login', loginLimiter, csrfProtection, async (req, res) => {

  const { username, password } = req.body;
  try {
    // 1) Issue a “login” public JWT that’s safe for CSRF-guarded flows
    const loginJwt = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'issuePublicToken',
        { purpose: 'login', moduleName: 'auth' },
        (err, token) => err ? reject(err) : resolve(token)
      );
    });

    // 2) Perform the adminLocal authentication strategy
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
        (err, user) => {
          if (err) return reject(err);
          if (!user) return reject(new Error('Invalid credentials'));
          resolve(user);
        }
      );
    });

    // 3) Set the HttpOnly admin_jwt cookie and return success
    const secureFlag = isProduction;
    if (secureFlag && req.protocol !== 'https') {
      console.warn('[LOGIN ROUTE] Secure cookie requested over non-HTTPS connection. Cookie may be ignored by the browser.');
    }

    res.cookie(sanitizeCookieName('admin_jwt'), user.jwt, {
      path: sanitizeCookiePath('/'),
      httpOnly: true,
      sameSite: 'strict',
      secure: secureFlag,
      maxAge: 2 * 60 * 60 * 1000  // 2 hours
    });

    console.log(`[LOGIN ROUTE] User "${username}" authenticated successfully.`);

    return res.json({ success: true });

  } catch (err) {
    console.warn('[LOGIN ROUTE] Login failed =>', err.message);
    return res.status(401).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 6b) Logout endpoint - clears admin cookie and redirects to login
// -----------------------------------------------------------------------------
app.get('/admin/logout', (req, res) => {
  res.clearCookie('admin_jwt', {
    path: sanitizeCookiePath('/'),
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction
  });
  res.redirect('/login');
});



// ──────────────────────────────────────────────────────────────────────────
// 7a) Admin entry point: redirect to /admin/home and render shell
// ──────────────────────────────────────────────────────────────────────────

// Redirect plain /admin to login or install depending on setup
app.get('/admin', csrfProtection, async (_req, res) => {
  try {
    if (await needsInitialSetup()) {
      return res.redirect('/install');
    }

    return res.redirect('/login');
  } catch (err) {
    console.error('[GET /admin] Error:', err);
    return res.redirect('/login');
  }
});

// Admin Home Route
app.get('/admin/home', csrfProtection, async (req, res) => {
  try {
    if (await needsInitialSetup()) {
      return res.redirect('/install');
    }

    // Wenn Nutzer bereits authentifiziert ist, zeige admin.html
    if (req.cookies?.admin_jwt) {
      try {
        await validateAdminToken(req.cookies.admin_jwt);
        let html = fs.readFileSync(path.join(publicPath, 'admin.html'), 'utf8');
        if (renderMode === 'server') {
          html = html.replace(
            /<script type="module" src="\/assets\/plainspace\/main\/pageRenderer.js"><\/script>\s*/i,
            ''
          );
        }
        html = html.replace(
          '</head>',
          `<meta name="csrf-token" content="${req.csrfToken()}"></head>`
        );
        return res.send(html);
      } catch (err) {
        console.warn('[GET /admin/home] Invalid admin token =>', err.message);
        res.clearCookie('admin_jwt', {
          path: '/',
          httpOnly: true,
          sameSite: 'strict',
          secure: isProduction
        });
      }
    }

    // User nicht eingeloggt, sende login.html mit CSRF-Token
    let html = fs.readFileSync(path.join(publicPath, 'login.html'), 'utf8');
    html = html.replace(
      '{{CSRF_TOKEN}}', 
      req.csrfToken()
    );
    return res.send(html);

  } catch (err) {
    console.error('[ADMIN /home] Error:', err);
    let html = fs.readFileSync(path.join(publicPath, 'login.html'), 'utf8');
    html = html.replace('{{CSRF_TOKEN}}', req.csrfToken());
    return res.send(html);
  }
});



// ──────────────────────────────────────────────────────────────────────────
// 7b) App launcher at /admin/app/:appName
// ──────────────────────────────────────────────────────────────────────────
app.get('/admin/app/:appName/:pageId?', csrfProtection, async (req, res) => {
  const adminJwt = req.cookies?.admin_jwt;
  if (!adminJwt) {
    const jump = `/login?redirectTo=${encodeURIComponent(req.originalUrl)}`;
    return res.redirect(jump);
  }

  let decoded;
  try {
    decoded = await validateAdminToken(adminJwt);
  } catch (err) {
    console.warn('[GET /admin/app] Invalid admin token =>', err.message);
    res.clearCookie('admin_jwt', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction
    });
    const jump = `/login?redirectTo=${encodeURIComponent(req.originalUrl)}`;
    return res.redirect(jump);
  }

  const appName = sanitizeSlug(req.params.appName);
  const appDir = path.join(__dirname, 'apps', appName);
  const manifestPath = path.join(appDir, 'app.json');
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).send('App not found');
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return res.status(500).send('Invalid app manifest');
  }

  if (Array.isArray(manifest.permissions) &&
      !manifest.permissions.every(p => hasPermission(decoded, p))) {
    return res.status(403).send('Forbidden');
  }

  const titleSafe = escapeHtml(manifest.title || manifest.name || 'App');
  const rawEntry = String(manifest.entry || '').replace(/[^a-zA-Z0-9_\-/\.]/g, '');
  const entry = rawEntry.includes('/') || rawEntry.endsWith('.js')
    ? rawEntry
    : `build/${rawEntry}.js`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="csrf-token" content="${req.csrfToken()}"><title>${titleSafe}</title><link rel="stylesheet" href="/assets/css/site.css"><script src="/build/meltdownEmitter.js"></script><script src="/build/icons.js"></script></head><body><div id="sidebar"></div><div id="content"></div><script type="module" src="/${entry}"></script></body></html>`;
  return res.send(html);
});

// ──────────────────────────────────────────────────────────────────────────
// 7c) Admin SPA shell for any /admin/<slug> path
// ──────────────────────────────────────────────────────────────────────────

// Capture any admin page slug via wildcard and parse req.params[0]
app.get('/admin/*', csrfProtection, async (req, res, next) => {

  const adminJwt = req.cookies?.admin_jwt;

  if (!adminJwt) {
    const jump = `/login?redirectTo=${encodeURIComponent(req.originalUrl)}`;
    return res.redirect(jump);
  }

  try {
    await validateAdminToken(adminJwt);
  } catch (err) {
    console.warn('[GET /admin/*] Invalid admin token =>', err.message);
    res.clearCookie('admin_jwt', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction
    });
    const jump = `/login?redirectTo=${encodeURIComponent(req.originalUrl)}`;
    return res.redirect(jump);
  }

  let rawSlug = req.params[0] || '';
  let pageId = null;
  const lastSlash = rawSlug.lastIndexOf('/');
  if (lastSlash !== -1) {
    const maybeId = rawSlug.slice(lastSlash + 1);
    if (/^\d+$/.test(maybeId)) {
      pageId = parseInt(maybeId, 10) || null;
      rawSlug = rawSlug.slice(0, lastSlash);
    } else if (/^[a-f0-9]{24}$/i.test(maybeId)) {
      pageId = maybeId.toLowerCase();
      rawSlug = rawSlug.slice(0, lastSlash);
    }
  }

  const slug = sanitizeSlug(rawSlug);

  try {
    const page = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'getPageBySlug',
        {
          jwt: adminJwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          slug,
          lane: 'admin'
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    if (!page?.id || page.lane !== 'admin') {
      return next();
    }

    const nonce = crypto.randomBytes(16).toString('base64');
    const csrfTok = req.csrfToken();

    let html = fs.readFileSync(
      path.join(__dirname, 'public', 'admin.html'),
      'utf8'
    );
    if (renderMode === 'server') {
      html = html.replace(
        /<script type="module" src="\/assets\/plainspace\/main\/pageRenderer.js"><\/script>\s*/i,
        ''
      );
    }

    const inject = `
      <meta name="csrf-token" content="${csrfTok}">
      <script nonce="${nonce}">
        window.CSRF_TOKEN = ${JSON.stringify(csrfTok)};
        window.PAGE_ID     = ${JSON.stringify(pageId ?? page.id)};
        window.PAGE_SLUG   = ${JSON.stringify(slug)};
        window.ADMIN_TOKEN = ${JSON.stringify(adminJwt)};
        window.ACTIVE_THEME = ${JSON.stringify(ACTIVE_THEME)};
        window.PLAINSPACE_VERSION = ${JSON.stringify(PLAINSPACE_VERSION)};
        window.NONCE       = ${JSON.stringify(nonce)};
      </script>
    </head>`;
    html = html.replace('</head>', inject);

    res.setHeader('Content-Security-Policy', `script-src 'self' blob: 'nonce-${nonce}';`);
    res.send(html);

  } catch (err) {
    console.error('[ADMIN /admin/*] Error:', err);
    next(err);
  }
});




// ─────────────────────────────────────────────────────────────────
// 8) Explicit /login route
// ─────────────────────────────────────────────────────────────────
app.get('/login', csrfProtection, async (req, res) => {
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

    let html = fs.readFileSync(path.join(publicPath, 'login.html'), 'utf8');
    html = html.replace('{{CSRF_TOKEN}}', req.csrfToken());
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(html);
  } catch (err) {
    console.error('[GET /login] Error:', err);
    res.status(500).send('Server misconfiguration');
  }
});

// Convenience redirect for first-time registration

app.post('/install', csrfProtection, async (req, res) => {
  const { name, username, email, password, favoriteColor } = req.body || {};
  if (!name || !username || !email || !password) {
    return res.status(400).send('Missing fields');
  }
  try {
    const pubTok = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'issuePublicToken',
        { purpose: 'firstInstallCheck', moduleName: 'auth' },
        (e, d) => (e ? reject(e) : resolve(d))
      );
    });
    const [val, userCount] = await Promise.all([
      new Promise((r, j) =>
        motherEmitter.emit(
          'getPublicSetting',
          {
            jwt: pubTok,
            moduleName: 'settingsManager',
            moduleType: 'core',
            key: 'FIRST_INSTALL_DONE'
          },
          (e, d) => (e ? j(e) : r(d))
        )
      ),
      new Promise((r, j) =>
        motherEmitter.emit(
          'getUserCount',
          { jwt: pubTok, moduleName: 'userManagement', moduleType: 'core' },
          (e, d) => (e ? j(e) : r(d))
        )
      )
    ]);
    if (val === 'true' || userCount > 0) {
      return res.status(403).send('Already installed');
    }

    await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'createUser',
        {
          jwt: dbManagerToken,
          moduleName: 'userManagement',
          moduleType: 'core',
          username: username.trim(),
          password,
          email: email.trim(),
          displayName: name.trim(),
          uiColor: favoriteColor,
          role: 'admin'
        },
        err => (err ? reject(err) : resolve())
      );
    });
    await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'setSetting',
        {
          jwt: dbManagerToken,
          moduleName: 'settingsManager',
          moduleType: 'core',
          key: 'FIRST_INSTALL_DONE',
          value: 'true'
        },
        err => (err ? reject(err) : resolve())
      );
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /install] Error:', err);
    res.status(500).send('Installation failed');
  }
});

app.get('/install', csrfProtection, async (req, res) => {
  try {
    const pubTok = await new Promise((r, j) => motherEmitter.emit('issuePublicToken', { purpose: 'firstInstallCheck', moduleName: 'auth' }, (e, d) => e ? j(e) : r(d)));
    const val = await new Promise((r, j) => motherEmitter.emit('getPublicSetting', { jwt: pubTok, moduleName: 'settingsManager', moduleType: 'core', key: 'FIRST_INSTALL_DONE' }, (e, d) => e ? j(e) : r(d)));
    const userCount = await new Promise((r, j) => motherEmitter.emit('getUserCount', { jwt: pubTok, moduleName: 'userManagement', moduleType: 'core' }, (e, d) => e ? j(e) : r(d)));
    if (val === 'true' || userCount > 0) {
      return res.redirect('/login');
    }
    let html = fs.readFileSync(path.join(publicPath, 'install.html'), 'utf8');
    html = html.replace('{{CSRF_TOKEN}}', req.csrfToken());
    res.send(html);
  } catch (err) {
    console.error('[GET /install] Error:', err);
    res.status(500).send('Server misconfiguration');
  }
});
app.get('/register', (_req, res) => {
  res.redirect('/install');
});




// ─────────────────────────────────────────────────────────────────
// 9) Maintenance mode middleware
// ─────────────────────────────────────────────────────────────────
app.use(async (req, res, next) => {
  // allow essential routes and static assets during maintenance
  const allowedPrefixes = [
    '/admin',
    '/assets',
    '/api',
    '/login',
    '/favicon.ico',
    '/plainspace',
    '/themes',
    '/apps',
    '/fonts'
  ];
  if (allowedPrefixes.some(p => req.path.startsWith(p))) return next();
  

  // check the flag
  const isMaintenance = await new Promise((Y, N) => {
    motherEmitter.emit(
      'getSetting',
      {
        jwt: dbManagerToken,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key: 'MAINTENANCE_MODE'
      },
      (err, val) => {
        if (err) return N(err);
        const str = String(val).trim().toLowerCase();
        Y(str === 'true' || str === '1');
      }
    );
  }).catch(() => false);

  const maintenancePageId = await new Promise((Y, N) =>
    motherEmitter.emit(
      'getSetting',
      {
        jwt: dbManagerToken,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key: 'MAINTENANCE_PAGE_ID'
      },
      (err, val) => err ? N(err) : Y(val || null)
    )
  ).catch(() => null);

  let maintenanceSlug = 'coming-soon';
  if (maintenancePageId) {
    try {
      const page = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'getPageById',
          {
            jwt: dbManagerToken,
            moduleName: 'pagesManager',
            moduleType: 'core',
            pageId: maintenancePageId
          },
          (err, p) => err ? reject(err) : resolve(p)
        );
      });
      if (page?.slug) maintenanceSlug = page.slug;
    } catch {}
  }

  if (isMaintenance) {
    const targetPath = `/${maintenanceSlug}`;
    if (req.path !== targetPath) {
      return res.redirect(targetPath);
    }
    // if path IS the target, let the normal dynamic page renderer handle it:
  }

  next();
});


// ─────────────────────────────────────────────────────────────────
// 11) Public pages
// ─────────────────────────────────────────────────────────────────
const pageHtmlPath = path.join(__dirname, 'public', 'index.html');
const libraryRoot = path.join(process.cwd(), 'library');
const builderPublicRoot = path.join(libraryRoot, 'public', 'builder');

app.get('/p/:slug', async (req, res, next) => {
  try {
    const slug = sanitizeSlug(req.params.slug || '');

    try {
      // Obtain/refresh public token for page lookup
      global.pagesPublicToken = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'ensurePublicToken',
          {
            currentToken: global.pagesPublicToken,
            purpose: 'public',
            moduleName: 'publicRoute',
            moduleType: 'core'
          },
          (err, data) => (err ? reject(err) : resolve(data))
        );
      });

      const page = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'getPageBySlug',
          {
            jwt: global.pagesPublicToken,
            moduleName: 'pagesManager',
            moduleType: 'core',
            slug
          },
          (err, result) => (err ? reject(err) : resolve(result))
        );
      });

      // If a dynamic page exists, let the normal dynamic handler serve it
      if (page?.id) {
        return next();
      }
    } catch (lookupErr) {
      console.warn('[SERVER] /p/:slug lookup failed →', lookupErr.message);
    }

    const filePath = path.join(builderPublicRoot, slug, 'index.html');
    if (!filePath.startsWith(builderPublicRoot) || !fs.existsSync(filePath)) {
      return next();
    }
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

// Handle public pages ("/" or "/:slug")
app.get('/:slug?', async (req, res, next) => {
  try {
    const requestedSlug = req.params.slug;

    const slug = sanitizeSlug(
      typeof requestedSlug === 'string' ? requestedSlug : ''
    );

    // Ensure a valid public token is available (refresh when expired)
    try {
      global.pagesPublicToken = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'ensurePublicToken',
          { 
            currentToken: global.pagesPublicToken, 
            purpose: 'public',
            moduleName: 'publicRoute',
            moduleType: 'core'
          },
          (err, data) => (err ? reject(err) : resolve(data))

        );
      });
    } catch (tokenErr) {
      console.error('[SERVER] Failed to obtain public token →', tokenErr);

      return res.status(500).send('Server misconfiguration');
    }

    // 1) Get the page object via meltdown (direct object, not {data:…}!)
    const page = await new Promise((resolve, reject) => {
      const eventName = slug ? 'getPageBySlug' : 'getStartPage';
      const payload = slug
        ? { jwt: global.pagesPublicToken, moduleName: 'pagesManager', moduleType: 'core', slug }
        : { jwt: global.pagesPublicToken, moduleName: 'pagesManager', moduleType: 'core' };

      motherEmitter.emit(eventName, payload, (err, record) => {
        if (err) return reject(err);
        resolve(record);
      });
    });

    // 2) If no row or missing .id => 404 fallback
    if (!page?.id) {
      return next();  // triggers your 404 fallback or next route
    }

    // 3) Build your dynamic injection with a nonce for CSP
    const pageId = page.id;
    const lane   = 'public';
    const token  = global.pagesPublicToken;
    const slugToUse = slug || sanitizeSlug(page.slug);

    const nonce = crypto.randomBytes(16).toString('base64');

    let html = fs.readFileSync(pageHtmlPath, 'utf8');
    if (renderMode === 'server') {
      html = html.replace(
        /<script type="module" src="\/assets\/plainspace\/main\/pageRenderer.js"><\/script>\s*/i,
        ''
      );
    }
    const inject = `<script nonce="${nonce}">
      window.PAGE_ID = ${JSON.stringify(pageId)};
      window.PAGE_SLUG = ${JSON.stringify(slugToUse)};
      window.LANE    = ${JSON.stringify(lane)};
      window.PUBLIC_TOKEN = ${JSON.stringify(token)};
      window.ACTIVE_THEME = ${JSON.stringify(ACTIVE_THEME)};
      window.PLAINSPACE_VERSION = ${JSON.stringify(PLAINSPACE_VERSION)};
      window.NONCE  = ${JSON.stringify(nonce)};
    </script>`;
    html = html.replace('</head>', inject + '</head>');

    res.setHeader('Content-Security-Policy', `script-src 'self' blob: 'nonce-${nonce}';`);

    // 4) Send the patched HTML
    res.send(html);

  } catch (err) {
    console.error('[SERVER] /:slug render error →', err);
    next(err);
  }
});


// ─────────────────────────────────────────────────────────────────
// 12) First-time setup
// ─────────────────────────────────────────────────────────────────
try {
  const firstInstallDone = await new Promise((resolve, reject) => {
    motherEmitter.emit(
      'getSetting',
      {
        jwt         : dbManagerToken,
        moduleName  : 'settingsManager',
        moduleType  : 'core',
        key         : 'FIRST_INSTALL_DONE'
      },
      (err, val) => err ? reject(err) : resolve(val)
    );
  });

  if (firstInstallDone !== 'true') {
    const userCount = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'getUserCount',
        { jwt: dbManagerToken, moduleName: 'userManagement', moduleType: 'core' },
        (err, count = 0) => (err ? reject(err) : resolve(count))
      );
    });

    if (userCount > 0) {
      console.log('[APP] FIRST_INSTALL_DONE false but users exist => marking installed.');
      await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'setSetting',
          {
            jwt         : dbManagerToken,
            moduleName  : 'settingsManager',
            moduleType  : 'core',
            key         : 'FIRST_INSTALL_DONE',
            value       : 'true'
          },
          err => err ? reject(err) : resolve()
        );
      });
      console.log('[APP] FIRST_INSTALL_DONE set to "true" based on existing users.');
    } else {
      console.log('[APP] FIRST_INSTALL_DONE false and no users => waiting for installation.');
    }
  } else {
    console.log('[APP] FIRST_INSTALL_DONE is "true" => skipping initial seeding.');
  }
} catch (err) {
  console.error('[APP] Could not check/set FIRST_INSTALL_DONE:', err.message);
}

// ─────────────────────────────────────────────────────────────────
// 13) Lift-off
// ─────────────────────────────────────────────────────────────────

const server = app.listen(port, () => {
  console.log(`[SERVER] BlogPosterCMS is listening on http://localhost:${port}/`);
});

process.on('SIGINT', () => {
  console.log('Shutting down server (SIGINT)...');
  server.close(() => {
    console.log('Server shutdown complete!');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Shutting down server (SIGINT)...');
  server.close(() => {
    console.log('Server shutdown complete!');
    process.exit(0);
  });
});

})().catch(err => {
  console.error('[SERVER INIT] Shit happens..:', err);
  process.exit(1);
});
