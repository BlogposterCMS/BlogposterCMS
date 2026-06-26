//  utils/httpsRedirect.js
// ────────────────────────────────────────────────────────────────
//  If a request arrives over plain HTTP **and** the host has
//  signalled “I support TLS”, bounce to https://…
//
//  • Works behind nginx / Traefik / Heroku → remember `trust proxy`
//  • Adds HSTS (1 year, includeSubDomains, preload)
// ────────────────────────────────────────────────────────────────
module.exports = function httpsRedirect (req, res, next) {

    const isSecure     = req.secure ||              // Express flag
                         req.headers['x-forwarded-proto'] === 'https';
  
    if (!isSecure) {
      const to = `https://${req.headers.host}${req.originalUrl}`;
      return res.redirect(301, to);                 // permanent
    }
  
    // Already HTTPS → arm HSTS
    res.setHeader('Strict-Transport-Security',
                  'max-age=31536000; includeSubDomains; preload');
  
    next();
  };
  