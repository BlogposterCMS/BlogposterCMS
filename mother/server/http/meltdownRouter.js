'use strict';

const express = require('express');
const {
  explainExternalEventRejection,
  isHttpPublicEvent,
  isHttpPublicTokenEvent,
  stripHttpPayloadAuthMeta
} = require('../../utils/meltdownHttpPolicy');
const { getHttpEventContract } = require('../../contracts/backendEventContracts');
const {
  EVENT_CONTRACT_ERROR_CODES,
  EventContractError,
  requestEvent,
  serializeEventContractError
} = require('../../contracts/eventContract');

function missingContractError(eventName) {
  return new EventContractError(
    EVENT_CONTRACT_ERROR_CODES.NOT_REGISTERED,
    `${EVENT_CONTRACT_ERROR_CODES.NOT_REGISTERED}: No HTTP event contract is registered for "${eventName}".`,
    { eventName, status: 404 }
  );
}

function httpBoundaryError(code, message, status, eventName = null, details = null) {
  return new EventContractError(code, message, { eventName, status, details });
}

function respondWithEventError(res, error, contract) {
  const status = Number(error?.status) || 500;
  return res.status(status).json(serializeEventContractError(error, contract));
}

function createMeltdownRouter({
  motherEmitter,
  validateAdminToken,
  isHttpAdminPrincipal,
  isProduction
}) {
  const router = express.Router();

  router.post('/api/meltdown', async (req, res) => {
    const { eventName, payload = {} } = req.body || {};
    const targetEventName = eventName;
    const targetPayload = stripHttpPayloadAuthMeta(payload);
    const responseEventName = eventName;
    if (!targetEventName) {
      return respondWithEventError(res, httpBoundaryError(
        EVENT_CONTRACT_ERROR_CODES.HTTP_EVENT_NAME_REQUIRED,
        'Missing eventName',
        400
      ), { eventName: '' });
    }
    const eventRejected = explainExternalEventRejection(targetEventName, targetPayload);
    if (eventRejected) {
      return respondWithEventError(res, httpBoundaryError(
        EVENT_CONTRACT_ERROR_CODES.HTTP_EVENT_REJECTED,
        eventRejected,
        403,
        responseEventName
      ), { eventName: responseEventName });
    }
    const contract = getHttpEventContract(targetEventName);
    if (!contract) {
      return respondWithEventError(res, missingContractError(responseEventName), {
        eventName: responseEventName
      });
    }

    const isPublicEvent = isHttpPublicEvent(targetEventName);
    targetPayload.isExternalRequest = true;

    const headerJwt = req.get('X-Public-Token') || null;
    const cookieJwt = req.cookies?.admin_jwt || null;
    const jwt = headerJwt || cookieJwt;

    if (!jwt && !isPublicEvent) {
      return respondWithEventError(res, httpBoundaryError(
        EVENT_CONTRACT_ERROR_CODES.HTTP_AUTH_REQUIRED,
        'Authentication required: missing JWT.',
        401,
        responseEventName
      ), contract);
    }

    if (!isPublicEvent && jwt) {
      try {
        const decoded = await validateAdminToken(jwt);
        if (!isHttpPublicTokenEvent(targetEventName) && !isHttpAdminPrincipal(decoded)) {
          return respondWithEventError(res, httpBoundaryError(
            EVENT_CONTRACT_ERROR_CODES.HTTP_ADMIN_REQUIRED,
            'Admin authentication required.',
            403,
            responseEventName
          ), contract);
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
        return respondWithEventError(res, httpBoundaryError(
          EVENT_CONTRACT_ERROR_CODES.HTTP_TOKEN_INVALID,
          'Invalid token',
          401,
          responseEventName
        ), contract);
      }
    } else if (jwt) {
      targetPayload.jwt = jwt;
    }

    try {
      const data = await requestEvent(motherEmitter, contract, targetPayload);
      return res.json({
        eventName: responseEventName,
        data
      });
    } catch (err) {
        const safeEvent = String(responseEventName).replace(/[\n\r]/g, '');
        console.error('[MELTDOWN] Event "%s" failed => %s', safeEvent, err.message);
        return respondWithEventError(res, err, contract);
    }
  });

  router.post('/api/meltdown/batch', async (req, res) => {
    const { events } = req.body || {};
    if (!Array.isArray(events)) {
      return respondWithEventError(res, httpBoundaryError(
        EVENT_CONTRACT_ERROR_CODES.HTTP_BATCH_INVALID,
        'Invalid events array',
        400
      ), { eventName: 'batch' });
    }

    const headerJwt = req.get('X-Public-Token') || null;
    const cookieJwt = req.cookies?.admin_jwt || null;
    const globalJwt = headerJwt || cookieJwt;
    const results = [];

    for (const ev of events) {
      const { eventName, payload = {} } = ev || {};
      if (!eventName) {
        results.push({
          ...serializeEventContractError(httpBoundaryError(
            EVENT_CONTRACT_ERROR_CODES.HTTP_EVENT_NAME_REQUIRED,
            'Missing eventName',
            400
          ), { eventName: '' })
        });
        continue;
      }

      const targetEventName = eventName;
      const targetPayload = stripHttpPayloadAuthMeta(payload);
      const responseEventName = eventName;
      const eventRejected = explainExternalEventRejection(targetEventName, targetPayload);
      if (eventRejected) {
        results.push({
          eventName: responseEventName,
          ...serializeEventContractError(httpBoundaryError(
            EVENT_CONTRACT_ERROR_CODES.HTTP_EVENT_REJECTED,
            eventRejected,
            403,
            responseEventName
          ), { eventName: responseEventName })
        });
        continue;
      }
      const contract = getHttpEventContract(targetEventName);
      if (!contract) {
        results.push({
          eventName: responseEventName,
          ...serializeEventContractError(missingContractError(responseEventName), {
            eventName: responseEventName
          })
        });
        continue;
      }

      const isPublicEvent = isHttpPublicEvent(targetEventName);
      const isPublicTokenEvent = isHttpPublicTokenEvent(targetEventName);
      targetPayload.isExternalRequest = true;
      const jwt = globalJwt;

      if (!jwt && !isPublicEvent) {
        results.push({
          eventName: responseEventName,
          ...serializeEventContractError(httpBoundaryError(
            EVENT_CONTRACT_ERROR_CODES.HTTP_AUTH_REQUIRED,
            'Authentication required: missing JWT.',
            401,
            responseEventName
          ), contract)
        });
        continue;
      }

      if (!isPublicEvent && jwt) {
        try {
          const decoded = await validateAdminToken(jwt);
          if (!isPublicTokenEvent && !isHttpAdminPrincipal(decoded)) {
            results.push({
              eventName: responseEventName,
              ...serializeEventContractError(httpBoundaryError(
                EVENT_CONTRACT_ERROR_CODES.HTTP_ADMIN_REQUIRED,
                'Admin authentication required.',
                403,
                responseEventName
              ), contract)
            });
            continue;
          }
          targetPayload.decodedJWT = decoded;
          targetPayload.jwt = jwt;
        } catch (err) {
          console.warn('[POST /api/meltdown/batch] Invalid admin token =>', err.message);
          results.push({
            eventName: responseEventName,
            ...serializeEventContractError(httpBoundaryError(
              EVENT_CONTRACT_ERROR_CODES.HTTP_TOKEN_INVALID,
              'Invalid token',
              401,
              responseEventName
            ), contract)
          });
          continue;
        }
      } else if (jwt) {
        targetPayload.jwt = jwt;
      }

      try {
        const data = await requestEvent(motherEmitter, contract, targetPayload);
        results.push({
          eventName: responseEventName,
          data
        });
      } catch (err) {
        const safeEvent = String(responseEventName).replace(/[\n\r]/g, '');
        console.error('[MELTDOWN BATCH] Event "%s" failed => %s', safeEvent, err.message);
        results.push({
          eventName: responseEventName,
          ...serializeEventContractError(err, contract)
        });
      }
    }

    return res.json({ results });
  });

  return router;
}

module.exports = {
  createMeltdownRouter
};
