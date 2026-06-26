'use strict';

const express = require('express');

const MODULE_NAME = 'agentAccess';
const MODULE_TYPE = 'core';
const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function extractJwt(req) {
  const bearer = String(req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return bearer?.[1] || req.cookies?.admin_jwt || null;
}

function errorCode(err) {
  const message = String(err?.message || '');
  const match = message.match(/^([A-Z0-9_]+):\s*(.+)$/);
  return {
    code: match?.[1] || 'AGENT_ACCESS_ERROR',
    message: match?.[2] || message || 'Agent access request failed.'
  };
}

function eventStatus(err) {
  const { code, message } = errorCode(err);
  if (/FORBIDDEN|missing permission/i.test(message)) return 403;
  if (/NOT_FOUND/.test(code) || /not found/i.test(message)) return 404;
  if (/INVALID_CODE|EXPIRED|USED|REVOKED/.test(code)) return 401;
  if (/DISABLED/.test(code)) return 403;
  if (/INVALID|MISSING|required/i.test(message)) return 400;
  return 500;
}

function respondError(res, err) {
  const { code, message } = errorCode(err);
  res.status(eventStatus(err)).json({ error: message, code });
}

function emitAgentAccessEvent(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function basePayload(req, extra = {}) {
  return {
    jwt: req.agentAccessJwt,
    decodedJWT: req.agentAccessDecodedJWT,
    moduleName: MODULE_NAME,
    moduleType: MODULE_TYPE,
    ...extra
  };
}

function isLocalRequest(req) {
  const candidates = [
    req.ip,
    req.socket?.remoteAddress,
    req.connection?.remoteAddress
  ].filter(Boolean).map(value => String(value));
  return candidates.some(value => LOCAL_ADDRESSES.has(value));
}

function createAgentAccessAdminRouter({ motherEmitter, validateAdminToken } = {}) {
  if (!motherEmitter || typeof motherEmitter.emit !== 'function') {
    throw new Error('[agentAccess/httpApi] motherEmitter is required.');
  }
  if (typeof validateAdminToken !== 'function') {
    throw new Error('[agentAccess/httpApi] validateAdminToken is required.');
  }

  const router = express.Router();

  router.use(async (req, res, next) => {
    const jwt = extractJwt(req);
    if (!jwt) return res.status(401).json({ error: 'Authentication required', code: 'AGENT_ACCESS_AUTH_REQUIRED' });
    try {
      req.agentAccessJwt = jwt;
      req.agentAccessDecodedJWT = await validateAdminToken(jwt);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token', code: 'AGENT_ACCESS_INVALID_TOKEN' });
    }
  });

  router.get('/codes', async (req, res) => {
    try {
      const data = await emitAgentAccessEvent(motherEmitter, 'agentAccess.listCodes', basePayload(req));
      res.json({ data });
    } catch (err) {
      respondError(res, err);
    }
  });

  router.post('/codes', async (req, res) => {
    try {
      const data = await emitAgentAccessEvent(motherEmitter, 'agentAccess.createCode', basePayload(req, {
        label: req.body?.label,
        scope: req.body?.scope,
        ttlSeconds: req.body?.ttlSeconds,
        tokenTtlSeconds: req.body?.tokenTtlSeconds
      }));
      res.json({ data });
    } catch (err) {
      respondError(res, err);
    }
  });

  router.delete('/codes/:codeId', async (req, res) => {
    try {
      const data = await emitAgentAccessEvent(motherEmitter, 'agentAccess.revokeCode', basePayload(req, {
        codeId: req.params.codeId
      }));
      res.json({ data });
    } catch (err) {
      respondError(res, err);
    }
  });

  return router;
}

function createAgentAccessPublicRouter({ motherEmitter } = {}) {
  if (!motherEmitter || typeof motherEmitter.emit !== 'function') {
    throw new Error('[agentAccess/httpApi] motherEmitter is required.');
  }

  const router = express.Router();

  router.post('/exchange', async (req, res) => {
    try {
      const data = await emitAgentAccessEvent(motherEmitter, 'agentAccess.exchangeCode', {
        moduleName: MODULE_NAME,
        moduleType: MODULE_TYPE,
        code: req.body?.code
      });
      res.json({ data });
    } catch (err) {
      respondError(res, err);
    }
  });

  router.post('/dev-session', async (req, res) => {
    try {
      const data = await emitAgentAccessEvent(motherEmitter, 'agentAccess.createDevSession', {
        moduleName: MODULE_NAME,
        moduleType: MODULE_TYPE,
        localRequest: isLocalRequest(req),
        username: req.body?.username,
        scope: req.body?.scope,
        tokenTtlSeconds: req.body?.tokenTtlSeconds
      });
      res.json({ data });
    } catch (err) {
      respondError(res, err);
    }
  });

  return router;
}

module.exports = {
  createAgentAccessAdminRouter,
  createAgentAccessPublicRouter,
  _internals: {
    isLocalRequest,
    errorCode
  }
};
