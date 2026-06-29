'use strict';

const crypto = require('crypto');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  describeOneTimeAccessEvent
} = require('./moduleAccessPolicy');
const {
  _internals: {
    adminApiDefinition
  }
} = require('../runtimeManager');

const DEFAULT_CONSENT_TIMEOUT_MS = 60 * 1000;
const SENSITIVE_PAYLOAD_KEYS = new Set([
  'authmodulesecret',
  'decodedjwt',
  'jwt',
  'nonce',
  'password',
  'secret',
  'token'
]);

function accessConsentError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function nowIso() {
  return new Date().toISOString();
}

function requestId() {
  return `mar_${crypto.randomBytes(12).toString('hex')}`;
}

function toUserId(decodedJWT = {}) {
  return decodedJWT.userId || decodedJWT.sub || decodedJWT.id || null;
}

function safePayloadValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return depth >= 2
      ? `[${value.length} item${value.length === 1 ? '' : 's'}]`
      : value.slice(0, 6).map(item => safePayloadValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 2) return '[object]';
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 10)) {
      if (SENSITIVE_PAYLOAD_KEYS.has(key.toLowerCase())) {
        result[key] = '[redacted]';
      } else {
        result[key] = safePayloadValue(item, depth + 1);
      }
    }
    return result;
  }
  return String(value);
}

function summarizePayload(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  const summary = {};
  for (const [key, value] of Object.entries(source)) {
    if (SENSITIVE_PAYLOAD_KEYS.has(key.toLowerCase())) {
      continue;
    }
    summary[key] = safePayloadValue(value);
  }
  return summary;
}

function findManifestRequest(moduleInfo = {}, eventName = '') {
  const requestedAccess = Array.isArray(moduleInfo.requestedAccess)
    ? moduleInfo.requestedAccess
    : [];
  return requestedAccess.find(item => item && item.event === eventName) || null;
}

function buildRequest({ moduleName, moduleInfo = {}, eventName, eventPayload = {}, timeoutMs }) {
  const described = describeOneTimeAccessEvent(eventName);
  const { definition } = adminApiDefinition(described.resource, described.action);
  if (!definition || definition.eventName !== described.event) {
    throw accessConsentError(
      'E_MODULE_ACCESS_CONSENT_DEFINITION',
      `Event "${described.event}" is not available through the admin facade.`
    );
  }

  const manifestRequest = findManifestRequest(moduleInfo, described.event);
  const createdAt = nowIso();
  const ttlMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_CONSENT_TIMEOUT_MS;

  return {
    id: requestId(),
    moduleName: String(moduleName || ''),
    event: described.event,
    resource: described.resource,
    action: described.action,
    targetModuleName: definition.moduleName,
    targetModuleType: definition.moduleType || 'core',
    permission: definition.permission || '',
    reason: manifestRequest?.reason || '',
    risk: manifestRequest?.risk || (described.protected ? 'high' : 'standard'),
    protected: described.protected === true,
    allowPermanent: described.allowPermanent === true && Boolean(manifestRequest),
    payloadSummary: summarizePayload(eventPayload),
    createdAt,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    status: 'pending'
  };
}

class ModuleAccessConsentManager {
  constructor({ timeoutMs = DEFAULT_CONSENT_TIMEOUT_MS } = {}) {
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
  }

  requestAccess(input = {}) {
    const ttlMs = Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
      ? input.timeoutMs
      : this.timeoutMs;
    const request = buildRequest({
      ...input,
      timeoutMs: ttlMs
    });

    const promise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        const record = this.pending.get(request.id);
        if (!record) return;
        this.pending.delete(request.id);
        record.request.status = 'expired';
        resolve({
          approved: false,
          error: accessConsentError(
            'E_MODULE_ACCESS_CONSENT_TIMEOUT',
            `Module access request "${request.id}" expired before an admin approved it.`
          ),
          request: record.request
        });
      }, ttlMs);
      timer.unref?.();
      this.pending.set(request.id, { request, resolve, timer });
    });

    return { request, promise };
  }

  listPendingRequests(filter = {}) {
    const moduleName = filter.moduleName ? String(filter.moduleName) : '';
    return Array.from(this.pending.values())
      .map(record => ({ ...record.request }))
      .filter(request => !moduleName || request.moduleName === moduleName);
  }

  getPendingRequest(id) {
    const record = this.pending.get(String(id || ''));
    return record ? { ...record.request } : null;
  }

  resolveRequest(id, decision = {}) {
    const requestKey = String(id || '');
    const record = this.pending.get(requestKey);
    if (!record) {
      throw accessConsentError('E_MODULE_ACCESS_CONSENT_MISSING', `Module access request "${requestKey}" is not pending.`);
    }

    this.pending.delete(requestKey);
    clearTimeout(record.timer);

    const approved = decision.approved === true;
    record.request.status = approved ? 'approved' : 'denied';
    record.request.resolvedAt = nowIso();
    record.request.resolvedBy = decision.grantedBy || null;
    record.resolve({
      approved,
      mode: decision.mode === 'always' ? 'always' : 'once',
      jwt: decision.jwt || null,
      decodedJWT: decision.decodedJWT || null,
      grantedBy: decision.grantedBy || null,
      request: { ...record.request }
    });

    return { ...record.request };
  }

  rejectAllForModule(moduleName, reason = 'Module stopped') {
    const target = String(moduleName || '');
    for (const record of Array.from(this.pending.values())) {
      if (record.request.moduleName !== target) continue;
      this.pending.delete(record.request.id);
      clearTimeout(record.timer);
      record.request.status = 'denied';
      record.resolve({
        approved: false,
        error: accessConsentError('E_MODULE_ACCESS_CONSENT_CANCELLED', reason),
        request: { ...record.request }
      });
    }
  }
}

const sharedModuleAccessConsentManager = new ModuleAccessConsentManager();

function assertCanApproveRequest(decodedJWT, request) {
  if (!decodedJWT || !hasPermission(decodedJWT, 'modules.manageAccess')) {
    throw accessConsentError('E_MODULE_ACCESS_CONSENT_PERMISSION', 'Forbidden - missing permission: modules.manageAccess');
  }
  if (request?.permission && !hasPermission(decodedJWT, request.permission)) {
    throw accessConsentError(
      'E_MODULE_ACCESS_CONSENT_TARGET_PERMISSION',
      `Forbidden - missing permission: ${request.permission}`
    );
  }
}

module.exports = {
  DEFAULT_CONSENT_TIMEOUT_MS,
  ModuleAccessConsentManager,
  accessConsentError,
  assertCanApproveRequest,
  sharedModuleAccessConsentManager,
  summarizePayload,
  _internals: {
    buildRequest,
    safePayloadValue
  }
};
