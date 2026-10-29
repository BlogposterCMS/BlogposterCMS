'use strict';

const express = require('express');

/** Keep the host mount stable while each generation owns its route handlers. */
function createCoreModuleHttpScope(scope) {
  const router = express.Router();
  const routes = [];
  const requests = new WeakSet();

  function wrap(handler) {
    if (Array.isArray(handler)) return handler.map(wrap);
    if (typeof handler !== 'function') throw new Error('CORE_MODULE_HTTP_HANDLER_INVALID');
    const invoke = (args, req, res, next) => {
      let done;
      try {
        done = scope.beginWork({ continuation: requests.has(req) });
        if (!requests.has(req)) {
          requests.add(req);
          const responseDone = scope.beginWork();
          const finish = () => {
            res.removeListener('finish', finish);
            res.removeListener('close', finish);
            responseDone();
          };
          res.once('finish', finish);
          res.once('close', finish);
        }
        const result = done.run(() => handler(...args));
        // A response can finish before an asynchronous handler's side effects.
        if (result && typeof result.then === 'function') return Promise.resolve(result).then(
          value => { done(); return value; }, error => { done(); next(error); });
        done();
        return result;
      } catch (error) {
        if (done) done();
        if (error.code === 'CORE_MODULE_UPDATING' && !res.headersSent) {
          res.setHeader('Retry-After', '1');
          return res.status(503).json({ error: error.code });
        }
        return next(error);
      }
    };
    // Express uses arity to distinguish error middleware.
    return handler.length === 4
      ? function (error, req, res, next) { return invoke([error, req, res, next], req, res, next); }
      : function (req, res, next) { return invoke([req, res, next], req, res, next); };
  }

  const app = {};
  app.use = (route, ...handlers) => {
    if (typeof route === 'function' || Array.isArray(route)) {
      handlers.unshift(route);
      route = '/';
    }
    if (typeof route !== 'string') throw new Error('CORE_MODULE_HTTP_ROUTE_INVALID');
    routes.push(`use ${route}`);
    router.use(route, ...handlers.map(wrap));
    return app;
  };
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']) {
    app[method] = (route, ...handlers) => {
      if (typeof route !== 'string') throw new Error('CORE_MODULE_HTTP_ROUTE_INVALID');
      routes.push(`${method} ${route}`);
      router[method](route, ...handlers.map(wrap));
      return app;
    };
  }
  return { app, dispatch: router, signature: () => JSON.stringify(routes) };
}

module.exports = { createCoreModuleHttpScope };
