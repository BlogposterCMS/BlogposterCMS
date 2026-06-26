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
const { installDevFileLogger, createRequestLogMiddleware } = require('./mother/utils/devFileLogger');
const devFileLogger = installDevFileLogger({ rootDir: path.resolve(__dirname, '..') });
const express      = require('express');
const helmet       = require('helmet');
const bodyParser   = require('body-parser');
const cookieParser = require('cookie-parser');
const csrfProtection = require('./mother/utils/csrfProtection');
const { loginLimiter } = require('./mother/utils/rateLimiters');
const { computeInstallationCompletion } = require('./mother/utils/installationState');
const {
  explainExternalEventRejection,
  isHttpPublicEvent,
  isHttpPublicTokenEvent,
  stripHttpPayloadAuthMeta,
  translateLegacyHttpFacadeEvent
} = require('./mother/utils/meltdownHttpPolicy');
const crypto = require('crypto');
const ts = require('typescript');
const { sanitizeCookieName, sanitizeCookiePath } = require('./mother/utils/cookieUtils');
const { isProduction, features } = require('./config/runtime');
const renderMode = features?.renderMode || 'client';
const { hasPermission } = require('./mother/modules/userManagement/permissionUtils');
const {
  canUseDevAutologin,
  resolveDevAutologinUser
} = require('./mother/modules/auth/devAutoLogin');
const { createAgentApiRouter } = require('./mother/modules/agentManager/httpApi');
const {
  createAgentAccessAdminRouter,
  createAgentAccessPublicRouter
} = require('./mother/modules/agentAccess/httpApi');
const {
  seedAdminPages: psSeedAdminPages,
  seedAdminWidget: psSeedAdminWidget
} = require('./mother/modules/plainSpace/plainSpaceService');
const { DEFAULT_WIDGETS } = require('./mother/modules/plainSpace/config/defaultWidgets');
const { ADMIN_PAGES } = require('./mother/modules/plainSpace/config/adminPages');
const securityConfig = require('./config/security');
const runtimeTsCache = new Map();
const BROWSER_TS_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  esModuleInterop: true,
  resolveJsonModule: true,
  allowSyntheticDefaultImports: true,
  importHelpers: false,
  sourceMap: false,
  removeComments: false
};
const VALID_RUNTIME_MODULE = /^[A-Za-z0-9_-]+$/;

function setStaticCorsHeaders(_req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}

async function compileBrowserModule(tsPath) {
  const stat = await fs.promises.stat(tsPath);
  const cached = runtimeTsCache.get(tsPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    if (typeof cached.code === 'string') {
      return cached.code;
    }
    if (cached.promise) {
      return cached.promise;
    }
  }

  const compilePromise = (async () => {
    const source = await fs.promises.readFile(tsPath, 'utf8');
    const result = ts.transpileModule(source, {
      compilerOptions: BROWSER_TS_OPTIONS,
      fileName: path.basename(tsPath)
    });

    if (Array.isArray(result.diagnostics) && result.diagnostics.length > 0) {
      const formatted = result.diagnostics
        .map(diag => {
          if (!diag) return '';
          if (typeof diag.messageText === 'string') return diag.messageText;
          return diag.messageText?.messageText || '';
        })
        .filter(Boolean)
        .join('; ');
      if (formatted) {
        console.warn(`[runtime-ts] Diagnostics while compiling ${tsPath}: ${formatted}`);
      }
    }

    const output = result.outputText || '';
    runtimeTsCache.set(tsPath, { mtimeMs: stat.mtimeMs, code: output });
    return output;
  })();

  runtimeTsCache.set(tsPath, { mtimeMs: stat.mtimeMs, promise: compilePromise });

  try {
    return await compilePromise;
  } catch (err) {
    runtimeTsCache.delete(tsPath);
    throw err;
  }
}

function makeParamTsHandler(baseDir, paramName) {
  const normalizedBase = path.resolve(baseDir);
  return async (req, res, next) => {
    const raw = req.params?.[paramName];
    if (!raw || !VALID_RUNTIME_MODULE.test(raw)) {
      return next();
    }

    const tsCandidate = path.resolve(normalizedBase, `${raw}.ts`);
    if (!tsCandidate.startsWith(normalizedBase + path.sep)) {
      return next();
    }

    try {
      await fs.promises.access(tsCandidate, fs.constants.R_OK);
    } catch {
      return next();
    }

    try {
      const code = await compileBrowserModule(tsCandidate);
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.send(code);
    } catch (err) {
      console.error(`[runtime-ts] Failed to compile ${tsCandidate}:`, err);
      res
        .status(500)
        .type('application/javascript')
        .send("console.error('Failed to compile module');");
    }
  };
}

function makeFixedTsHandler(tsPath) {
  const normalizedPath = path.resolve(tsPath);
  return async (req, res, next) => {
    try {
      await fs.promises.access(normalizedPath, fs.constants.R_OK);
    } catch {
      return next();
    }

    try {
      const code = await compileBrowserModule(normalizedPath);
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.send(code);
    } catch (err) {
      console.error(`[runtime-ts] Failed to compile ${normalizedPath}:`, err);
      res
        .status(500)
        .type('application/javascript')
        .send("console.error('Failed to compile module');");
    }
  };
}

const MIN_ORIGIN_TOKEN_TTL = 60;

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createOriginToken(origins) {
  const keyConfig = securityConfig.postMessage?.originToken;
  if (
    !keyConfig?.privateKey ||
    !keyConfig?.publicKey ||
    !Array.isArray(origins) ||
    !origins.length
  ) {
    return null;
  }
  const ttlSeconds = Math.max(Number(keyConfig.ttlSeconds || 0), MIN_ORIGIN_TOKEN_TTL);
  const now = Date.now();
  const payload = {
    origins,
    issuedAt: now,
    expiresAt: now + (ttlSeconds * 1000),
    nonce: crypto.randomBytes(16).toString('hex')
  };
  const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payloadBuffer);
  signer.end();
  const signature = signer.sign(keyConfig.privateKey);
  return `${base64UrlEncode(payloadBuffer)}.${base64UrlEncode(signature)}`;
}






const { motherEmitter, meltdownForModule } = require('./mother/emitters/motherEmitter');
const moduleNameFromStack = require('./mother/utils/moduleNameFromStack');
const { validateInstallInput } = require('./mother/utils/installValidation');

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

function injectDevBanner(html) {
  if (process.env.NODE_ENV !== 'production') {
    return html.replace(
      '</body>',
      '<script type="module" src="/build/devBanner.js"></script></body>'
    );
  }
  return html;
}

