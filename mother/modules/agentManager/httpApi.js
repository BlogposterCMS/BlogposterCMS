'use strict';

const express = require('express');

const MODULE_NAME = 'agentManager';
const MODULE_TYPE = 'core';
const VALID_TOKEN = /^[A-Za-z0-9_.:-]+$/;

function pickFirst(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeRouteToken(value = '', label = 'value') {
  const token = String(pickFirst(value) || '').trim();
  if (!token || token.length > 160 || !VALID_TOKEN.test(token)) {
    throw new Error(`Invalid ${label}.`);
  }
  return token;
}

function maybeBoolean(value) {
  const raw = pickFirst(value);
  if (typeof raw === 'undefined') return undefined;
  if (typeof raw === 'boolean') return raw;
  const text = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return undefined;
}

function maybeNumber(value) {
  const raw = pickFirst(value);
  if (typeof raw === 'undefined' || raw === '') return undefined;
  const number = Number(raw);
  return Number.isFinite(number) ? number : undefined;
}

function includeDefined(source = {}) {
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'undefined') result[key] = value;
  }
  return result;
}

function baseAgentPayload(req, extra = {}) {
  return {
    jwt: req.agentJwt,
    decodedJWT: req.agentDecodedJWT,
    moduleName: MODULE_NAME,
    moduleType: MODULE_TYPE,
    ...extra
  };
}

function eventStatus(err) {
  const message = String(err?.message || '');
  if (/forbidden|missing permission/i.test(message)) return 403;
  if (/not found|unknown command|snapshot not found/i.test(message)) return 404;
  if (/invalid|required|unsupported|missing/i.test(message)) return 400;
  return 500;
}

