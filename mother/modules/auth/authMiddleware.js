

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

/**
 * mother/modules/auth/authMiddleware.js
 *
 * Exports (same names as before, so nothing breaks):
 *   ▸ requireAuthCookie   – for SSR / HTML routes (redirects on 401)
 *   ▸ requireAuthHeader   – for API routes with Bearer token (JSON 401)
 *   ▸ requireAdminRole    – simple role‑check
 *   ▸ requireRole(role)   – parametric role‑check
 *
 * Yes, we save the kingdom with middleware. You’re welcome.
 */

require('dotenv').config();
const { motherEmitter } = require('../../emitters/motherEmitter');

/* ──────────────────────────────────────────────────────────────── *
 *  Helper #1 – centralised token validation so we don’t copy‑paste
 * ──────────────────────────────────────────────────────────────── */
function verifyToken(token) {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.VALIDATE_TOKEN, {
      jwt            : token,
      moduleName     : 'auth',
      moduleType     : 'core',
      tokenToValidate: token
    });
}

/* ──────────────────────────────────────────────────────────────── *
 *  Helper #2 – if it quacks like an admin, give it the wildcard
 * ──────────────────────────────────────────────────────────────── */
function attachWildcardIfAdmin(decoded) {
  const isAdmin = decoded.role === 'admin'
               || decoded.roles?.includes('admin');
  if (isAdmin) decoded.permissions = { '*': true };
}

function isLoopbackAddress(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;

  return normalized === 'localhost'
      || normalized === '::1'
      || normalized === '0:0:0:0:0:0:0:1'
      || normalized === '127.0.0.1'
      || normalized.startsWith('127.')
      || normalized.startsWith('::ffff:127.')
      || normalized === '::ffff:7f00:1';
}

function isLocalDevRequest(req) {
  return [
    req?.ip,
    req?.hostname,
    req?.socket?.remoteAddress,
    req?.connection?.remoteAddress
  ].some(isLoopbackAddress);
}

async function issueDevAutologin({ emitter, req, res, next, finalize, devUser }) {
  try {
    const moduleTok = await requestBackendEvent(emitter, BACKEND_EVENTS.ISSUE_MODULE_TOKEN, {
      skipJWT: true,
      authModuleSecret: process.env.AUTH_MODULE_INTERNAL_SECRET,
      moduleType: 'core',
      moduleName: 'auth',
      signAsModule: 'userManagement',
      trustLevel: 'high'
    });
    if (!moduleTok) throw new Error('AUTH_DEV_AUTOLOGIN_MODULE_TOKEN_MISSING');

    const user = await requestBackendEvent(emitter, BACKEND_EVENTS.GET_USER_DETAILS_BY_USERNAME, {
      jwt: moduleTok,
      moduleName: 'userManagement',
      moduleType: 'core',
      username: devUser
    });
    if (!user) throw new Error('AUTH_DEV_AUTOLOGIN_USER_NOT_FOUND');

    const finalUser = await requestBackendEvent(emitter, BACKEND_EVENTS.FINALIZE_USER_LOGIN, {
      jwt: moduleTok,
      moduleName: 'userManagement',
      moduleType: 'core',
      userId: user.id,
      extraData: { provider: 'devAutoLogin' }
    });
    if (!finalUser) throw new Error('AUTH_DEV_AUTOLOGIN_FINAL_USER_MISSING');

    res.cookie('admin_jwt', finalUser.jwt, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      maxAge: 2 * 60 * 60 * 1000
    });
    req.user = finalUser;
    next();
  } catch (err) {
    finalize(err);
  }
}

/* ──────────────────────────────────────────────────────────────── *
 *  1) Cookie‑based auth for SSR routes
 *     – No token? → polite redirect to /admin/login
 * ──────────────────────────────────────────────────────────────── */
function requireAuthCookie(req, res, next) {
  let token = req.cookies?.admin_jwt;

  const localDevMode = process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production';
  if (!token && localDevMode && process.env.DEV_AUTOLOGIN !== 'false') {
    const devUser = process.env.DEV_USER || 'admin';
    if (isLocalDevRequest(req) && process.env.AUTH_MODULE_INTERNAL_SECRET) {
      issueDevAutologin({
        emitter: motherEmitter,
        req,
        res,
        next,
        finalize,
        devUser
      });
      return; // async path
    }
  }

  function finalize() {
    const jump = `/admin/login?redirectTo=${encodeURIComponent(req.originalUrl)}`;
    return res.redirect(jump);
  }

  if (!token) {
    return finalize();
  }

  verifyToken(token).then(decoded => {
    if (!decoded) return finalize();
    attachWildcardIfAdmin(decoded);
    req.user = decoded;
    next();
  }, finalize);
}

/* ──────────────────────────────────────────────────────────────── *
 *  2) Header‑based auth for JSON APIs
 *     – Missing / bad token? → 401 JSON
 * ──────────────────────────────────────────────────────────────── */
function requireAuthHeader(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token)
    return res.status(401).json({ error: 'Unauthorized – no token' });

  verifyToken(token).then(decoded => {
    if (!decoded) return res.status(401).json({ error: 'Unauthorized – invalid token' });
    attachWildcardIfAdmin(decoded);
    req.user = decoded;
    next();
  }, () => res.status(401).json({ error: 'Unauthorized – invalid token' }));
}

/* ──────────────────────────────────────────────────────────────── *
 *  3) Role guards – because sometimes you need a bouncer
 * ──────────────────────────────────────────────────────────────── */
function requireAdminRole(req, res, next) {
  if (!req.user)
    return res.status(401).json({ error: 'Unauthorized – no user' });

  if (!Array.isArray(req.user.roles) || !req.user.roles.includes('admin'))
    return res.status(403).json({ error: 'Forbidden – not an admin' });

  next();
}

function requireRole(desiredRole) {
  return (req, res, next) => {
    if (!req.user)
      return res.status(401).json({ error: 'Unauthorized – no user' });

    if (!Array.isArray(req.user.roles) || !req.user.roles.includes(desiredRole))
      return res
        .status(403)
        .json({ error: `Forbidden – requires role=${desiredRole}` });

    next();
  };
}

/* ──────────────────────────────────────────────────────────────── */
module.exports = {
  requireAuthCookie,
  requireAuthHeader,
  requireAdminRole,
  requireRole,
  _internals: {
    issueDevAutologin,
    isLoopbackAddress,
    isLocalDevRequest,
  },
};