async function isDevAutoLoginAllowed() {
  const localDevMode = process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production';
  const devAuto = localDevMode && process.env.DEV_AUTOLOGIN !== 'false';
  if (!devAuto) return false;
  try {
    const moduleTok = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'issueModuleToken',
        {
          skipJWT: true,
          authModuleSecret: AUTH_MODULE_SECRET,
          moduleType: 'core',
          moduleName: 'auth',
          signAsModule: 'userManagement',
          trustLevel: 'high'
        },
        (e, t) => (e ? reject(e) : resolve(t))
      );
    });
    const devUser = process.env.DEV_USER || 'admin';
    const user = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'getUserDetailsByUsername',
        { jwt: moduleTok, moduleName: 'userManagement', moduleType: 'core', username: devUser },
        (e, u) => (e ? reject(e) : resolve(u))
      );
    });
    return Boolean(user);
  } catch {
    return false;
  }
}

async function maybeIssueDevAdminSession(req, res, contextLabel = 'admin') {
  if (!canUseDevAutologin(req)) return null;

  try {
    const user = await resolveDevAutologinUser({
      motherEmitter,
      authModuleSecret: AUTH_MODULE_SECRET,
      devUser: process.env.DEV_USER || 'admin'
    });

    res.cookie(sanitizeCookieName('admin_jwt'), user.jwt, {
      path: sanitizeCookiePath('/'),
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction,
      maxAge: 2 * 60 * 60 * 1000
    });

    console.log(`[DEV AUTOLOGIN] ${contextLabel} => issued local admin session for "${process.env.DEV_USER || 'admin'}".`);
    return user.jwt;
  } catch (err) {
    console.warn(`[DEV AUTOLOGIN] ${contextLabel} => ${err.code || 'AUTH_DEV_AUTOLOGIN_FAILED'}: ${err.message}`);
    return null;
  }
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
// Helper to get a high-trust token for a specific core module identity
//───────────────────────────────────────────────────────────────────────────
function getCoreModuleToken(moduleName) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'issueModuleToken',
      {
        skipJWT         : true,
        authModuleSecret: AUTH_MODULE_SECRET,
        moduleType      : 'core',
        moduleName      : 'auth',
        trustLevel      : 'high',
        signAsModule    : moduleName
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
  const installLockPath = path.join(__dirname, 'install.lock');
  app.use(createRequestLogMiddleware(devFileLogger));
  if (devFileLogger.enabled) {
    console.log(`[DEV LOGS] Mirroring development logs to ${devFileLogger.dir}`);
  }

  // Helper to sanitize slugs for safe use in HTML/JS contexts
  function sanitizeSlug(str) {
    const cleaned = String(str)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .split('/')
      .map(seg => seg.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
      .filter(Boolean)
      .join('/');
    return cleaned.substring(0, 96);
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

  async function issueAppLoaderJwt(jwt) {
    return new Promise((resolve, reject) => {
      motherEmitter.emit(
        'issueModuleToken',
        {
          skipJWT: true,
          authModuleSecret: AUTH_MODULE_SECRET,
          moduleType: 'core',
          moduleName: 'auth',
          signAsModule: 'appLoader',
          trustLevel: 'high'
        },
        (err, tok) => (err ? reject(err) : resolve(tok))
      );
    });
  }

  async function dispatchAppLoaderEvent(baseJwt, decodedJWT, eventName, data = {}) {
    const jwt = await issueAppLoaderJwt(baseJwt);
    return new Promise((resolve, reject) => {
      motherEmitter.emit(
        eventName,
        {
          jwt,
          moduleName: 'appLoader',
          moduleType: 'core',
          decodedJWT,
          ...data
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });
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
          jwt: token,
          moduleName: 'auth',
          moduleType: 'core',
          tokenToValidate: token
        },
        (err, decoded) => (err ? reject(err) : resolve(decoded))
      );
    });
  }

  function isHttpAdminPrincipal(decoded) {
    return Boolean(decoded && decoded.isUser === true && decoded.isPublic !== true);
  }

  async function getInstallationStatus() {
    const lockExists = fs.existsSync(installLockPath);

    try {
      const publicToken = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'issuePublicToken',
          { purpose: 'firstInstallCheck', moduleName: 'auth' },
          (err, tok) => (err ? reject(err) : resolve(tok))
        );
      });

      const [firstInstallValue, rawUserCount] = await Promise.all([
        new Promise((resolve, reject) => {
          motherEmitter.emit(
            'getPublicSetting',
            {
              jwt: publicToken,
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
            { jwt: publicToken, moduleName: 'userManagement', moduleType: 'core' },
            (err, count = 0) => (err ? reject(err) : resolve(count))
          );
        })
      ]);

      const status = computeInstallationCompletion({
        lockExists,
        firstInstallDone: firstInstallValue,
        userCount: rawUserCount
      });

      if (status.inconsistency === 'lock_without_data') {
        console.warn('[installation] install.lock present without users or FIRST_INSTALL_DONE flag. Treating as incomplete.');
      } else if (status.inconsistency === 'data_without_lock') {
        console.warn('[installation] Users or FIRST_INSTALL_DONE present without install.lock. Treating as complete.');
      }

      return status;
    } catch (err) {
      console.error('[getInstallationStatus] Error while resolving installation state:', err);
      return {
        complete: lockExists,
        lockExists,
        firstInstallDone: false,
        userCount: 0,
        hasPersistentData: false,
        inconsistency: lockExists ? 'lock_without_data' : null,
        error: err
      };
    }
  }

  // Helper to check if the system still requires the initial setup
  async function needsInitialSetup() {
    try {
      const status = await getInstallationStatus();
      return !status.complete;
    } catch (err) {
      console.error('[needsInitialSetup] Error:', err);
      return true;
    }
  }

  // Set up paths
  const publicPath = path.join(__dirname, 'public');
  const assetsPath = path.join(publicPath, 'assets');
  const buildPath = path.join(publicPath, 'build');
  const widgetsPath = path.join(__dirname, 'widgets');
  const designerMainTs = path.join(__dirname, 'ui', 'designer', 'app', 'main');
  const designerManagersTs = path.join(__dirname, 'ui', 'designer', 'app', 'managers');
  const modulePublicLoaderTsPaths = {
    pagesManager: path.join(__dirname, 'mother', 'modules', 'pagesManager', 'publicLoader.ts'),
    widgetManager: path.join(__dirname, 'mother', 'modules', 'widgetManager', 'publicLoader.ts')
  };
  const modulePublicLoaderRoot = path.join(__dirname, 'modules');
  const STATIC_BLOCKED_FILENAMES = new Set([
    '.npmrc',
    '.yarnrc',
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lock',
    'bun.lockb'
  ]);
  const blockBrowserSourceFiles = (req, res, next) => {
    const rawPath = String(req.path || '');
    let requestPath = rawPath;
    try {
      requestPath = decodeURIComponent(rawPath);
    } catch {
      requestPath = rawPath;
    }
    const filename = (requestPath.split(/[\\/]+/).pop() || '').toLowerCase();
    const isBlockedSource = /\.(?:ts|tsx)$/i.test(requestPath);
    const isBlockedSecret = /^\.env(?:\.|$)/i.test(filename);
    const isBlockedRuntimeFile = STATIC_BLOCKED_FILENAMES.has(filename);
    if (isBlockedSource || isBlockedSecret || isBlockedRuntimeFile) {
      res.status(404).send('Not found');
      return;
    }
    next();
  };
  const blockThemeExecutableAssets = (req, res, next) => {
    const rawPath = String(req.path || '');
    let requestPath = rawPath;
    try {
      requestPath = decodeURIComponent(rawPath);
    } catch {
      requestPath = rawPath;
    }

    // Themes are presentation-only; executable assets belong in widgets, modules or apps.
    if (/\.(?:asp|aspx|cjs|js|jsx|jsp|mjs|php|phtml|py|rb|sh|ts|tsx|vue|svelte)$/i.test(requestPath)) {
      res.status(404).send('Not found');
      return;
    }
    next();
  };
  const makeStaticRealpathGuard = (rootPath, label) => {
    const root = path.resolve(rootPath);
    const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
    const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;

    return (req, res, next) => {
      try {
        const relativePath = String(req.path || '').replace(/^\/+/, '');
        if (relativePath.includes('\0')) {
          res.status(400).send('Bad request');
          return;
        }

        const candidate = path.resolve(root, relativePath);
        const compareCandidate = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
        if (compareCandidate !== compareRoot && !compareCandidate.startsWith(compareRootPrefix)) {
          res.status(403).send('Forbidden');
          return;
        }

        if (fs.existsSync(candidate)) {
          const realCandidate = fs.realpathSync(candidate);
          const compareRealCandidate = process.platform === 'win32'
            ? realCandidate.toLowerCase()
            : realCandidate;
          if (compareRealCandidate !== compareRoot && !compareRealCandidate.startsWith(compareRootPrefix)) {
            res.status(403).send('Forbidden');
            return;
          }
        }

        next();
      } catch (err) {
        console.warn(`[STATIC] Blocked ${label} asset path:`, err.message);
        res.status(400).send('Bad request');
      }
    };
  };
  const appStaticPath = path.join(__dirname, 'apps');
  const themesPath = path.join(publicPath, 'themes');
  const guardAppStaticRoot = makeStaticRealpathGuard(appStaticPath, 'apps');
  const guardWidgetStaticRoot = makeStaticRealpathGuard(widgetsPath, 'widgets');
  const guardThemeStaticRoot = makeStaticRealpathGuard(themesPath, 'themes');

  app.get(
    '/apps/designer/main/:moduleName.js',
    makeParamTsHandler(designerMainTs, 'moduleName')
  );
  app.head(
    '/apps/designer/main/:moduleName.js',
    makeParamTsHandler(designerMainTs, 'moduleName')
  );
  app.get(
    '/apps/designer/managers/:moduleName.js',
    makeParamTsHandler(designerManagersTs, 'moduleName')
  );
  app.head(
    '/apps/designer/managers/:moduleName.js',
    makeParamTsHandler(designerManagersTs, 'moduleName')
  );
  Object.entries(modulePublicLoaderTsPaths).forEach(([moduleName, loaderTsPath]) => {
    app.get(
      `/mother/modules/${moduleName}/publicLoader.js`,
      makeFixedTsHandler(loaderTsPath)
    );
    app.head(
      `/mother/modules/${moduleName}/publicLoader.js`,
      makeFixedTsHandler(loaderTsPath)
    );
  });
  app.get('/modules/:moduleName/publicLoader.js', setStaticCorsHeaders, async (req, res, next) => {
    const moduleName = String(req.params.moduleName || '');
    if (!VALID_RUNTIME_MODULE.test(moduleName)) {
      return res.status(400).send('Bad request');
    }

    const loaderPath = path.resolve(modulePublicLoaderRoot, moduleName, 'publicLoader.js');
    const relativePath = path.relative(modulePublicLoaderRoot, loaderPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return res.status(403).send('Forbidden');
    }

    try {
      await fs.promises.access(loaderPath, fs.constants.R_OK);
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(loaderPath);
    } catch {
      next();
    }
  });
  app.head('/modules/:moduleName/publicLoader.js', setStaticCorsHeaders, async (req, res, next) => {
    const moduleName = String(req.params.moduleName || '');
    if (!VALID_RUNTIME_MODULE.test(moduleName)) {
      return res.status(400).end();
    }

    const loaderPath = path.resolve(modulePublicLoaderRoot, moduleName, 'publicLoader.js');
    const relativePath = path.relative(modulePublicLoaderRoot, loaderPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return res.status(403).end();
    }

    try {
      await fs.promises.access(loaderPath, fs.constants.R_OK);
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.end();
    } catch {
      next();
    }
  });

  app.use('/admin/assets', blockBrowserSourceFiles, express.static(path.join(publicPath, 'assets')));
  app.use('/build', setStaticCorsHeaders, express.static(buildPath));
  app.use('/ui', setStaticCorsHeaders, blockBrowserSourceFiles, express.static(path.join(__dirname, 'ui')));
  app.get('/apps/designer/origin-public-key.json', (req, res) => {
    const publicKeyPem = securityConfig.postMessage?.originToken?.publicKey;
    if (!publicKeyPem) {
      res.status(503).json({ error: 'Origin public key unavailable' });
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.json({ publicKey: publicKeyPem });
  });
  app.use('/apps', setStaticCorsHeaders, guardAppStaticRoot, blockBrowserSourceFiles, express.static(appStaticPath));
  app.use('/widgets', setStaticCorsHeaders, guardWidgetStaticRoot, blockBrowserSourceFiles, express.static(widgetsPath));
  app.use(
    '/plainspace',
    blockBrowserSourceFiles,
    express.static(path.join(publicPath, 'plainspace'))
  );

  // Expose icon manifest for client-side pickers
  app.get('/assets/icon-list.json', async (req, res) => {
    try {
      const files = await fs.promises.readdir(path.join(assetsPath, 'icons'));
      const icons = files.filter(f => f.endsWith('.svg'));
      res.json(icons);
    } catch (err) {
      console.error('[SERVER] Failed to build icon manifest', err);
      res.status(500).json({ error: 'Unable to load icons' });
    }
  });

  app.use('/assets', setStaticCorsHeaders, blockBrowserSourceFiles, express.static(assetsPath));
  app.use('/themes', setStaticCorsHeaders, guardThemeStaticRoot, blockThemeExecutableAssets, express.static(themesPath));
  app.use('/favicon.ico', express.static(path.join(publicPath,'favicon.ico')));
  app.use('/fonts', setStaticCorsHeaders, express.static(path.join(publicPath,'fonts')));

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
  const dbManagerToken = await getCoreModuleToken('databaseManager');
  const coreTokenCache = new Map([
    ['databaseManager', dbManagerToken]
  ]);
  async function getCachedCoreToken(moduleName) {
    if (!coreTokenCache.has(moduleName)) {
      coreTokenCache.set(moduleName, await getCoreModuleToken(moduleName));
    }
    return coreTokenCache.get(moduleName);
  }
  console.log('[SERVER INIT] dbManagerToken obtained.');

  // 3) Load other core modules
  const coreList = [
    { name:'databaseManager',     path:'mother/modules/databaseManager',     extra:{ app } },
    { name:'notificationManager', path:'mother/modules/notificationManager', extra:{ app } },
    { name:'settingsManager',     path:'mother/modules/settingsManager',     extra:{} },
    { name:'widgetManager',       path:'mother/modules/widgetManager',       extra:{} },
    { name:'appLoader',           path:'mother/modules/appLoader',           extra:{} },
    { name:'agentManager',        path:'mother/modules/agentManager',        extra:{} },
    { name:'agentAccess',         path:'mother/modules/agentAccess',         extra:{ authModuleSecret: AUTH_MODULE_SECRET } },
    { name:'designerManager',     path:'mother/modules/designerManager',     extra:{} },
    { name:'userManagement',      path:'mother/modules/userManagement',      extra:{ app } },
    { name:'contentEngine',       path:'mother/modules/contentEngine',       extra:{} },
    { name:'metadataManager',     path:'mother/modules/metadataManager',     extra:{} },
    { name:'workflowManager',     path:'mother/modules/workflowManager',     extra:{} },
    { name:'commentsManager',     path:'mother/modules/commentsManager',     extra:{} },
    { name:'navigationManager',   path:'mother/modules/navigationManager',   extra:{} },
    { name:'seoManager',          path:'mother/modules/seoManager',          extra:{} },
    { name:'searchManager',       path:'mother/modules/searchManager',       extra:{} },
    { name:'redirectManager',     path:'mother/modules/redirectManager',     extra:{} },
    { name:'pagesManager',        path:'mother/modules/pagesManager',        extra:{} },
    { name:'dependencyLoader',    path:'mother/modules/dependencyLoader',    extra:{} },
    { name:'requestManager',      path:'mother/modules/requestManager',      extra:{} },
    { name:'unifiedSettings',     path:'mother/modules/unifiedSettings',     extra:{ app } },
    { name:'serverManager',       path:'mother/modules/serverManager',       extra:{ app } },
    { name:'mediaManager',        path:'mother/modules/mediaManager',        extra:{ app } },
    { name:'shareManager',        path:'mother/modules/shareManager',        extra:{ app } },
    { name:'translationManager',  path:'mother/modules/translationManager',  extra:{} },
    { name:'plainSpace',          path:'mother/modules/plainSpace',          extra:{ app } },
    { name:'importer',            path:'mother/modules/importer',            extra:{} },
    { name:'exportManager',       path:'mother/modules/exportManager',       extra:{} },
    { name:'themeManager',        path:'mother/modules/themeManager',        extra:{} },
    { name:'runtimeManager',      path:'mother/modules/runtimeManager',      extra:{ app } },
    { name:'fontsManager',        path:'mother/modules/fontsManager',        extra:{} }
  ];

  for (const mod of coreList) {
    console.log(`[SERVER INIT] Loading ${mod.name}…`);
    const moduleJwt = await getCachedCoreToken(mod.name);
    await require(path.join(__dirname, mod.path, 'index.js'))
      .initialize({
        motherEmitter,
        isCore: true,
        jwt: moduleJwt,
        jwtToken: moduleJwt,
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
    await loader.loadAllModules({ emitter: motherEmitter, app, jwt: await getCachedCoreToken('moduleLoader') });
    console.log('[SERVER INIT] moduleLoader done.');
  } catch (e) {
    console.error('[SERVER INIT] moduleLoader fizzled →', e.message);
  }

  if (process.env.NODE_ENV === 'production') {
    try {
      const umToken = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'issueModuleToken',
          {
            skipJWT: true,
            authModuleSecret: AUTH_MODULE_SECRET,
            moduleType: 'core',
            moduleName: 'auth',
            signAsModule: 'userManagement',
            trustLevel: 'high'
          },
          (err, tok) => (err ? reject(err) : resolve(tok))
        );
      });
      const users = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'getAllUsers',
          { jwt: umToken, moduleName: 'userManagement', moduleType: 'core' },
          (err, data) => (err ? reject(err) : resolve(data || []))
        );
      });
      const weak = users.filter(
        u => u.username === 'admin' || !u.password || u.password.length < 60
      );
      if (weak.length) {
        abort(
          'Weak credentials detected for production.',
          'Remove default admin user and ensure all passwords are at least 12 characters.'
        );
      }
    } catch (err) {
      abort('Failed to verify user credentials: ' + err.message);
    }
  }