function emitAgentEvent(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function parsePreviewDataUrl(value = '') {
  const match = String(value || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return null;
  return {
    mime: match[1],
    buffer
  };
}

async function handleAgentEvent(req, res, eventName, payload) {
  try {
    const data = await emitAgentEvent(req.agentMotherEmitter, eventName, payload);
    res.json({ data });
  } catch (err) {
    res.status(eventStatus(err)).json({ error: err.message });
  }
}

async function handlePreviewImage(req, res, payload) {
  try {
    const preview = await emitAgentEvent(req.agentMotherEmitter, 'agent.getSurfacePreview', {
      ...payload,
      includeData: true
    });
    if (!preview) {
      res.status(404).json({ error: 'Surface preview not found' });
      return;
    }
    if (preview.visual?.previewTooLarge) {
      res.status(413).json({ error: 'Surface preview image is too large' });
      return;
    }
    const parsed = parsePreviewDataUrl(preview.visual?.previewDataUrl || '');
    if (!parsed) {
      res.status(404).json({ error: 'Surface preview image not available' });
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.set('X-Agent-Surface-App', String(preview.surface?.appName || ''));
    res.set('X-Agent-Surface-Id', String(preview.surface?.surfaceId || ''));
    res.set('X-Agent-Surface-Revision', String(preview.revision || preview.surface?.revision || ''));
    res.type(parsed.mime).send(parsed.buffer);
  } catch (err) {
    res.status(eventStatus(err)).json({ error: err.message });
  }
}

function surfacePreviewImageUrl(req, appName, surfaceId) {
  const base = String(req.baseUrl || '').replace(/\/+$/g, '');
  return `${base}/surfaces/${encodeURIComponent(appName)}/${encodeURIComponent(surfaceId)}/preview/image`;
}

function addPreviewImageUrl(data, req, appName, surfaceId) {
  if (!data || typeof data !== 'object') return data;
  const previewImageUrl = surfacePreviewImageUrl(req, appName, surfaceId);
  const enriched = {
    ...data,
    previewImageUrl
  };
  if (Array.isArray(data.steps)) {
    enriched.steps = data.steps.map(step => (
      step?.observation && typeof step.observation === 'object'
        ? {
          ...step,
          observation: {
            ...step.observation,
            previewImageUrl: step.observation.previewImageUrl || previewImageUrl
          }
        }
        : step
    ));
  }
  return enriched;
}

async function handleInspectSurface(req, res, payload, appName, surfaceId) {
  try {
    const data = await emitAgentEvent(req.agentMotherEmitter, 'agent.inspectSurface', payload);
    res.json({
      data: data
        ? addPreviewImageUrl(data, req, appName, surfaceId)
        : null
    });
  } catch (err) {
    res.status(eventStatus(err)).json({ error: err.message });
  }
}

async function handleObservedSurfaceEvent(req, res, eventName, payload, appName, surfaceId) {
  try {
    const data = await emitAgentEvent(req.agentMotherEmitter, eventName, payload);
    res.json({
      data: data
        ? addPreviewImageUrl(data, req, appName, surfaceId)
        : null
    });
  } catch (err) {
    res.status(eventStatus(err)).json({ error: err.message });
  }
}

function systemContextOptions(query = {}) {
  return includeDefined({
    filterAppName: pickFirst(query.filterAppName || query.appName),
    surfaceType: pickFirst(query.surfaceType),
    surfaceIdFilter: pickFirst(query.surfaceId || query.surfaceIdFilter),
    activeOnly: maybeBoolean(query.activeOnly),
    staleOnly: maybeBoolean(query.staleOnly),
    includeActions: maybeBoolean(query.includeActions),
    includeControls: maybeBoolean(query.includeControls),
    includePreview: maybeBoolean(query.includePreview),
    limit: maybeNumber(query.limit)
  });
}

function surfaceContextOptions(query = {}) {
  return includeDefined({
    includeTree: maybeBoolean(query.includeTree),
    includePreview: maybeBoolean(query.includePreview),
    includeCommands: maybeBoolean(query.includeCommands),
    includeControls: maybeBoolean(query.includeControls),
    includeActions: maybeBoolean(query.includeActions),
    commandLimit: maybeNumber(query.commandLimit)
  });
}

function surfacePreviewOptions(query = {}) {
  return includeDefined({
    includeData: maybeBoolean(query.includeData),
    includePreview: maybeBoolean(query.includePreview)
  });
}

function surfaceInspectOptions(query = {}) {
  return includeDefined({
    includeTree: maybeBoolean(query.includeTree),
    includePreview: maybeBoolean(query.includePreview),
    includeData: maybeBoolean(query.includeData),
    includeCommands: maybeBoolean(query.includeCommands),
    includeControls: maybeBoolean(query.includeControls),
    includeActions: maybeBoolean(query.includeActions),
    includeActivity: maybeBoolean(query.includeActivity),
    commandLimit: maybeNumber(query.commandLimit),
    activityLimit: maybeNumber(query.activityLimit),
    category: pickFirst(query.category)
  });
}

function activityOptions(query = {}) {
  return includeDefined({
    appName: pickFirst(query.appName),
    surfaceId: pickFirst(query.surfaceId || query.surfaceIdFilter),
    type: pickFirst(query.type),
    commandId: pickFirst(query.commandId),
    since: pickFirst(query.since || query.sinceAt),
    limit: maybeNumber(query.limit)
  });
}

function commandPayload(body = {}) {
  const source = body.command && typeof body.command === 'object' && !Array.isArray(body.command)
    ? body.command
    : body;
  return includeDefined({
    action: source.action || source.type,
    type: source.type,
    target: source.target,
    params: source.params,
    value: source.value,
    reason: source.reason
  });
}

function shouldInvokeCommand(body = {}) {
  return body.invoke === true || body.wait === true || body.waitForResult === true;
}

function commandOptions(body = {}) {
  return includeDefined({
    wait: body.wait,
    waitForResult: body.waitForResult,
    timeoutMs: maybeNumber(body.timeoutMs),
    intervalMs: maybeNumber(body.intervalMs),
    observeDelayMs: maybeNumber(body.observeDelayMs),
    waitForFreshSnapshot: maybeBoolean(body.waitForFreshSnapshot || body.waitForSnapshot),
    snapshotTimeoutMs: maybeNumber(body.snapshotTimeoutMs),
    snapshotIntervalMs: maybeNumber(body.snapshotIntervalMs),
    includeContext: maybeBoolean(body.includeContext),
    includeActivity: maybeBoolean(body.includeActivity),
    includeTree: maybeBoolean(body.includeTree),
    includePreview: maybeBoolean(body.includePreview),
    includeCommands: maybeBoolean(body.includeCommands),
    includeControls: maybeBoolean(body.includeControls),
    includeActions: maybeBoolean(body.includeActions),
    commandLimit: maybeNumber(body.commandLimit),
    activityLimit: maybeNumber(body.activityLimit)
  });
}

function workflowPayload(body = {}) {
  return includeDefined({
    steps: Array.isArray(body.steps)
      ? body.steps
      : (Array.isArray(body.commands) ? body.commands : undefined),
    haltOnFailure: maybeBoolean(body.haltOnFailure),
    ...commandOptions(body)
  });
}

function refreshPayload(body = {}) {
  return includeDefined({
    reason: pickFirst(body.reason),
    ...commandOptions(body)
  });
}

function extractJwt(req) {
  const bearer = String(req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return bearer?.[1] || req.cookies?.admin_jwt || null;
}

function createAgentApiRouter({ motherEmitter, validateAdminToken } = {}) {
  if (!motherEmitter || typeof motherEmitter.emit !== 'function') {
    throw new Error('[agentManager/httpApi] motherEmitter is required.');
  }
  if (typeof validateAdminToken !== 'function') {
    throw new Error('[agentManager/httpApi] validateAdminToken is required.');
  }

  const router = express.Router();

  router.use(async (req, res, next) => {
    const jwt = extractJwt(req);
    if (!jwt) return res.status(401).json({ error: 'Authentication required' });
    try {
      req.agentJwt = jwt;
      req.agentDecodedJWT = await validateAdminToken(jwt);
      req.agentMotherEmitter = motherEmitter;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  router.get('/capabilities', (req, res) => {
    handleAgentEvent(req, res, 'agent.getCapabilities', baseAgentPayload(req));
  });

  router.get('/definition', (req, res) => {
    handleAgentEvent(req, res, 'agent.getApiDefinition', baseAgentPayload(req));
  });

  router.get('/context', (req, res) => {
    handleAgentEvent(req, res, 'agent.getSystemContext', baseAgentPayload(req, systemContextOptions(req.query)));
  });

  router.get('/surfaces', (req, res) => {
    handleAgentEvent(req, res, 'agent.listSurfaceSnapshots', baseAgentPayload(req, includeDefined({
      appName: pickFirst(req.query.appName),
      surfaceType: pickFirst(req.query.surfaceType),
      includeTree: maybeBoolean(req.query.includeTree),
      limit: maybeNumber(req.query.limit)
    })));
  });

  router.get('/activity', (req, res) => {
    handleAgentEvent(req, res, 'agent.listActivity', baseAgentPayload(req, activityOptions(req.query)));
  });

  router.get('/surfaces/:appName/:surfaceId', (req, res) => {
    try {
      handleAgentEvent(req, res, 'agent.getSurfaceSnapshot', baseAgentPayload(req, {
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId')
      }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/surfaces/:appName/:surfaceId/context', (req, res) => {
    try {
      handleAgentEvent(req, res, 'agent.getSurfaceContext', baseAgentPayload(req, {
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId'),
        ...surfaceContextOptions(req.query)
      }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/surfaces/:appName/:surfaceId/inspect', (req, res) => {
    try {
      const appName = normalizeRouteToken(req.params.appName, 'appName');
      const surfaceId = normalizeRouteToken(req.params.surfaceId, 'surfaceId');
      handleInspectSurface(req, res, baseAgentPayload(req, {
        appName,
        surfaceId,
        ...surfaceInspectOptions(req.query)
      }), appName, surfaceId);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/surfaces/:appName/:surfaceId/preview', (req, res) => {
    try {
      handleAgentEvent(req, res, 'agent.getSurfacePreview', baseAgentPayload(req, {
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId'),
        ...surfacePreviewOptions(req.query)
      }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/surfaces/:appName/:surfaceId/preview/image', (req, res) => {
    try {
      handlePreviewImage(req, res, baseAgentPayload(req, {
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId')
      }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/surfaces/:appName/:surfaceId/actions', (req, res) => {
    try {
      handleAgentEvent(req, res, 'agent.listSurfaceActions', baseAgentPayload(req, includeDefined({
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId'),
        category: pickFirst(req.query.category)
      })));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/surfaces/:appName/:surfaceId/actions/:action', (req, res) => {
    try {
      handleAgentEvent(req, res, 'agent.getSurfaceAction', baseAgentPayload(req, {
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId'),
        action: normalizeRouteToken(req.params.action, 'action')
      }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/surfaces/:appName/:surfaceId/commands', (req, res) => {
    try {
      handleAgentEvent(req, res, 'agent.listSurfaceCommands', baseAgentPayload(req, includeDefined({
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId'),
        limit: maybeNumber(req.query.limit)
      })));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/surfaces/:appName/:surfaceId/commands/validate', (req, res) => {
    try {
      const body = req.body || {};
      handleAgentEvent(req, res, 'agent.validateSurfaceCommand', baseAgentPayload(req, {
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId'),
        command: commandPayload(body)
      }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/surfaces/:appName/:surfaceId/workflows/validate', (req, res) => {
    try {
      const body = req.body || {};
      handleAgentEvent(req, res, 'agent.validateSurfaceWorkflow', baseAgentPayload(req, {
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId'),
        ...workflowPayload(body)
      }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/surfaces/:appName/:surfaceId/workflows', (req, res) => {
    try {
      const body = req.body || {};
      const appName = normalizeRouteToken(req.params.appName, 'appName');
      const surfaceId = normalizeRouteToken(req.params.surfaceId, 'surfaceId');
      handleObservedSurfaceEvent(req, res, 'agent.invokeSurfaceWorkflow', baseAgentPayload(req, {
        appName,
        surfaceId,
        ...workflowPayload(body)
      }), appName, surfaceId);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/surfaces/:appName/:surfaceId/commands/observe', (req, res) => {
    try {
      const body = req.body || {};
      const appName = normalizeRouteToken(req.params.appName, 'appName');
      const surfaceId = normalizeRouteToken(req.params.surfaceId, 'surfaceId');
      handleObservedSurfaceEvent(req, res, 'agent.invokeSurfaceCommandAndObserve', baseAgentPayload(req, {
        appName,
        surfaceId,
        command: commandPayload(body),
        ...commandOptions(body)
      }), appName, surfaceId);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/surfaces/:appName/:surfaceId/refresh', (req, res) => {
    try {
      const body = req.body || {};
      const appName = normalizeRouteToken(req.params.appName, 'appName');
      const surfaceId = normalizeRouteToken(req.params.surfaceId, 'surfaceId');
      handleObservedSurfaceEvent(req, res, 'agent.refreshSurface', baseAgentPayload(req, {
        appName,
        surfaceId,
        ...refreshPayload(body)
      }), appName, surfaceId);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/surfaces/:appName/:surfaceId/commands/:commandId', (req, res) => {
    try {
      handleAgentEvent(req, res, 'agent.getSurfaceCommand', baseAgentPayload(req, {
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId'),
        commandId: normalizeRouteToken(req.params.commandId, 'commandId')
      }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/surfaces/:appName/:surfaceId/commands', (req, res) => {
    try {
      const body = req.body || {};
      const eventName = shouldInvokeCommand(body)
        ? 'agent.invokeSurfaceCommand'
        : 'agent.enqueueSurfaceCommand';
      handleAgentEvent(req, res, eventName, baseAgentPayload(req, {
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId'),
        command: commandPayload(body),
        ...commandOptions(body)
      }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/surfaces/:appName/:surfaceId/commands/:commandId/wait', (req, res) => {
    try {
      handleAgentEvent(req, res, 'agent.waitForSurfaceCommand', baseAgentPayload(req, {
        appName: normalizeRouteToken(req.params.appName, 'appName'),
        surfaceId: normalizeRouteToken(req.params.surfaceId, 'surfaceId'),
        commandId: normalizeRouteToken(req.params.commandId, 'commandId'),
        ...commandOptions(req.body || {})
      }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

module.exports = {
  createAgentApiRouter,
  _internals: {
    commandPayload,
    eventStatus,
    activityOptions,
    parsePreviewDataUrl,
    normalizeRouteToken,
    addPreviewImageUrl,
    surfaceInspectOptions,
    surfacePreviewImageUrl,
    systemContextOptions,
    surfaceContextOptions,
    surfacePreviewOptions,
    refreshPayload,
    workflowPayload
  }
};
