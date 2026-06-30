/**
 * mother/modules/auth/permissionMiddleware.js
 *
 * Middleware to verify permissions in routes, with wildcard (*) support.
 *
 * Because obviously, we can't just trust users to do the right thing.
 */

function requirePermission(keyPath) {
  // keyPath can be dot-notation:
  // e.g. "userManagement.listUsers" or "content.pages.publish"
  return (req, res, next) => {
    if (!req.user || !req.user.permissions) {
      console.warn('[PERMISSION MIDDLEWARE] No user or no permissions found. Who invited you?');
      return res.status(403).send('Forbidden – missing permissions');
    }

    // Admin or wildcard => immediate pass
    if (req.user.permissions['*'] === true) {
      return next();
    }

    // Dot-notation check
    const parts = keyPath.split('.');
    let current = req.user.permissions;

    for (let part of parts) {
      if (current['*'] === true) {
        return next();
      }
      if (typeof current[part] === 'undefined') {
        console.warn(`[PERMISSION MIDDLEWARE] Missing permission "${keyPath}" at segment "${part}"`);
        return res.status(403).send(`Forbidden – missing permission: ${keyPath}`);
      }
      current = current[part];
    }

    if (current !== true) {
      console.warn(`[PERMISSION MIDDLEWARE] Permission "${keyPath}" is not set to true (I see a falsey).`);
      return res.status(403).send(`Forbidden – permission not granted: ${keyPath}`);
    }
    next();
  };
}

module.exports = { requirePermission };