// ──────────────────────────────────────────────────────────────────────────
// 5) Meltdown API – proxy front-end requests into motherEmitter events
// ──────────────────────────────────────────────────────────────────────────

app.post('/api/meltdown', async (req, res) => {
  // 1) Read event name first so we know if it is public
  const { eventName, payload = {} } = req.body || {};
  const legacyFacade = translateLegacyHttpFacadeEvent(eventName, payload);
  const targetEventName = legacyFacade?.eventName || eventName;
  const targetPayload = stripHttpPayloadAuthMeta(legacyFacade?.payload || payload);
  const responseEventName = legacyFacade?.originalEventName || eventName;
  const eventRejected = explainExternalEventRejection(targetEventName, targetPayload);
  if (eventRejected) {
    return res.status(403).json({ error: eventRejected });
  }
  const isPublicEvent = isHttpPublicEvent(targetEventName);
  targetPayload.isExternalRequest = true;

  // 2) Extract the JWT. Explicit header token overrides the cookie
  //    to allow public operations even if a stale admin cookie exists.
  const headerJwt = req.get('X-Public-Token') || null;
  const cookieJwt = req.cookies?.admin_jwt || null;
  const jwt = headerJwt || cookieJwt;

  // 3) If no JWT and this is not a public event => reject
  if (!jwt && !isPublicEvent) {
    return res.status(401).json({ error: 'Authentication required: missing JWT.' });
  }

  if (!isPublicEvent && jwt) {
    try {
      const decoded = await validateAdminToken(jwt);
      if (!isHttpPublicTokenEvent(targetEventName) && !isHttpAdminPrincipal(decoded)) {
        return res.status(403).json({ error: 'Admin authentication required.' });
      }
      targetPayload.decodedJWT = decoded;
      targetPayload.jwt = jwt;
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
    targetPayload.jwt = jwt;
  }

  if (
    typeof motherEmitter.listenerCount === 'function' &&
    motherEmitter.listenerCount(targetEventName) === 0
  ) {
    return res.status(404).json({ error: `Event "${responseEventName}" is not registered.` });
  }

  // 4) Emit the event and return JSON
  motherEmitter.emit(targetEventName, targetPayload, (err, data) => {
    if (err) {
      const safeEvent = String(responseEventName).replace(/[\n\r]/g, '');
      console.error('[MELTDOWN] Event "%s" failed => %s', safeEvent, err.message);
      return res.status(500).json({ error: err.message });
    }
    return res.json({
      eventName: responseEventName,
      data: legacyFacade?.unwrapData ? data?.data : data
    });
  });
});

// Batch variant to reduce number of requests from the admin UI
app.post('/api/meltdown/batch', async (req, res) => {
  const { events } = req.body || {};
  if (!Array.isArray(events)) {
    return res.status(400).json({ error: 'Invalid events array' });
  }

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

    const legacyFacade = translateLegacyHttpFacadeEvent(eventName, payload);
    const targetEventName = legacyFacade?.eventName || eventName;
    const targetPayload = stripHttpPayloadAuthMeta(legacyFacade?.payload || payload);
    const responseEventName = legacyFacade?.originalEventName || eventName;

    const eventRejected = explainExternalEventRejection(targetEventName, targetPayload);
    if (eventRejected) {
      results.push({ eventName: responseEventName, error: eventRejected });
      continue;
    }

    const isPublicEvent = isHttpPublicEvent(targetEventName);
    const isPublicTokenEvent = isHttpPublicTokenEvent(targetEventName);
    targetPayload.isExternalRequest = true;

    const jwt = globalJwt;

    if (!jwt && !isPublicEvent) {
      results.push({ eventName: responseEventName, error: 'Authentication required: missing JWT.' });
      continue;
    }

    if (!isPublicEvent && jwt) {
      try {
        const decoded = await validateAdminToken(jwt);
        if (!isPublicTokenEvent && !isHttpAdminPrincipal(decoded)) {
          results.push({ eventName: responseEventName, error: 'Admin authentication required.' });
          continue;
        }
        targetPayload.decodedJWT = decoded;
        targetPayload.jwt = jwt;
      } catch (err) {
        console.warn('[POST /api/meltdown/batch] Invalid admin token =>', err.message);
        results.push({ eventName: responseEventName, error: 'Invalid token' });
        continue;
      }
    } else if (jwt) {
      targetPayload.jwt = jwt;
    }

    if (
      typeof motherEmitter.listenerCount === 'function' &&
      motherEmitter.listenerCount(targetEventName) === 0
    ) {
      results.push({ eventName: responseEventName, error: `Event "${responseEventName}" is not registered.` });
      continue;
    }

    try {
      const data = await new Promise((resolve, reject) => {
        motherEmitter.emit(targetEventName, targetPayload, (err, d) => err ? reject(err) : resolve(d));
      });
      results.push({
        eventName: responseEventName,
        data: legacyFacade?.unwrapData ? data?.data : data
      });
    } catch (err) {
      const safeEvent = String(responseEventName).replace(/[\n\r]/g, '');
      console.error('[MELTDOWN BATCH] Event "%s" failed => %s', safeEvent, err.message);
      results.push({ eventName: responseEventName, error: err.message });
    }
  }

  return res.json({ results });
});


