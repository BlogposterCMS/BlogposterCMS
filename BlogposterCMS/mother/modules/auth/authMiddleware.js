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
function verifyToken(token, cb) {
  motherEmitter.emit(
    'validateToken',
    {
      jwt            : token,
      moduleName     : 'auth',
      moduleType     : 'core',
      tokenToValidate: token
    },
    cb
  );
}

/* ──────────────────────────────────────────────────────────────── *
 *  Helper #2 – if it quacks like an admin, give it the wildcard
 * ──────────────────────────────────────────────────────────────── */
function attachWildcardIfAdmin(decoded) {
  const isAdmin = decoded.role === 'admin'
               || decoded.roles?.includes('admin');
  if (isAdmin) decoded.permissions = { '*': true };
}

/* ──────────────────────────────────────────────────────────────── *
 *  1) Cookie‑based auth for SSR routes
 *     – No token? → polite redirect to /login
 * ──────────────────────────────────────────────────────────────── */
function requireAuthCookie(req, res, next) {
  let token = req.cookies?.admin_jwt;

  if (!token && process.env.NODE_ENV === 'development' && process.env.DEV_AUTOLOGIN === 'true') {
    const localIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    const devUser = process.env.DEV_USER || 'admin';
    if (localIps.includes(req.ip) && process.env.AUTH_MODULE_INTERNAL_SECRET) {
      try {
        motherEmitter.emit(
          'issueModuleToken',
          {
            skipJWT: true,
            authModuleSecret: process.env.AUTH_MODULE_INTERNAL_SECRET,
            moduleType: 'core',
            moduleName: 'auth',
            signAsModule: 'userManagement',
            trustLevel: 'high'
          },
          (err, moduleTok) => {
            if (err || !moduleTok) {
              return finalize();
            }
            motherEmitter.emit(
              'getUserDetailsByUsername',
              { jwt: moduleTok, moduleName: 'userManagement', moduleType: 'core', username: devUser },
              (uErr, user) => {
                if (uErr || !user) {
                  // DEV-User fehlt → kein Auto-Login, normal zum Login umleiten
                  return finalize();
                }
                motherEmitter.emit(
                  'finalizeUserLogin',
                  {
                    jwt: moduleTok,
                    moduleName: 'userManagement',
                    moduleType: 'core',
                    userId: user.id,
                    extraData: { provider: 'devAutoLogin' }
                  },
                  (fErr, finalUser) => {
                    if (fErr || !finalUser) return finalize();
                    res.cookie('admin_jwt', finalUser.jwt, {
                      path: '/',
                      httpOnly: true,
                      sameSite: 'strict',
                      secure: false,
                      maxAge: 2 * 60 * 60 * 1000
                    });
                    token = finalUser.jwt;
                    req.user = finalUser;
                    next();
                  }
                );
              }
            );
          }
        );
        return; // async path
      } catch (e) {
        // fall through to normal flow
      }
    }
  }

  function finalize() {
    const jump = `/login?redirectTo=${encodeURIComponent(req.originalUrl)}`;
    return res.redirect(jump);
  }

  if (!token) {
    return finalize();
  }

  verifyToken(token, (err, decoded) => {
    if (err || !decoded) {
      return finalize();
    }

    attachWildcardIfAdmin(decoded);
    req.user = decoded;
    next();
  });
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

  verifyToken(token, (err, decoded) => {
    if (err || !decoded)
      return res.status(401).json({ error: 'Unauthorized – invalid token' });

    attachWildcardIfAdmin(decoded);
    req.user = decoded;
    next();
  });
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
};
