'use strict';

const express = require('express');
const {
  explainExternalEventRejection,
  isHttpPublicEvent,
  isHttpPublicTokenEvent,
  stripHttpPayloadAuthMeta,
  translateLegacyHttpFacadeEvent
} = require('../../utils/meltdownHttpPolicy');

function createMeltdownRouter({
  motherEmitter,
  validateAdminToken,
  isHttpAdminPrincipal,
  isProduction
}) {
  const router = express.Router();

  router.post('/api/meltdown', async (req, res) => {
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

    const headerJwt = req.get('X-Public-Token') || null;
    const cookieJwt = req.cookies?.admin_jwt || null;
    const jwt = headerJwt || cookieJwt;

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

  router.post('/api/meltdown/batch', async (req, res) => {
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
          motherEmitter.emit(targetEventName, targetPayload, (err, result) => (
            err ? reject(err) : resolve(result)
          ));
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

  return router;
}

module.exports = {
  createMeltdownRouter
};