// ─────────────────────────────────────────────────────────────────
// 6) CSRF-protected login endpoint
// ─────────────────────────────────────────────────────────────────

app.post('/admin/api/login', loginLimiter, csrfProtection, async (req, res) => {

  const { username, password } = req.body;

  const localIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  const weakPw = typeof password === 'string' && password.length < 12;
  const weakCreds = (username === 'admin' && password === '123') || weakPw;
  if (weakCreds) {
    const allowWeak = process.env.ALLOW_WEAK_CREDS === 'I_KNOW_THIS_IS_LOCAL';
    if (isProduction || !localIps.includes(req.ip) || !allowWeak) {
      return res
        .status(401)
        .json({ success: false, error: 'Weak credentials not allowed' });
    }
  }

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

// App install endpoint
app.post('/admin/api/apps/install', csrfProtection, async (req, res) => {
  const adminJwt = req.cookies?.admin_jwt;
  if (!adminJwt) return res.status(401).send('Unauthorized');
  let decoded;
  try {
    decoded = await validateAdminToken(adminJwt);
  } catch {
    return res.status(401).send('Unauthorized');
  }
  if (!hasPermission(decoded, 'builder.manage')) {
    return res.status(403).send('Forbidden');
  }

  const appName = sanitizeSlug(req.body?.appName || '');
  const sourceDir = typeof req.body?.sourceDir === 'string' ? req.body.sourceDir : '';
  if (!appName || !sourceDir) return res.status(400).send('Missing parameters');
  try {
    const result = await dispatchAppLoaderEvent(adminJwt, decoded, 'installAppFromDirectory', {
      appName,
      sourceDir
    });
    res.status(201).json({ installed: result.appName, app: result });
  } catch (err) {
    console.warn('[APP INSTALL] failed', err);
    const status = /Invalid|Missing|escapes|source|app\.json|moduleInfo\.json|widgetInfo\.json|symlinks|junctions|sensitive runtime file/i.test(err.message) ? 400 : 500;
    res.status(status).send(status === 400 ? err.message : 'Install failed');
  }
});

// App uninstall endpoint
app.delete('/admin/api/apps/:appName', csrfProtection, async (req, res) => {
  const adminJwt = req.cookies?.admin_jwt;
  if (!adminJwt) return res.status(401).send('Unauthorized');
  let decoded;
  try {
    decoded = await validateAdminToken(adminJwt);
  } catch {
    return res.status(401).send('Unauthorized');
  }
  if (!hasPermission(decoded, 'builder.manage')) {
    return res.status(403).send('Forbidden');
  }
  const appName = sanitizeSlug(req.params.appName);
  if (!appName) return res.status(400).send('Missing app name');
  try {
    const result = await dispatchAppLoaderEvent(adminJwt, decoded, 'uninstallApp', { appName });
    res.json({ removed: result.appName, app: result });
  } catch (err) {
    console.warn('[APP UNINSTALL] failed', err);
    const status = /Invalid|escapes/i.test(err.message) ? 400 : 500;
    res.status(status).send(status === 400 ? err.message : 'Uninstall failed');
  }
});

// PlainSpace reseed endpoint
// Re-applies default widget instances and admin page layouts using the same
// logic as a user save. Requires admin_jwt with sufficient permissions.
app.post('/admin/api/plainspace/reseed', csrfProtection, async (req, res) => {
  const adminJwt = req.cookies?.admin_jwt;
  if (!adminJwt) return res.status(401).send('Unauthorized');
  let decoded;
  try {
    decoded = await validateAdminToken(adminJwt);
  } catch {
    return res.status(401).send('Unauthorized');
  }
  const allowed = hasPermission(decoded, 'builder.manage') ||
                  hasPermission(decoded, 'plainspace.saveLayout');
  if (!allowed) return res.status(403).send('Forbidden');

  try {
    // 1) Ensure default widget instances exist/are updated
    let widgetCount = 0;
    for (const w of DEFAULT_WIDGETS) {
      const { options = {}, ...data } = w;
      await psSeedAdminWidget(motherEmitter, adminJwt, data, options);
      widgetCount++;
    }

    // 2) Re-seed admin pages layouts using widget instance defaults
    await psSeedAdminPages(motherEmitter, adminJwt, ADMIN_PAGES);

    return res.json({ success: true, widgetsSeeded: widgetCount, pagesSeeded: ADMIN_PAGES.length });
  } catch (err) {
    console.error('[RESEED] Failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});



// ──────────────────────────────────────────────────────────────────────────
// 7a) Admin entry point: redirect to /admin/home and render shell
// ──────────────────────────────────────────────────────────────────────────

app.use('/admin/api/agent-access', loginLimiter, createAgentAccessPublicRouter({
  motherEmitter
}));

app.use('/admin/api/agent-access', csrfProtection, createAgentAccessAdminRouter({
  motherEmitter,
  validateAdminToken
}));

app.use('/admin/api/agent', csrfProtection, createAgentApiRouter({
  motherEmitter,
  validateAdminToken
}));

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

async function fetchAdminPageBySlug(adminJwt, slug) {
  return new Promise((resolve, reject) => {
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
}

function prepareAdminShellHtml({ csrfToken, adminToken, slug, pageId }) {
  const nonce = crypto.randomBytes(16).toString('base64');
  let html = fs.readFileSync(path.join(publicPath, 'admin.html'), 'utf8');
  if (renderMode === 'server') {
    html = html.replace(
      /<script type="module" src="\/build\/pageRenderer.js"><\/script>\s*/i,
      ''
    );
  }

  const csrfSafe = escapeHtml(csrfToken);
  const headInjection = `
      <meta name="csrf-token" content="${csrfSafe}">
      <script nonce="${nonce}">
        window.CSRF_TOKEN = ${JSON.stringify(csrfToken)};
        window.PAGE_ID     = ${JSON.stringify(pageId ?? null)};
        window.PAGE_SLUG   = ${JSON.stringify(slug)};
        window.ADMIN_TOKEN = ${JSON.stringify(adminToken)};
        window.ACTIVE_THEME = ${JSON.stringify(ACTIVE_THEME)};
        window.PLAINSPACE_VERSION = ${JSON.stringify(PLAINSPACE_VERSION)};
        window.NONCE       = ${JSON.stringify(nonce)};
      </script>
    </head>`;

  html = html.replace('</head>', headInjection);
  html = injectDevBanner(html);

  return { html, nonce };
}

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
        const slug = sanitizeSlug('home');
        let pageId = null;
        try {
          const page = await fetchAdminPageBySlug(req.cookies.admin_jwt, slug);
          if (page?.id) {
            pageId = page.id;
          }
        } catch (pageErr) {
          console.warn('[GET /admin/home] Failed to load home page context =>', pageErr.message);
        }

        const { html, nonce } = prepareAdminShellHtml({
          csrfToken: req.csrfToken(),
          adminToken: req.cookies.admin_jwt,
          slug,
          pageId
        });

        res.setHeader('Content-Security-Policy', `script-src 'self' blob: 'nonce-${nonce}';`);
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
    const devAutoLoginAllowed = await isDevAutoLoginAllowed();
    let html = fs.readFileSync(path.join(publicPath, 'login.html'), 'utf8');
    html = html.replace('{{CSRF_TOKEN}}', req.csrfToken())
      .replace('{{DEV_AUTOLOGIN}}', devAutoLoginAllowed ? 'true' : '')
      .replace('{{DEV_USER}}', process.env.DEV_USER || '')
      .replace('{{ALLOW_WEAK_CREDS}}', (process.env.ALLOW_WEAK_CREDS === 'I_KNOW_THIS_IS_LOCAL') ? 'true' : '');
    html = injectDevBanner(html);
    return res.send(html);

  } catch (err) {
    console.error('[ADMIN /home] Error:', err);
    const devAutoLoginAllowed = await isDevAutoLoginAllowed();
    let html = fs.readFileSync(path.join(publicPath, 'login.html'), 'utf8');
    html = html.replace('{{CSRF_TOKEN}}', req.csrfToken())
      .replace('{{DEV_AUTOLOGIN}}', devAutoLoginAllowed ? 'true' : '')
      .replace('{{DEV_USER}}', process.env.DEV_USER || '')
      .replace('{{ALLOW_WEAK_CREDS}}', (process.env.ALLOW_WEAK_CREDS === 'I_KNOW_THIS_IS_LOCAL') ? 'true' : '');
    html = injectDevBanner(html);
    return res.send(html);
  }
});



// ──────────────────────────────────────────────────────────────────────────
// 7b) App launcher at /admin/app/:appName
// ──────────────────────────────────────────────────────────────────────────
// User-facing Design Studio route. The internal app name remains "designer"
// so existing app manifests, events and stored links stay valid.
app.get('/admin/studio/design/:designId?', csrfProtection, (req, res) => {
  const designId = String(req.params.designId || '').replace(/[\r\n/\\]/g, '').trim();
  const queryIndex = req.originalUrl.indexOf('?');
  const queryString = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
  const target = designId
    ? `/admin/app/designer/${encodeURIComponent(designId)}`
    : '/admin/app/designer';
  return res.redirect(302, `${target}${queryString}`);
});

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
  let launchInfo;
  try {
    launchInfo = await dispatchAppLoaderEvent(adminJwt, decoded, 'getAppLaunchInfo', { appName });
  } catch (err) {
    console.warn('[GET /admin/app] launch info failed =>', err.message);
    if (/Forbidden/i.test(err.message)) {
      return res.status(403).send('Forbidden');
    }
    if (/Unknown app|Missing app\.json|Invalid app name/i.test(err.message)) {
      return res.status(404).send('App not found');
    }
    return res.status(500).send('Invalid app manifest');
  }

  const manifest = launchInfo?.appInfo || {};
  if (Array.isArray(manifest.permissions) &&
      !manifest.permissions.every(p => hasPermission(decoded, p))) {
    return res.status(403).send('Forbidden');
  }

  const indexPath = path.join(appDir, 'index.html');
  if (!launchInfo.isActive || !manifest.hasIndexHtml || !manifest.isBuilt || !fs.existsSync(indexPath)) {
    return res.status(500).send('App build missing');
  }

  const requiredEvents = Array.isArray(manifest.requiredEvents)
    ? manifest.requiredEvents
    : [];
  const missingEvents = requiredEvents.filter(ev => !motherEmitter.listenerCount(ev));
  if (missingEvents.length) {
    const appSafe = escapeHtml(appName);
    const missingList = missingEvents
      .map(ev => `<li>${escapeHtml(ev)}</li>`)
      .join('');
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${appSafe} unavailable</title></head>` +
      `<body class="dashboard-app"><p>App "${appSafe}" cannot start because required API events are missing:</p><ul>${missingList}</ul></body></html>`;
    return res.status(503).send(html);
  }

  const idParam = sanitizeSlug(req.params.pageId || '');
  let pageTitle = manifest.title || manifest.name || 'App';
  let designVersion = null;
  let pageId = null;
  let designId = null;
  if (appName === 'designer' && idParam) {
    designId = idParam;
    try {
      const design = await new Promise((resolve, reject) => {
        motherEmitter.emit('designer.getDesign', { id: designId }, (err, res) => {
          if (err) return reject(err);
          resolve(res);
        });
      });
      if (design?.design?.title) {
        pageTitle = design.design.title;
      }
      const dv = parseInt(design?.design?.version, 10);
      if (!Number.isNaN(dv)) designVersion = String(dv);
    } catch (err) {
      console.warn('[GET /admin/app] failed to fetch design title =>', err.message);
    }
  } else if (idParam) {
    pageId = idParam;
  }
  const titleSafe = escapeHtml(pageTitle);
  const configuredOrigins = Array.isArray(securityConfig.postMessage?.allowedOrigins)
    ? securityConfig.postMessage.allowedOrigins.filter(Boolean)
    : [];
  const requestHost = req.get('host');
  if (requestHost) {
    try {
      const origin = new URL(`${req.protocol}://${requestHost}`).origin;
      if (!configuredOrigins.includes(origin)) {
        configuredOrigins.push(origin);
      }
    } catch (err) {
      console.warn('[GET /admin/app] Failed to derive request origin =>', err.message);
    }
  }
  const queryParams = new URLSearchParams();
  if (appName === 'designer' && designId) {
    queryParams.set('designId', designId);
    if (designVersion) {
      queryParams.set('designVersion', designVersion);
    }
  } else if (pageId) {
    queryParams.set('pageId', pageId);
  }
  let originToken = null;
  const originPublicKeyPem = securityConfig.postMessage?.originToken?.publicKey || '';
  const originPublicKeyBase64 = originPublicKeyPem
    ? Buffer.from(originPublicKeyPem, 'utf8').toString('base64')
    : '';
  if (configuredOrigins.length) {
    originToken = createOriginToken(configuredOrigins);
    if (originToken) {
      queryParams.set('originToken', originToken);
    }
  }
  const queryString = queryParams.toString();
  const iframeSrc = `/apps/${appName}/index.html${queryString ? `?${queryString}` : ''}`;

  const csrfSafe = escapeHtml(req.csrfToken());
  const adminSafe = escapeHtml(adminJwt);
  const appSafe = escapeHtml(appName);
  const allowedOriginsSafe = escapeHtml(configuredOrigins.join(','));
  const originPublicKeySafe = escapeHtml(originPublicKeyBase64);
  const agentSurfaceConfig = manifest.agentSurface
    ? (manifest.agentSurface === true ? 'true' : JSON.stringify(manifest.agentSurface))
    : '';
  const agentSurfaceSafe = escapeHtml(agentSurfaceConfig);
  const originTokenAttr = originToken ? ` data-origin-token="${escapeHtml(originToken)}"` : '';
  const appSandbox = 'allow-scripts allow-forms allow-downloads allow-popups allow-modals';

  let html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${titleSafe}</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="${csrfSafe}"><meta name="admin-token" content="${adminSafe}"><meta name="app-name" content="${appSafe}"><meta name="app-agent-surface" content="${agentSurfaceSafe}"><meta name="app-frame-allowed-origins" content="${allowedOriginsSafe}"><meta name="app-frame-origin-public-key" content="${originPublicKeySafe}"><link rel="stylesheet" href="/assets/css/app.css"><script src="/build/meltdownEmitter.js"></script><script src="/build/openExplorer.js"></script><script type="module" src="/build/agentConsole.js"></script><script type="module" src="/build/appFrameLoader.js"></script></head><body class="dashboard-app"><iframe id="app-frame" src="${iframeSrc}" data-allowed-origins="${allowedOriginsSafe}"${originTokenAttr} sandbox="${appSandbox}" allow="clipboard-read; clipboard-write" referrerpolicy="origin" frameborder="0" style="width:100%;height:100vh;overflow:hidden;"></iframe></body></html>`;
  html = injectDevBanner(html);
  return res.send(html);
});

// ──────────────────────────────────────────────────────────────────────────
// 7c) Admin SPA shell for any /admin/<slug> path
// ──────────────────────────────────────────────────────────────────────────

// Capture any admin page slug via wildcard and parse req.params[0]
app.get('/admin/*', csrfProtection, async (req, res, next) => {

  let adminJwt = req.cookies?.admin_jwt;

  if (!adminJwt) {
    adminJwt = await maybeIssueDevAdminSession(req, res, 'admin wildcard');
  }

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
    const page = await fetchAdminPageBySlug(adminJwt, slug);

    if (!page?.id || page.lane !== 'admin') {
      return next();
    }

    const csrfTok = req.csrfToken();

    const { html, nonce } = prepareAdminShellHtml({
      csrfToken: csrfTok,
      adminToken: adminJwt,
      slug,
      pageId: pageId ?? page.id
    });

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

    const devAutoLoginAllowed = await isDevAutoLoginAllowed();
    let html = fs.readFileSync(path.join(publicPath, 'login.html'), 'utf8');
    html = html.replace('{{CSRF_TOKEN}}', req.csrfToken())
      .replace('{{DEV_AUTOLOGIN}}', devAutoLoginAllowed ? 'true' : '')
      .replace('{{DEV_USER}}', process.env.DEV_USER || '')
      .replace('{{ALLOW_WEAK_CREDS}}', (process.env.ALLOW_WEAK_CREDS === 'I_KNOW_THIS_IS_LOCAL') ? 'true' : '');
    html = injectDevBanner(html);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(html);
  } catch (err) {
    console.error('[GET /login] Error:', err);
    res.status(500).send('Server misconfiguration');
  }
});

// Convenience redirect for first-time registration

app.post('/install', loginLimiter, csrfProtection, async (req, res) => {
  const { username, email, password, favoriteColor, siteName } = req.body || {};
  const trimmedUsername = String(username || '').trim();
  const trimmedEmail = String(email || '').trim();
  const trimmedSiteName = siteName != null ? String(siteName).trim() : '';
  const safePassword = typeof password === 'string' ? password : '';
  const localIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  const allowWeak = process.env.ALLOW_WEAK_CREDS === 'I_KNOW_THIS_IS_LOCAL';
  const isLocal = localIps.includes(req.ip);
  const forbidden = ['admin', 'root', 'test'];

  const { error } = validateInstallInput(
    { username: trimmedUsername, email: trimmedEmail, password: safePassword },
    { forbidden, allowWeak, isLocal }
  );

  if (error) {
    return res.status(error.status).send(error.message);
  }

  const strong = safePassword.length >= 12 && /[a-z]/.test(safePassword) && /[A-Z]/.test(safePassword) && /\d/.test(safePassword);
  if (!strong && (!allowWeak || !isLocal)) {
    return res.status(400).send('Password too weak');
  }
  try {
    const installationStatus = await getInstallationStatus();
    const userManagementToken = await getCachedCoreToken('userManagement');
    const settingsManagerToken = await getCachedCoreToken('settingsManager');

    if (installationStatus.complete || installationStatus.hasPersistentData) {
      return res.status(403).send('Already installed');
    }

    await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'createUser',
        {
          jwt: userManagementToken,
          moduleName: 'userManagement',
          moduleType: 'core',
          username: trimmedUsername,
          password: safePassword,
          email: trimmedEmail,
          displayName: trimmedUsername,
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
          jwt: settingsManagerToken,
          moduleName: 'settingsManager',
          moduleType: 'core',
          key: 'FIRST_INSTALL_DONE',
          value: 'true'
        },
        err => (err ? reject(err) : resolve())
      );
    });
    if (trimmedSiteName) {
      await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'setSetting',
          {
            jwt: settingsManagerToken,
            moduleName: 'settingsManager',
            moduleType: 'core',
            key: 'SITE_NAME',
            value: trimmedSiteName
          },
          err => (err ? reject(err) : resolve())
        );
      });
    }
    fs.writeFileSync(installLockPath, 'installed');
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /install] Error:', err);
    res.status(500).send('Installation failed');
  }
});

app.get('/install', csrfProtection, async (req, res) => {
  try {
    const installationStatus = await getInstallationStatus();

    if (installationStatus.complete || installationStatus.hasPersistentData) {
      return res.redirect('/login');
    }
    const devAutoLoginAllowed = await isDevAutoLoginAllowed();
    let html = fs.readFileSync(path.join(publicPath, 'install.html'), 'utf8');
    html = html.replace('{{CSRF_TOKEN}}', req.csrfToken())
      .replace('{{DEV_AUTOLOGIN}}', devAutoLoginAllowed ? 'true' : '')
      .replace('{{DEV_USER}}', process.env.DEV_USER || '')
      .replace('{{ALLOW_WEAK_CREDS}}', (process.env.ALLOW_WEAK_CREDS === 'I_KNOW_THIS_IS_LOCAL') ? 'true' : '');
    html = injectDevBanner(html);
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
    '/build',
    '/ui',
    '/login',
    '/favicon.ico',
    '/plainspace',
    '/themes',
    '/apps',
    '/widgets',
    '/fonts'
  ];
  if (allowedPrefixes.some(p => req.path.startsWith(p))) return next();
  const settingsManagerToken = await getCachedCoreToken('settingsManager');
  const pagesManagerToken = await getCachedCoreToken('pagesManager');
  

  // check the flag
  const isMaintenance = await new Promise((Y, N) => {
    motherEmitter.emit(
      'getSetting',
      {
        jwt: settingsManagerToken,
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
        jwt: settingsManagerToken,
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
            jwt: pagesManagerToken,
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
        /<script type="module" src="\/build\/pageRenderer.js"><\/script>\s*/i,
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
  const settingsManagerToken = await getCachedCoreToken('settingsManager');
  const userManagementToken = await getCachedCoreToken('userManagement');
  const firstInstallDone = await new Promise((resolve, reject) => {
    motherEmitter.emit(
      'getSetting',
      {
        jwt         : settingsManagerToken,
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
        { jwt: userManagementToken, moduleName: 'userManagement', moduleType: 'core' },
        (err, count = 0) => (err ? reject(err) : resolve(count))
      );
    });

    if (userCount > 0) {
      console.log('[APP] FIRST_INSTALL_DONE false but users exist => marking installed.');
      await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'setSetting',
          {
            jwt         : settingsManagerToken,
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
