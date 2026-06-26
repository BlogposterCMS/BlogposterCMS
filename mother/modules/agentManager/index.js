'use strict';

const crypto = require('crypto');
const { hasPermission } = require('../userManagement/permissionUtils');
const API_DEFINITION = require('./apiDefinition.json');

const MODULE_NAME = 'agentManager';
const MODULE_TYPE = 'core';
const VERSION = '0.1.0';
const MAX_SURFACES = 100;
const MAX_COMMANDS_PER_SURFACE = 100;
const MAX_LIST_LIMIT = 50;
const MAX_ACTIVITY_EVENTS = 300;
const MAX_WORKFLOW_STEPS = 12;
const MAX_STRING_LENGTH = 4000;
const MAX_VISUAL_DATA_URL_LENGTH = 750000;
const MAX_ARRAY_LENGTH = 80;
const MAX_OBJECT_KEYS = 80;
const MAX_JSON_DEPTH = 6;
const DEFAULT_COMMAND_WAIT_MS = 10000;
const MAX_COMMAND_WAIT_MS = 60000;
const DEFAULT_COMMAND_WAIT_INTERVAL_MS = 200;
const MIN_COMMAND_WAIT_INTERVAL_MS = 25;
const MAX_COMMAND_WAIT_INTERVAL_MS = 1000;
const STALE_SURFACE_AFTER_MS = 30000;
const INACTIVE_SURFACE_AFTER_MS = 120000;
const DEFAULT_OBSERVE_DELAY_MS = 40;
const MAX_OBSERVE_DELAY_MS = 2000;
const DEFAULT_FRESH_SNAPSHOT_WAIT_MS = 2500;
const MAX_FRESH_SNAPSHOT_WAIT_MS = 15000;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const READ_PERMISSIONS = Object.freeze(API_DEFINITION.permissions.read);
const SURFACE_WRITE_PERMISSIONS = Object.freeze(API_DEFINITION.permissions.surfaceWrite);
const CONTROL_PERMISSIONS = Object.freeze(API_DEFINITION.permissions.control);

const COMMAND_FINAL_STATES = new Set(['acked', 'failed', 'cancelled']);
const surfaceSnapshots = new Map();
const surfaceCommands = new Map();
const activityEvents = [];

function once(originalCb) {
  let fired = false;
  return (...args) => {
    if (fired) return;
    fired = true;
    if (typeof originalCb === 'function') originalCb(...args);
  };
}

function assertAgentPayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[agentManager] ${eventName} => invalid meltdown payload.`);
  }
}

function requireAnyPermission(payload, permissions) {
  if (!payload?.decodedJWT) return;
  if (permissions.some(permission => hasPermission(payload.decodedJWT, permission))) return;
  throw new Error(`Forbidden - missing permission: ${permissions[0]}`);
}

function nowIso() {
  return new Date().toISOString();
}

function scalarString(value, fallback = '') {
  if (value == null) return String(fallback || '');
  const valueType = typeof value;
  if (valueType === 'object' || valueType === 'function' || valueType === 'symbol') {
    return String(fallback || '');
  }
  return String(value).replace(CONTROL_CHAR_PATTERN, ' ');
}

function normalizeToken(value = '', fallback = '') {
  const normalized = scalarString(value, fallback)
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 120);
  return normalized || fallback;
}

function normalizeCommandId(value = '') {
  return normalizeToken(value, '');
}

function appNameFromPayload(payload = {}) {
  return normalizeToken(payload.appName || payload.appContext?.appName || 'system', 'system');
}

function surfaceIdFromPayload(payload = {}) {
  return normalizeToken(payload.surfaceId || payload.surface || payload.id || 'default', 'default');
}

function surfaceKey(appName, surfaceId) {
  return `${appName}:${surfaceId}`;
}

function actorFromPayload(payload = {}) {
  const decoded = payload.decodedJWT || {};
  return normalizeToken(decoded.userId || decoded.id || decoded.username || decoded.sub || payload.appContext?.appName || 'system', 'system');
}

function truncateString(value, maxLength = MAX_STRING_LENGTH) {
  const text = scalarString(value, '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function sanitizeJsonish(value, depth = 0) {
  if (depth > MAX_JSON_DEPTH) return '[depth-limit]';
  if (value == null) return value;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH)
      .map(item => sanitizeJsonish(item, depth + 1))
      .filter(item => typeof item !== 'undefined');
  }
  if (typeof value === 'object') {
    const result = {};
    for (const [key, entryValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      const safeKey = normalizeObjectKey(key);
      if (!safeKey) continue;
      const sanitized = sanitizeJsonish(entryValue, depth + 1);
      if (typeof sanitized !== 'undefined') result[safeKey] = sanitized;
    }
    return result;
  }
  return undefined;
}

function sanitizeVisual(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const visual = sanitizeJsonish(raw, 1) || {};
  const previewDataUrl = String(raw.previewDataUrl || raw.preview || raw.dataUrl || '');
  if (previewDataUrl && /^data:image\/(png|jpeg|webp);base64,/i.test(previewDataUrl)) {
    visual.previewMime = previewDataUrl.slice(5, previewDataUrl.indexOf(';'));
    visual.previewBytes = previewDataUrl.length;
    if (previewDataUrl.length <= MAX_VISUAL_DATA_URL_LENGTH) {
      visual.previewDataUrl = previewDataUrl;
      visual.previewTooLarge = false;
    } else {
      delete visual.previewDataUrl;
      visual.previewTooLarge = true;
    }
  }
  return visual;
}

function normalizeObjectKey(key = '') {
  const rawKey = scalarString(key, '').trim();
  if (!rawKey || UNSAFE_OBJECT_KEYS.has(rawKey)) return '';
  const normalized = rawKey
    .replace(/[^\w.:-]+/g, '_')
    .substring(0, 80);
  if (!normalized || UNSAFE_OBJECT_KEYS.has(normalized)) return '';
  return normalized;
}

function normalizeSurfaceSnapshot(payload = {}) {
  const appName = appNameFromPayload(payload);
  const surfaceId = surfaceIdFromPayload(payload);
  const previous = surfaceSnapshots.get(surfaceKey(appName, surfaceId));
  const timestamp = nowIso();
  return {
    id: surfaceId,
    surfaceId,
    appName,
    surfaceType: normalizeToken(payload.surfaceType || payload.type || previous?.surfaceType || 'workspace', 'workspace'),
    title: truncateString(payload.title || previous?.title || surfaceId, 180),
    route: truncateString(payload.route || payload.path || '', 500),
    url: truncateString(payload.url || '', 800),
    status: normalizeToken(payload.status || 'active', 'active'),
    summary: sanitizeJsonish(payload.summary || {}, 1),
    state: sanitizeJsonish(payload.state || {}, 1),
    selection: sanitizeJsonish(payload.selection || null, 1),
    tree: sanitizeJsonish(payload.tree || [], 1),
    controls: sanitizeJsonish(payload.controls || [], 1),
    actions: sanitizeJsonish(payload.actions || [], 1),
    visual: sanitizeVisual(payload.visual || {}),
    metrics: sanitizeJsonish(payload.metrics || {}, 1),
    meta: sanitizeJsonish(payload.meta || {}, 1),
    createdAt: previous?.createdAt || timestamp,
    updatedAt: timestamp,
    revision: Number(previous?.revision || 0) + 1,
    reportedBy: actorFromPayload(payload),
    appContext: sanitizeJsonish(payload.appContext || null, 1)
  };
}

function surfaceFreshness(snapshot, nowMs = Date.now()) {
  const updatedAt = snapshot?.updatedAt || null;
  const updatedAtMs = Date.parse(String(updatedAt || ''));
  const ageMs = Number.isFinite(updatedAtMs) ? Math.max(0, nowMs - updatedAtMs) : null;
  const status = normalizeToken(snapshot?.status || '', '');
  const statusInactive = ['closed', 'disposed', 'inactive'].includes(status);
  return {
    updatedAt,
    ageMs,
    staleAfterMs: STALE_SURFACE_AFTER_MS,
    inactiveAfterMs: INACTIVE_SURFACE_AFTER_MS,
    stale: ageMs == null ? true : ageMs > STALE_SURFACE_AFTER_MS,
    inactive: statusInactive || (ageMs == null ? true : ageMs > INACTIVE_SURFACE_AFTER_MS)
  };
}

function surfaceSummary(snapshot) {
  return {
    surfaceId: snapshot.surfaceId,
    appName: snapshot.appName,
    surfaceType: snapshot.surfaceType,
    title: snapshot.title,
    route: snapshot.route,
    status: snapshot.status,
    updatedAt: snapshot.updatedAt,
    freshness: surfaceFreshness(snapshot),
    revision: snapshot.revision,
    selection: snapshot.selection || null,
    summary: snapshot.summary || {},
    counts: {
      tree: Array.isArray(snapshot.tree) ? snapshot.tree.length : 0,
      controls: Array.isArray(snapshot.controls) ? snapshot.controls.length : 0,
      actions: Array.isArray(snapshot.actions) ? snapshot.actions.length : 0,
      pendingCommands: pendingCommandsFor(snapshot.appName, snapshot.surfaceId).length
    },
    visual: {
      hasPreview: Boolean(snapshot.visual?.previewDataUrl),
      previewTooLarge: Boolean(snapshot.visual?.previewTooLarge)
    }
  };
}

function visualContext(visual = {}, includePreview = false) {
  const result = {
    available: Boolean(visual.available || visual.previewDataUrl || visual.previewTooLarge),
    hasPreview: Boolean(visual.previewDataUrl),
    previewTooLarge: Boolean(visual.previewTooLarge),
    previewMime: visual.previewMime || null,
    previewBytes: Number(visual.previewBytes || (visual.previewDataUrl ? String(visual.previewDataUrl).length : 0)),
    width: Number(visual.width || 0),
    height: Number(visual.height || 0),
    source: visual.source || null,
    capturedAt: visual.capturedAt || null,
    activeSceneId: visual.activeSceneId || null,
    activeSceneTitle: visual.activeSceneTitle || null
  };
  if (includePreview && visual.previewDataUrl) {
    result.previewDataUrl = visual.previewDataUrl;
  }
  return result;
}

function shouldIncludePreviewData(payload = {}) {
  return payload.includePreview === true || payload.includeData === true;
}

function commandContext(command) {
  if (!command) return null;
  return {
    id: command.id,
    action: command.action,
    type: command.type,
    status: command.status,
    actionLabel: command.actionLabel || command.action,
    actionCategory: command.actionCategory || 'general',
    target: command.target || null,
    params: command.params || {},
    value: command.value ?? null,
    reason: command.reason || '',
    result: command.result || null,
    error: command.error || null,
    requestedAt: command.requestedAt || null,
    updatedAt: command.updatedAt || null,
    deliveredAt: command.deliveredAt || null,
    ackedAt: command.ackedAt || null,
    deliveryCount: Number(command.deliveryCount || 0),
    wait: command.wait || null
  };
}

function activityContext(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    type: entry.type,
    appName: entry.appName || null,
    surfaceId: entry.surfaceId || null,
    surfaceType: entry.surfaceType || null,
    commandId: entry.commandId || null,
    action: entry.action || null,
    status: entry.status || null,
    revision: entry.revision || null,
    actor: entry.actor || null,
    createdAt: entry.createdAt || null,
    details: entry.details || {}
  };
}

function trimActivityStore() {
  if (activityEvents.length <= MAX_ACTIVITY_EVENTS) return;
  activityEvents.splice(0, activityEvents.length - MAX_ACTIVITY_EVENTS);
}

function recordActivity(type, data = {}) {
  const snapshot = data.snapshot || null;
  const command = data.command || null;
  const entry = {
    id: `act_${crypto.randomBytes(6).toString('hex')}`,
    type: normalizeToken(type, 'activity'),
    appName: data.appName || snapshot?.appName || command?.appName || null,
    surfaceId: data.surfaceId || snapshot?.surfaceId || command?.surfaceId || null,
    surfaceType: data.surfaceType || snapshot?.surfaceType || null,
    commandId: data.commandId || command?.id || null,
    action: data.action || command?.action || null,
    status: data.status || command?.status || null,
    revision: data.revision || snapshot?.revision || null,
    actor: data.actor || command?.requestedBy || snapshot?.reportedBy || null,
    createdAt: nowIso(),
    details: sanitizeJsonish(data.details || {}, 1) || {}
  };
  activityEvents.push(entry);
  trimActivityStore();
  return activityContext(entry);
}

function trimSurfaceStore() {
  if (surfaceSnapshots.size <= MAX_SURFACES) return;
  const sorted = Array.from(surfaceSnapshots.entries())
    .sort((left, right) => String(left[1].updatedAt).localeCompare(String(right[1].updatedAt)));
  for (const [key] of sorted.slice(0, surfaceSnapshots.size - MAX_SURFACES)) {
    surfaceSnapshots.delete(key);
    surfaceCommands.delete(key);
  }
}

function commandsFor(appName, surfaceId) {
  const key = surfaceKey(appName, surfaceId);
  if (!surfaceCommands.has(key)) surfaceCommands.set(key, []);
  return surfaceCommands.get(key);
}

function pendingCommandsFor(appName, surfaceId) {
  return commandsFor(appName, surfaceId).filter(command => !COMMAND_FINAL_STATES.has(command.status));
}

function commandIsFinal(command) {
  return Boolean(command && COMMAND_FINAL_STATES.has(command.status));
}

function trimCommandStore(appName, surfaceId) {
  const list = commandsFor(appName, surfaceId);
  if (list.length <= MAX_COMMANDS_PER_SURFACE) return;
  const final = list.filter(command => COMMAND_FINAL_STATES.has(command.status));
  const active = list.filter(command => !COMMAND_FINAL_STATES.has(command.status));
  if (active.length >= MAX_COMMANDS_PER_SURFACE) {
    surfaceCommands.set(surfaceKey(appName, surfaceId), active.slice(-MAX_COMMANDS_PER_SURFACE));
    return;
  }
  surfaceCommands.set(
    surfaceKey(appName, surfaceId),
    [...active, ...final.slice(-(MAX_COMMANDS_PER_SURFACE - active.length))]
  );
}

function normalizeCommand(payload = {}) {
  const appName = appNameFromPayload(payload);
  const surfaceId = surfaceIdFromPayload(payload);
  const rawCommand = payload.command && typeof payload.command === 'object' ? payload.command : payload;
  const action = normalizeToken(rawCommand.action || rawCommand.type || payload.action || payload.type || '', '');
  if (!action) throw new Error('Command action is required.');
  const timestamp = nowIso();
  return {
    id: `cmd_${crypto.randomBytes(8).toString('hex')}`,
    appName,
    surfaceId,
    action,
    type: action,
    target: sanitizeJsonish(rawCommand.target || payload.target || null, 1),
    params: sanitizeJsonish(rawCommand.params || payload.params || {}, 1),
    value: sanitizeJsonish(rawCommand.value ?? payload.value ?? null, 1),
    reason: truncateString(rawCommand.reason || payload.reason || '', 500),
    status: 'queued',
    requestedAt: timestamp,
    updatedAt: timestamp,
    deliveredAt: null,
    ackedAt: null,
    deliveryCount: 0,
    requestedBy: actorFromPayload(payload),
    result: null,
    error: null
  };
}

function snapshotForSurface(appName, surfaceId) {
  return surfaceSnapshots.get(surfaceKey(appName, surfaceId)) || null;
}

function surfaceActions(appName, surfaceId) {
  const snapshot = snapshotForSurface(appName, surfaceId);
  return Array.isArray(snapshot?.actions) ? snapshot.actions : [];
}

function findSurfaceAction(appName, surfaceId, actionName) {
  const name = String(actionName || '').trim();
  if (!name) return null;
  return surfaceActions(appName, surfaceId).find(action => action?.action === name || action?.id === name) || null;
}

function actionNameFromPayload(payload = {}) {
  return normalizeToken(payload.action || payload.actionId || payload.commandAction || payload.name || '', '');
}

function listSurfaceActions(payload = {}) {
  const appName = appNameFromPayload(payload);
  const surfaceId = surfaceIdFromPayload(payload);
  const category = payload.category ? normalizeToken(payload.category, '') : '';
  return surfaceActions(appName, surfaceId)
    .filter(action => !category || normalizeToken(action?.category || 'general', 'general') === category);
}

function surfaceContext(payload = {}) {
  const appName = appNameFromPayload(payload);
  const surfaceId = surfaceIdFromPayload(payload);
  const snapshot = snapshotForSurface(appName, surfaceId);
  if (!snapshot) return null;

  const rawCommandLimit = payload.commandLimit == null ? 10 : Number(payload.commandLimit);
  const commandLimit = Math.min(Math.max(Number.isFinite(rawCommandLimit) ? rawCommandLimit : 10, 0), 25);
  const includeCommands = payload.includeCommands !== false;
  const includeControls = payload.includeControls !== false;
  const includeActions = payload.includeActions !== false;
  const context = {
    surface: surfaceSummary(snapshot),
    state: snapshot.state || {},
    selection: snapshot.selection || null,
    visual: visualContext(snapshot.visual || {}, payload.includePreview === true),
    controls: includeControls ? (snapshot.controls || []) : [],
    actions: includeActions ? (snapshot.actions || []) : [],
    commands: {
      pendingCount: pendingCommandsFor(appName, surfaceId).length,
      recent: includeCommands
        ? commandsFor(appName, surfaceId).slice(-commandLimit).map(commandContext)
        : []
    }
  };
  if (payload.includeTree === true) {
    context.tree = snapshot.tree || [];
  }
  return context;
}

function surfacePreview(payload = {}) {
  const appName = appNameFromPayload(payload);
  const surfaceId = surfaceIdFromPayload(payload);
  const snapshot = snapshotForSurface(appName, surfaceId);
  if (!snapshot) return null;

  return {
    surface: surfaceSummary(snapshot),
    visual: visualContext(snapshot.visual || {}, shouldIncludePreviewData(payload)),
    available: Boolean(snapshot.visual?.available || snapshot.visual?.previewDataUrl || snapshot.visual?.previewTooLarge),
    updatedAt: snapshot.updatedAt || null,
    revision: snapshot.revision || null,
    capturedAt: snapshot.visual?.capturedAt || null
  };
}

function surfaceInspection(payload = {}) {
  const appName = appNameFromPayload(payload);
  const surfaceId = surfaceIdFromPayload(payload);
  const context = surfaceContext({
    ...payload,
    appName,
    surfaceId,
    includeCommands: payload.includeCommands,
    includeControls: payload.includeControls,
    includeActions: payload.includeActions,
    includePreview: payload.includePreview,
    includeTree: payload.includeTree,
    commandLimit: payload.commandLimit
  });
  if (!context) return null;

  const activityLimit = Math.min(Math.max(Number(payload.activityLimit) || 20, 1), 100);
  return {
    inspectedAt: nowIso(),
    surface: context.surface,
    context,
    preview: surfacePreview({
      ...payload,
      appName,
      surfaceId,
      includeData: payload.includeData === true,
      includePreview: payload.includePreview === true
    }),
    actions: listSurfaceActions({ ...payload, appName, surfaceId }),
    activity: payload.includeActivity === false
      ? []
      : listActivity({ appName, surfaceId, limit: activityLimit })
  };
}

function systemSurfaceContext(snapshot, options = {}) {
  const appName = snapshot.appName;
  const surfaceId = snapshot.surfaceId;
  const commands = commandsFor(appName, surfaceId);
  const lastCommand = commands.length ? commandContext(commands[commands.length - 1]) : null;
  return {
    surface: surfaceSummary(snapshot),
    selection: snapshot.selection || null,
    visual: visualContext(snapshot.visual || {}, options.includePreview === true),
    actions: options.includeActions === false ? [] : (snapshot.actions || []),
    controls: options.includeControls === true ? (snapshot.controls || []) : [],
    commands: {
      pendingCount: pendingCommandsFor(appName, surfaceId).length,
      last: lastCommand
    }
  };
}

function systemContext(payload = {}) {
  const filterAppName = payload.filterAppName || payload.appFilter || payload.targetAppName || '';
  const appName = filterAppName ? normalizeToken(filterAppName, '') : '';
  const surfaceType = payload.surfaceType ? normalizeToken(payload.surfaceType, '') : '';
  const surfaceId = payload.surfaceIdFilter ? normalizeToken(payload.surfaceIdFilter, '') : '';
  const activeOnly = payload.activeOnly === true;
  const staleOnly = payload.staleOnly === true;
  const limit = Math.min(Math.max(Number(payload.limit) || MAX_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const options = {
    includeActions: payload.includeActions !== false,
    includeControls: payload.includeControls === true,
    includePreview: payload.includePreview === true
  };
  const surfaces = Array.from(surfaceSnapshots.values())
    .filter(snapshot => !appName || snapshot.appName === appName)
    .filter(snapshot => !surfaceType || snapshot.surfaceType === surfaceType)
    .filter(snapshot => !surfaceId || snapshot.surfaceId === surfaceId)
    .filter(snapshot => !activeOnly || !surfaceFreshness(snapshot).inactive)
    .filter(snapshot => !staleOnly || surfaceFreshness(snapshot).stale)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, limit)
    .map(snapshot => systemSurfaceContext(snapshot, options));
  const staleSurfaces = surfaces.filter(entry => entry.surface?.freshness?.stale).length;
  const inactiveSurfaces = surfaces.filter(entry => entry.surface?.freshness?.inactive).length;
  return {
    module: {
      moduleName: MODULE_NAME,
      moduleType: MODULE_TYPE,
      version: VERSION
    },
    generatedAt: nowIso(),
    counts: {
      surfaces: surfaces.length,
      pendingCommands: surfaces.reduce((total, entry) => total + Number(entry.commands.pendingCount || 0), 0),
      controllableSurfaces: surfaces.filter(entry => Array.isArray(entry.actions) && entry.actions.length > 0).length,
      staleSurfaces,
      inactiveSurfaces,
      activityEvents: activityEvents.length
    },
    surfaces
  };
}

function actionDefinitionForCommand(command) {
  const snapshot = snapshotForSurface(command.appName, command.surfaceId);
  if (!snapshot) {
    throw new Error(`Surface snapshot not found: ${command.appName}/${command.surfaceId}`);
  }
  const actions = Array.isArray(snapshot.actions) ? snapshot.actions : [];
  if (!actions.length) {
    throw new Error(`Surface does not advertise agent actions: ${command.appName}/${command.surfaceId}`);
  }
  const definition = findSurfaceAction(command.appName, command.surfaceId, command.action);
  if (!definition) {
    throw new Error(`Unsupported surface action: ${command.action}`);
  }
  return definition;
}

function hasCommandParam(command, name) {
  if (!name) return true;
  const params = command.params && typeof command.params === 'object' && !Array.isArray(command.params)
    ? command.params
    : {};
  if (Object.prototype.hasOwnProperty.call(params, name) && params[name] !== '' && params[name] != null) {
    return true;
  }
  if (
    command.target &&
    typeof command.target === 'object' &&
    !Array.isArray(command.target) &&
    Object.prototype.hasOwnProperty.call(command.target, name) &&
    command.target[name] !== '' &&
    command.target[name] != null
  ) {
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(command, name) && command[name] !== '' && command[name] != null) {
    return true;
  }
  return name === 'value' && command.value !== '' && command.value != null;
}

function validateCommandAgainstSurface(command) {
  const definition = actionDefinitionForCommand(command);
  const requiredParams = Array.isArray(definition.params)
    ? definition.params.filter(param => param?.required === true)
    : [];
  for (const param of requiredParams) {
    if (!hasCommandParam(command, param.name)) {
      throw new Error(`Missing required command param "${param.name}" for action "${command.action}"`);
    }
  }
  command.actionLabel = truncateString(definition.label || definition.title || command.action, 180);
  command.actionCategory = normalizeToken(definition.category || 'general', 'general');
  command.actionDefinition = sanitizeJsonish(definition, 1);
  return command;
}

function rawCommandFromPayload(payload = {}) {
  return payload.command && typeof payload.command === 'object' && !Array.isArray(payload.command)
    ? payload.command
    : payload;
}

function requiredParamsForDefinition(definition) {
  return Array.isArray(definition?.params)
    ? definition.params
      .filter(param => param?.required === true)
      .map(param => ({
        name: String(param.name || ''),
        type: param.type || null
      }))
      .filter(param => param.name)
    : [];
}

function validateCommandRequest(payload = {}) {
  const appName = appNameFromPayload(payload);
  const surfaceId = surfaceIdFromPayload(payload);
  const rawCommand = rawCommandFromPayload(payload);
  const rawAction = normalizeToken(rawCommand.action || rawCommand.type || payload.action || payload.type || '', '');
  const base = {
    valid: false,
    appName,
    surfaceId,
    action: rawAction || null,
    label: null,
    category: null,
    requiredParams: [],
    missingParams: [],
    errors: [],
    actionDefinition: null,
    command: null
  };

  try {
    const command = normalizeCommand(payload);
    const definition = actionDefinitionForCommand(command);
    const requiredParams = requiredParamsForDefinition(definition);
    const missingParams = requiredParams
      .filter(param => !hasCommandParam(command, param.name))
      .map(param => param.name);
    command.actionLabel = truncateString(definition.label || definition.title || command.action, 180);
    command.actionCategory = normalizeToken(definition.category || 'general', 'general');
    command.actionDefinition = sanitizeJsonish(definition, 1);
    return {
      ...base,
      valid: missingParams.length === 0,
      action: command.action,
      label: command.actionLabel,
      category: command.actionCategory,
      requiredParams,
      missingParams,
      errors: missingParams.map(name => `Missing required command param "${name}" for action "${command.action}"`),
      actionDefinition: command.actionDefinition,
      command: commandContext(command)
    };
  } catch (err) {
    return {
      ...base,
      errors: [truncateString(err.message || String(err), 1000)]
    };
  }
}

function findCommand(appName, surfaceId, commandId) {
  const safeCommandId = normalizeCommandId(commandId);
  if (!safeCommandId) return null;
  const list = commandsFor(appName, surfaceId);
  return list.find(command => command.id === safeCommandId) || null;
}

function enqueueCommand(payload = {}) {
  const command = normalizeCommand(payload);
  validateCommandAgainstSurface(command);
  commandsFor(command.appName, command.surfaceId).push(command);
  trimCommandStore(command.appName, command.surfaceId);
  recordActivity('command.queued', {
    command,
    actor: actorFromPayload(payload),
    details: {
      reason: command.reason || '',
      waitForResult: payload.wait === true || payload.waitForResult === true
    }
  });
  return command;
}

function numberOption(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function waitOptions(payload = {}) {
  return {
    timeoutMs: Math.min(
      Math.max(numberOption(payload.timeoutMs, DEFAULT_COMMAND_WAIT_MS), 0),
      MAX_COMMAND_WAIT_MS
    ),
    intervalMs: Math.min(
      Math.max(numberOption(payload.intervalMs, DEFAULT_COMMAND_WAIT_INTERVAL_MS), MIN_COMMAND_WAIT_INTERVAL_MS),
      MAX_COMMAND_WAIT_INTERVAL_MS
    )
  };
}

function freshSnapshotWaitOptions(payload = {}) {
  return {
    timeoutMs: Math.min(
      Math.max(numberOption(payload.snapshotTimeoutMs, DEFAULT_FRESH_SNAPSHOT_WAIT_MS), 0),
      MAX_FRESH_SNAPSHOT_WAIT_MS
    ),
    intervalMs: Math.min(
      Math.max(numberOption(payload.snapshotIntervalMs, payload.intervalMs || DEFAULT_COMMAND_WAIT_INTERVAL_MS), MIN_COMMAND_WAIT_INTERVAL_MS),
      MAX_COMMAND_WAIT_INTERVAL_MS
    )
  };
}

function waitTimedOutCommand(command, timeoutMs) {
  return {
    ...command,
    wait: {
      timedOut: true,
      timeoutMs
    }
  };
}

function waitForCommandFinal(appName, surfaceId, commandId, options = {}) {
  const { timeoutMs, intervalMs } = waitOptions(options);
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let timer = null;
    const finish = (fn) => {
      if (timer) clearTimeout(timer);
      fn();
    };
    const tick = () => {
      const command = findCommand(appName, surfaceId, commandId);
      if (!command) {
        finish(() => reject(new Error(`Unknown command: ${commandId}`)));
        return;
      }
      if (commandIsFinal(command)) {
        finish(() => resolve(command));
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        finish(() => resolve(waitTimedOutCommand(command, timeoutMs)));
        return;
      }
      timer = setTimeout(tick, intervalMs);
    };

    tick();
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function snapshotRevision(snapshot) {
  return Number(snapshot?.revision || 0);
}

function snapshotWaitContext(snapshot, revisionFloor, options, fresh, timedOut = false) {
  return {
    fresh,
    timedOut,
    timeoutMs: options.timeoutMs,
    intervalMs: options.intervalMs,
    waitedForRevisionGreaterThan: revisionFloor,
    revision: snapshotRevision(snapshot),
    updatedAt: snapshot?.updatedAt || null
  };
}

function waitForFreshSurfaceSnapshot(appName, surfaceId, revisionFloor, options = {}) {
  const wait = freshSnapshotWaitOptions(options);
  const startedAt = Date.now();

  return new Promise(resolve => {
    let timer = null;
    const finish = (result) => {
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    const tick = () => {
      const snapshot = snapshotForSurface(appName, surfaceId);
      if (snapshotRevision(snapshot) > revisionFloor) {
        finish(snapshotWaitContext(snapshot, revisionFloor, wait, true, false));
        return;
      }
      if (Date.now() - startedAt >= wait.timeoutMs) {
        finish(snapshotWaitContext(snapshot, revisionFloor, wait, false, true));
        return;
      }
      timer = setTimeout(tick, wait.intervalMs);
    };

    tick();
  });
}

function observeOptions(payload = {}) {
  return {
    observeDelayMs: Math.min(
      Math.max(numberOption(payload.observeDelayMs, DEFAULT_OBSERVE_DELAY_MS), 0),
      MAX_OBSERVE_DELAY_MS
    ),
    activityLimit: Math.min(Math.max(Number(payload.activityLimit) || 10, 1), 50),
    includeContext: payload.includeContext !== false,
    includeActivity: payload.includeActivity !== false,
    waitForFreshSnapshot: payload.waitForFreshSnapshot === true || payload.waitForSnapshot === true
  };
}

function observationContext(command, payload = {}, meta = {}) {
  const appName = command?.appName || appNameFromPayload(payload);
  const surfaceId = command?.surfaceId || surfaceIdFromPayload(payload);
  const options = observeOptions(payload);
  return {
    observedAt: nowIso(),
    command: commandContext(command),
    surface: options.includeContext
      ? surfaceContext({
        ...payload,
        appName,
        surfaceId,
        includeCommands: payload.includeCommands,
        includeControls: payload.includeControls,
        includeActions: payload.includeActions,
        includePreview: payload.includePreview,
        includeTree: payload.includeTree,
        commandLimit: payload.commandLimit
      })
      : null,
    activity: options.includeActivity
      ? listActivity({
        appName,
        surfaceId,
        commandId: command?.id,
        limit: options.activityLimit
      })
      : [],
    observation: {
      waitForFreshSnapshot: options.waitForFreshSnapshot,
      snapshotRevisionBeforeCommand: meta.snapshotRevisionBeforeCommand ?? null,
      freshSnapshot: meta.freshSnapshot || null
    }
  };
}

async function invokeCommandAndObserve(payload = {}) {
  const appName = appNameFromPayload(payload);
  const surfaceId = surfaceIdFromPayload(payload);
  const revisionBeforeCommand = snapshotRevision(snapshotForSurface(appName, surfaceId));
  const command = enqueueCommand(payload);
  const shouldWait = payload.wait !== false && payload.waitForResult !== false;
  const observedCommand = shouldWait
    ? await waitForCommandFinal(command.appName, command.surfaceId, command.id, payload)
    : command;
  const { observeDelayMs, waitForFreshSnapshot } = observeOptions(payload);
  let freshSnapshot = null;
  if (waitForFreshSnapshot) {
    freshSnapshot = await waitForFreshSurfaceSnapshot(command.appName, command.surfaceId, revisionBeforeCommand, payload);
  } else if (observeDelayMs > 0) {
    await delay(observeDelayMs);
  }
  return observationContext(observedCommand, payload, {
    snapshotRevisionBeforeCommand: revisionBeforeCommand,
    freshSnapshot
  });
}

async function refreshSurface(payload = {}) {
  return invokeCommandAndObserve({
    ...payload,
    command: {
      action: 'surface.refresh',
      reason: payload.reason || 'agent.refreshSurface'
    },
    waitForResult: payload.waitForResult !== false,
    waitForFreshSnapshot: payload.waitForFreshSnapshot !== false,
    includeContext: payload.includeContext !== false,
    includeActivity: payload.includeActivity !== false,
    includePreview: payload.includePreview !== false,
    includeCommands: payload.includeCommands !== false,
    includeActions: payload.includeActions !== false
  });
}

function definedObject(source = {}) {
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'undefined') result[key] = value;
  }
  return result;
}

function workflowStepOptions(step = {}) {
  return definedObject({
    wait: step.wait,
    waitForResult: step.waitForResult,
    timeoutMs: step.timeoutMs,
    intervalMs: step.intervalMs,
    observeDelayMs: step.observeDelayMs,
    waitForFreshSnapshot: step.waitForFreshSnapshot,
    waitForSnapshot: step.waitForSnapshot,
    snapshotTimeoutMs: step.snapshotTimeoutMs,
    snapshotIntervalMs: step.snapshotIntervalMs,
    includeContext: step.includeContext,
    includeActivity: step.includeActivity,
    includeTree: step.includeTree,
    includePreview: step.includePreview,
    includeCommands: step.includeCommands,
    includeControls: step.includeControls,
    includeActions: step.includeActions,
    commandLimit: step.commandLimit,
    activityLimit: step.activityLimit
  });
}

function workflowStepsFromPayload(payload = {}) {
  const rawSteps = Array.isArray(payload.steps)
    ? payload.steps
    : (Array.isArray(payload.commands) ? payload.commands : []);
  if (!rawSteps.length) throw new Error('Workflow steps are required.');
  if (rawSteps.length > MAX_WORKFLOW_STEPS) {
    throw new Error(`Workflow step limit exceeded: ${MAX_WORKFLOW_STEPS}`);
  }

  return rawSteps.map((rawStep, index) => {
    const step = rawStep && typeof rawStep === 'object' && !Array.isArray(rawStep) ? rawStep : {};
    const command = step.command && typeof step.command === 'object' && !Array.isArray(step.command)
      ? step.command
      : step;
    return {
      index: index + 1,
      label: truncateString(step.label || step.name || command.action || command.type || `Step ${index + 1}`, 180),
      command: sanitizeJsonish(command, 1) || {},
      options: workflowStepOptions(step)
    };
  });
}

function validateSurfaceWorkflow(payload = {}) {
  const appName = appNameFromPayload(payload);
  const surfaceId = surfaceIdFromPayload(payload);
  try {
    const steps = workflowStepsFromPayload(payload);
    const validations = steps.map(step => ({
      index: step.index,
      label: step.label,
      validation: validateCommandRequest({
        ...payload,
        ...step.options,
        appName,
        surfaceId,
        command: step.command
      })
    }));
    const errors = validations.flatMap(step => step.validation.errors || []);
    return {
      valid: validations.every(step => step.validation.valid),
      appName,
      surfaceId,
      stepCount: steps.length,
      errors,
      steps: validations
    };
  } catch (err) {
    return {
      valid: false,
      appName,
      surfaceId,
      stepCount: 0,
      errors: [truncateString(err.message || String(err), 1000)],
      steps: []
    };
  }
}

function commandObservationFailed(observation) {
  const command = observation?.command;
  if (!command) return true;
  return command.status === 'failed' || command.wait?.timedOut === true;
}

async function invokeSurfaceWorkflow(payload = {}) {
  const appName = appNameFromPayload(payload);
  const surfaceId = surfaceIdFromPayload(payload);
  const workflowId = `wf_${crypto.randomBytes(8).toString('hex')}`;
  const steps = workflowStepsFromPayload(payload);
  const haltOnFailure = payload.haltOnFailure !== false;
  const startedAt = nowIso();
  const results = [];
  let failed = false;

  recordActivity('workflow.started', {
    appName,
    surfaceId,
    actor: actorFromPayload(payload),
    details: {
      workflowId,
      stepCount: steps.length,
      haltOnFailure
    }
  });

  for (const step of steps) {
    try {
      const observation = await invokeCommandAndObserve({
        ...payload,
        ...step.options,
        appName,
        surfaceId,
        command: step.command
      });
      const stepFailed = commandObservationFailed(observation);
      failed = failed || stepFailed;
      const result = {
        index: step.index,
        label: step.label,
        action: observation.command?.action || step.command.action || step.command.type || null,
        status: stepFailed ? 'failed' : 'completed',
        command: observation.command,
        observation
      };
      results.push(result);
      recordActivity('workflow.step', {
        appName,
        surfaceId,
        commandId: observation.command?.id,
        action: result.action,
        status: result.status,
        actor: actorFromPayload(payload),
        details: {
          workflowId,
          stepIndex: step.index,
          label: step.label
        }
      });
      if (stepFailed && haltOnFailure) break;
    } catch (err) {
      failed = true;
      const action = step.command.action || step.command.type || null;
      results.push({
        index: step.index,
        label: step.label,
        action,
        status: 'failed',
        error: truncateString(err.message || String(err), 1000)
      });
      recordActivity('workflow.step', {
        appName,
        surfaceId,
        action,
        status: 'failed',
        actor: actorFromPayload(payload),
        details: {
          workflowId,
          stepIndex: step.index,
          label: step.label,
          error: err.message || String(err)
        }
      });
      if (haltOnFailure) break;
    }
  }

  const completedAt = nowIso();
  const status = failed
    ? (results.length >= steps.length && !haltOnFailure ? 'completed_with_errors' : 'failed')
    : 'completed';
  recordActivity(status === 'completed' ? 'workflow.completed' : 'workflow.failed', {
    appName,
    surfaceId,
    actor: actorFromPayload(payload),
    details: {
      workflowId,
      status,
      stepCount: steps.length,
      completedSteps: results.length
    }
  });

  return {
    id: workflowId,
    appName,
    surfaceId,
    status,
    haltOnFailure,
    startedAt,
    completedAt,
    stepCount: steps.length,
    completedSteps: results.length,
    steps: results
  };
}

function listSnapshots(payload = {}) {
  const appName = payload.appName ? appNameFromPayload(payload) : '';
  const surfaceType = payload.surfaceType ? normalizeToken(payload.surfaceType, '') : '';
  const includeTree = payload.includeTree === true;
  const limit = Math.min(Math.max(Number(payload.limit) || MAX_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  return Array.from(surfaceSnapshots.values())
    .filter(snapshot => !appName || snapshot.appName === appName)
    .filter(snapshot => !surfaceType || snapshot.surfaceType === surfaceType)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, limit)
    .map(snapshot => (includeTree ? snapshot : surfaceSummary(snapshot)));
}

function listActivity(payload = {}) {
  const appName = payload.appName ? appNameFromPayload(payload) : '';
  const surfaceId = payload.surfaceId || payload.surfaceIdFilter
    ? surfaceIdFromPayload({ surfaceId: payload.surfaceId || payload.surfaceIdFilter })
    : '';
  const type = payload.type ? normalizeToken(payload.type, '') : '';
  const commandId = normalizeCommandId(payload.commandId);
  const sinceMs = Date.parse(String(payload.since || payload.sinceAt || ''));
  const hasSince = Number.isFinite(sinceMs);
  const limit = Math.min(Math.max(Number(payload.limit) || MAX_LIST_LIMIT, 1), 100);
  return activityEvents
    .filter(entry => !appName || entry.appName === appName)
    .filter(entry => !surfaceId || entry.surfaceId === surfaceId)
    .filter(entry => !type || entry.type === type)
    .filter(entry => !commandId || entry.commandId === commandId)
    .filter(entry => !hasSince || Date.parse(String(entry.createdAt || '')) >= sinceMs)
    .slice(-limit)
    .reverse()
    .map(activityContext);
}

function eventNamesForAccess(access) {
  return API_DEFINITION.events
    .filter(event => event.access === access)
    .map(event => event.eventName);
}

function capabilities() {
  return {
    moduleName: MODULE_NAME,
    version: VERSION,
    apiDefinition: {
      schemaVersion: API_DEFINITION.schemaVersion,
      description: API_DEFINITION.description
    },
    events: {
      read: eventNamesForAccess('read'),
      write: eventNamesForAccess('write')
    },
    surfaceContract: API_DEFINITION.surfaceContract
  };
}

function setupAgentManagerEvents(motherEmitter) {
  motherEmitter.on('agent.getCapabilities', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.getCapabilities');
      requireAnyPermission(payload, READ_PERMISSIONS);
      callback(null, capabilities());
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.getApiDefinition', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.getApiDefinition');
      requireAnyPermission(payload, READ_PERMISSIONS);
      callback(null, API_DEFINITION);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.getSystemContext', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.getSystemContext');
      requireAnyPermission(payload, READ_PERMISSIONS);
      callback(null, systemContext(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.publishSurfaceSnapshot', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.publishSurfaceSnapshot');
      requireAnyPermission(payload, SURFACE_WRITE_PERMISSIONS);
      const snapshot = normalizeSurfaceSnapshot(payload);
      surfaceSnapshots.set(surfaceKey(snapshot.appName, snapshot.surfaceId), snapshot);
      trimSurfaceStore();
      recordActivity('surface.snapshot', {
        snapshot,
        actor: actorFromPayload(payload),
        details: {
          status: snapshot.status,
          hasPreview: Boolean(snapshot.visual?.previewDataUrl),
          actionCount: Array.isArray(snapshot.actions) ? snapshot.actions.length : 0,
          controlCount: Array.isArray(snapshot.controls) ? snapshot.controls.length : 0
        }
      });
      callback(null, snapshot);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.listSurfaceSnapshots', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.listSurfaceSnapshots');
      requireAnyPermission(payload, READ_PERMISSIONS);
      callback(null, listSnapshots(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.getSurfaceSnapshot', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.getSurfaceSnapshot');
      requireAnyPermission(payload, READ_PERMISSIONS);
      const appName = appNameFromPayload(payload);
      const surfaceId = surfaceIdFromPayload(payload);
      callback(null, snapshotForSurface(appName, surfaceId));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.getSurfaceContext', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.getSurfaceContext');
      requireAnyPermission(payload, READ_PERMISSIONS);
      callback(null, surfaceContext(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.getSurfacePreview', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.getSurfacePreview');
      requireAnyPermission(payload, READ_PERMISSIONS);
      callback(null, surfacePreview(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.inspectSurface', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.inspectSurface');
      requireAnyPermission(payload, READ_PERMISSIONS);
      callback(null, surfaceInspection(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.listSurfaceActions', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.listSurfaceActions');
      requireAnyPermission(payload, READ_PERMISSIONS);
      callback(null, listSurfaceActions(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.getSurfaceAction', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.getSurfaceAction');
      requireAnyPermission(payload, READ_PERMISSIONS);
      const appName = appNameFromPayload(payload);
      const surfaceId = surfaceIdFromPayload(payload);
      const actionName = actionNameFromPayload(payload);
      if (!actionName) throw new Error('action is required.');
      callback(null, findSurfaceAction(appName, surfaceId, actionName));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.validateSurfaceCommand', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.validateSurfaceCommand');
      requireAnyPermission(payload, READ_PERMISSIONS);
      callback(null, validateCommandRequest(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.validateSurfaceWorkflow', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.validateSurfaceWorkflow');
      requireAnyPermission(payload, READ_PERMISSIONS);
      callback(null, validateSurfaceWorkflow(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.listActivity', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.listActivity');
      requireAnyPermission(payload, READ_PERMISSIONS);
      callback(null, listActivity(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.enqueueSurfaceCommand', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.enqueueSurfaceCommand');
      requireAnyPermission(payload, CONTROL_PERMISSIONS);
      callback(null, enqueueCommand(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.invokeSurfaceCommand', async (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.invokeSurfaceCommand');
      requireAnyPermission(payload, CONTROL_PERMISSIONS);
      const command = enqueueCommand(payload);
      if (payload.wait !== true && payload.waitForResult !== true) {
        callback(null, command);
        return;
      }
      callback(null, await waitForCommandFinal(command.appName, command.surfaceId, command.id, payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.invokeSurfaceCommandAndObserve', async (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.invokeSurfaceCommandAndObserve');
      requireAnyPermission(payload, CONTROL_PERMISSIONS);
      callback(null, await invokeCommandAndObserve(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.refreshSurface', async (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.refreshSurface');
      requireAnyPermission(payload, CONTROL_PERMISSIONS);
      callback(null, await refreshSurface(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.invokeSurfaceWorkflow', async (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.invokeSurfaceWorkflow');
      requireAnyPermission(payload, CONTROL_PERMISSIONS);
      callback(null, await invokeSurfaceWorkflow(payload));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.pollSurfaceCommands', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.pollSurfaceCommands');
      requireAnyPermission(payload, SURFACE_WRITE_PERMISSIONS);
      const appName = appNameFromPayload(payload);
      const surfaceId = surfaceIdFromPayload(payload);
      const limit = Math.min(Math.max(Number(payload.limit) || 10, 1), 25);
      const pending = commandsFor(appName, surfaceId)
        .filter(command => command.status === 'queued')
        .slice(0, limit);
      const deliveredAt = nowIso();
      for (const command of pending) {
        command.status = 'delivered';
        command.deliveredAt = deliveredAt;
        command.updatedAt = deliveredAt;
        command.deliveryCount += 1;
        recordActivity('command.delivered', {
          command,
          actor: actorFromPayload(payload),
          details: {
            deliveryCount: command.deliveryCount
          }
        });
      }
      callback(null, pending);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.ackSurfaceCommand', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.ackSurfaceCommand');
      requireAnyPermission(payload, SURFACE_WRITE_PERMISSIONS);
      const appName = appNameFromPayload(payload);
      const surfaceId = surfaceIdFromPayload(payload);
      const commandId = normalizeCommandId(payload.commandId ?? payload.id);
      if (!commandId) throw new Error('commandId is required.');
      const command = findCommand(appName, surfaceId, commandId);
      if (!command) throw new Error(`Unknown command: ${commandId}`);
      const status = payload.status === 'failed' || payload.error ? 'failed' : 'acked';
      const timestamp = nowIso();
      command.status = status;
      command.ackedAt = timestamp;
      command.updatedAt = timestamp;
      command.result = sanitizeJsonish(payload.result || null, 1);
      command.error = payload.error ? truncateString(payload.error, 1000) : null;
      recordActivity(status === 'failed' ? 'command.failed' : 'command.acked', {
        command,
        actor: actorFromPayload(payload),
        details: {
          hasResult: Boolean(command.result),
          error: command.error
        }
      });
      callback(null, command);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.listSurfaceCommands', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.listSurfaceCommands');
      requireAnyPermission(payload, READ_PERMISSIONS);
      const appName = appNameFromPayload(payload);
      const surfaceId = surfaceIdFromPayload(payload);
      const limit = Math.min(Math.max(Number(payload.limit) || 25, 1), 100);
      callback(null, commandsFor(appName, surfaceId).slice(-limit));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.getSurfaceCommand', (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.getSurfaceCommand');
      requireAnyPermission(payload, READ_PERMISSIONS);
      const appName = appNameFromPayload(payload);
      const surfaceId = surfaceIdFromPayload(payload);
      const commandId = normalizeCommandId(payload.commandId ?? payload.id);
      if (!commandId) throw new Error('commandId is required.');
      callback(null, findCommand(appName, surfaceId, commandId));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('agent.waitForSurfaceCommand', async (payload, originalCb) => {
    const callback = once(originalCb);
    try {
      assertAgentPayload(payload, 'agent.waitForSurfaceCommand');
      requireAnyPermission(payload, READ_PERMISSIONS);
      const appName = appNameFromPayload(payload);
      const surfaceId = surfaceIdFromPayload(payload);
      const commandId = normalizeCommandId(payload.commandId ?? payload.id);
      if (!commandId) throw new Error('commandId is required.');
      callback(null, await waitForCommandFinal(appName, surfaceId, commandId, payload));
    } catch (err) {
      callback(err);
    }
  });
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt }) {
    if (!isCore) throw new Error('[AGENT MANAGER] Must be loaded as a core module.');
    if (!jwt) throw new Error('[AGENT MANAGER] initialization requires a valid JWT token.');
    if (!motherEmitter) throw new Error('[AGENT MANAGER] motherEmitter missing.');

    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    setupAgentManagerEvents(motherEmitter);
    console.log('[AGENT MANAGER] Ready.');
  },

  setupAgentManagerEvents,
  _internals: {
    appNameFromPayload,
    activityContext,
    activityEvents,
    capabilities,
    commandsFor,
    commandIsFinal,
    enqueueCommand,
    eventNamesForAccess,
    findSurfaceAction,
    invokeCommandAndObserve,
    invokeSurfaceWorkflow,
    refreshSurface,
    listSurfaceActions,
    listActivity,
    listSnapshots,
    normalizeCommandId,
    normalizeCommand,
    sanitizeVisual,
    normalizeSurfaceSnapshot,
    validateCommandRequest,
    validateCommandAgainstSurface,
    validateSurfaceWorkflow,
    waitForCommandFinal,
    workflowStepsFromPayload,
    pendingCommandsFor,
    recordActivity,
    sanitizeJsonish,
    surfaceCommands,
    surfaceContext,
    surfaceInspection,
    surfaceKey,
    surfaceSnapshots,
    surfacePreview,
    snapshotRevision,
    waitForFreshSurfaceSnapshot,
    snapshotForSurface,
    surfaceFreshness,
    systemContext,
    systemSurfaceContext,
    surfaceSummary,
    STALE_SURFACE_AFTER_MS,
    INACTIVE_SURFACE_AFTER_MS,
    MAX_ACTIVITY_EVENTS
  },
  API_DEFINITION,
  MODULE_NAME,
  MODULE_TYPE,
  VERSION
};
