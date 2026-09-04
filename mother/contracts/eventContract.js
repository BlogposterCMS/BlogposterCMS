'use strict';

const EVENT_CONTRACT_ERROR_CODES = Object.freeze({
  DISPATCH_REJECTED: 'EVENT_CONTRACT_DISPATCH_REJECTED',
  HANDLER_FAILED: 'EVENT_CONTRACT_HANDLER_FAILED',
  HTTP_ADMIN_REQUIRED: 'EVENT_CONTRACT_HTTP_ADMIN_REQUIRED',
  HTTP_AUTH_REQUIRED: 'EVENT_CONTRACT_HTTP_AUTH_REQUIRED',
  HTTP_BATCH_INVALID: 'EVENT_CONTRACT_HTTP_BATCH_INVALID',
  HTTP_EVENT_NAME_REQUIRED: 'EVENT_CONTRACT_HTTP_EVENT_NAME_REQUIRED',
  HTTP_EVENT_REJECTED: 'EVENT_CONTRACT_HTTP_EVENT_REJECTED',
  HTTP_TOKEN_INVALID: 'EVENT_CONTRACT_HTTP_TOKEN_INVALID',
  INVALID_PAYLOAD: 'EVENT_CONTRACT_INVALID_PAYLOAD',
  INVALID_RESULT: 'EVENT_CONTRACT_INVALID_RESULT',
  NOT_REGISTERED: 'EVENT_CONTRACT_NOT_REGISTERED',
  TIMEOUT: 'EVENT_CONTRACT_TIMEOUT'
});

// Keep the backend deadline below the browser client's 10-second default so
// callers receive the structured timeout instead of an AbortError race.
const DEFAULT_EVENT_TIMEOUT_MS = 9_000;
const SAFE_ERROR_DETAIL_KEYS = new Set([
  'actual',
  'code',
  'expected',
  'field',
  'fields',
  'issues',
  'operationId',
  'path',
  'reason',
  'requestId',
  'timeoutMs'
]);
const SENSITIVE_ERROR_DETAIL_KEY = /(authorization|cookie|credential|jwt|password|private.?key|secret|session|token)/i;

/**
 * Error shared by event callers, handlers and transport adapters.
 * Keeping the searchable code on the Error preserves the existing callback
 * convention while giving every boundary the same machine-readable failure.
 */
class EventContractError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'EventContractError';
    this.code = code;
    this.status = normalizeStatus(options.status, 500);
    this.eventName = options.eventName || null;
    this.details = options.details || null;
    if (options.cause) this.cause = options.cause;
  }
}

function normalizeStatus(value, fallback) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : fallback;
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function isJsonCompatible(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    // JSON.stringify represents undefined array slots as null.
    const compatible = value.every(entry => (
      typeof entry === 'undefined' || isJsonCompatible(entry, seen)
    ));
    seen.delete(value);
    return compatible;
  }

  // Dates and other value objects with a JSON representation are valid event
  // values, but enumerable functions, symbols and cyclic data are not.
  if (typeof value.toJSON === 'function') {
    try {
      const compatible = isJsonCompatible(value.toJSON(), seen);
      seen.delete(value);
      return compatible;
    } catch {
      seen.delete(value);
      return false;
    }
  }
  // Undefined object values are omitted during transport serialization.
  const compatible = Object.values(value).every(entry => (
    typeof entry === 'undefined' || isJsonCompatible(entry, seen)
  ));
  seen.delete(value);
  return compatible;
}

function matchesType(expected, value) {
  if (!expected) return true;
  if (expected === 'json') return isJsonCompatible(value);
  if (expected === 'undefined') return typeof value === 'undefined';
  if (expected === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'integer') return Number.isInteger(value);
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expected === 'null') return value === null;
  return typeof value === expected;
}

function firstSchemaIssue(schema, value, path = '$') {
  if (!schema) return null;

  if (Array.isArray(schema.anyOf)) {
    const matched = schema.anyOf.some(candidate => !firstSchemaIssue(candidate, value, path));
    if (!matched) {
      return { path, expected: 'one declared schema', actual: valueType(value) };
    }
  }

  if (!matchesType(schema.type, value)) {
    return { path, expected: schema.type, actual: valueType(value) };
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return { path, expected: `one of ${schema.enum.join(', ')}`, actual: valueType(value) };
  }

  if (schema.type === 'string' && Number.isInteger(schema.minLength) && value.length < schema.minLength) {
    return { path, expected: `string length >= ${schema.minLength}`, actual: `string length ${value.length}` };
  }

  if (schema.type === 'array' && schema.items) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = firstSchemaIssue(schema.items, value[index], `${path}[${index}]`);
      if (issue) return issue;
    }
  }

  if (schema.type === 'object') {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        return { path: `${path}.${key}`, expected: 'required property', actual: 'missing' };
      }
    }

    for (const [key, propertySchema] of Object.entries(schema.properties || {})) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      // Optional JavaScript object fields commonly exist with `undefined`
      // before transport serialization; treat them the same as omitted fields.
      if (typeof value[key] === 'undefined' && !(schema.required || []).includes(key)) continue;
      const issue = firstSchemaIssue(propertySchema, value[key], `${path}.${key}`);
      if (issue) return issue;
    }

    if (schema.additionalProperties === false) {
      const known = new Set(Object.keys(schema.properties || {}));
      const unexpected = Object.keys(value).find(key => !known.has(key));
      if (unexpected) {
        return { path: `${path}.${unexpected}`, expected: 'declared property', actual: 'unexpected property' };
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const known = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(value)) {
        if (known.has(key)) continue;
        // Undefined transport fields are omitted by JSON serialization and are
        // equivalent to an absent optional property.
        if (typeof value[key] === 'undefined') continue;
        const issue = firstSchemaIssue(schema.additionalProperties, value[key], `${path}.${key}`);
        if (issue) return issue;
      }
    }
  }

  return null;
}

function schemaContainsUnboundedAny(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.type === 'any') return true;
  return Object.values(schema).some(value => (
    Array.isArray(value)
      ? value.some(schemaContainsUnboundedAny)
      : schemaContainsUnboundedAny(value)
  ));
}

function defineEventContract(definition = {}) {
  const eventName = String(definition.eventName || '').trim();
  if (!eventName) throw new TypeError('EVENT_CONTRACT_DEFINITION_INVALID: eventName is required.');
  if (!definition.payloadSchema || !definition.resultSchema) {
    throw new TypeError(`EVENT_CONTRACT_DEFINITION_INVALID: ${eventName} requires payloadSchema and resultSchema.`);
  }
  if (
    schemaContainsUnboundedAny(definition.payloadSchema) ||
    schemaContainsUnboundedAny(definition.resultSchema)
  ) {
    throw new TypeError(`EVENT_CONTRACT_DEFINITION_INVALID: ${eventName} cannot use the unbounded any schema.`);
  }

  const timeoutMs = Number(definition.timeoutMs ?? DEFAULT_EVENT_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(`EVENT_CONTRACT_DEFINITION_INVALID: ${eventName} timeoutMs must be greater than zero.`);
  }

  return Object.freeze({
    eventName,
    description: String(definition.description || '').trim(),
    payloadSchema: definition.payloadSchema,
    resultSchema: definition.resultSchema,
    resultType: String(definition.resultType || 'unknown').trim() || 'unknown',
    timeoutMs
  });
}

function assertSchema(contract, kind, value) {
  const schema = kind === 'payload' ? contract.payloadSchema : contract.resultSchema;
  const issue = firstSchemaIssue(schema, value);
  if (!issue) return value;

  const code = kind === 'payload'
    ? EVENT_CONTRACT_ERROR_CODES.INVALID_PAYLOAD
    : EVENT_CONTRACT_ERROR_CODES.INVALID_RESULT;
  const status = kind === 'payload' ? 400 : 500;
  throw new EventContractError(
    code,
    `${code}: Event "${contract.eventName}" has an invalid ${kind} at ${issue.path}.`,
    { eventName: contract.eventName, status, details: issue }
  );
}

function normalizeEventContractError(error, contract) {
  if (error instanceof EventContractError) return error;

  const original = error instanceof Error ? error : new Error(String(error || 'Unknown event error'));
  const prefixedCode = String(original.message || '').match(/^([A-Z][A-Z0-9_]+):/)?.[1];
  const code = typeof original.code === 'string' && original.code.trim()
    ? original.code.trim()
    : prefixedCode || EVENT_CONTRACT_ERROR_CODES.HANDLER_FAILED;
  const message = code === EVENT_CONTRACT_ERROR_CODES.HANDLER_FAILED
    ? `${code}: Event "${contract.eventName}" failed: ${original.message}`
    : original.message;

  return new EventContractError(code, message, {
    eventName: contract.eventName,
    status: original.status || original.statusCode || 500,
    details: original.details,
    cause: original
  });
}

function sanitizeErrorDetailValue(value, depth = 0, seen = new WeakSet()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 1_000);
  if (depth >= 6 || !value || typeof value !== 'object') return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 50)
      .map(entry => sanitizeErrorDetailValue(entry, depth + 1, seen))
      .filter(entry => typeof entry !== 'undefined');
  }

  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_ERROR_DETAIL_KEY.test(key)) continue;
    const safeEntry = sanitizeErrorDetailValue(entry, depth + 1, seen);
    if (typeof safeEntry !== 'undefined') output[key] = safeEntry;
  }
  return output;
}

function sanitizeEventContractDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const safeDetails = {};
  for (const [key, value] of Object.entries(details)) {
    if (!SAFE_ERROR_DETAIL_KEYS.has(key) || SENSITIVE_ERROR_DETAIL_KEY.test(key)) continue;
    const safeValue = sanitizeErrorDetailValue(value);
    if (typeof safeValue !== 'undefined') safeDetails[key] = safeValue;
  }
  return Object.keys(safeDetails).length ? safeDetails : null;
}

/**
 * Canonical Promise request boundary over the existing EventEmitter transport.
 * The callback is the listener protocol; callers do not implement local
 * Promise adapters or duplicate timeout/error handling.
 */
function requestEvent(motherEmitter, contract, payload, options = {}) {
  try {
    assertSchema(contract, 'payload', payload);
  } catch (error) {
    return Promise.reject(error);
  }

  if (!motherEmitter || typeof motherEmitter.emit !== 'function') {
    return Promise.reject(new EventContractError(
      EVENT_CONTRACT_ERROR_CODES.DISPATCH_REJECTED,
      `${EVENT_CONTRACT_ERROR_CODES.DISPATCH_REJECTED}: Event emitter is unavailable for "${contract.eventName}".`,
      { eventName: contract.eventName, status: 503 }
    ));
  }

  const requestedTimeoutMs = Number(options.timeoutMs ?? contract.timeoutMs);
  const timeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
    ? requestedTimeoutMs
    : contract.timeoutMs;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (operation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      operation();
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new EventContractError(
        EVENT_CONTRACT_ERROR_CODES.TIMEOUT,
        `${EVENT_CONTRACT_ERROR_CODES.TIMEOUT}: Event "${contract.eventName}" did not finish within ${timeoutMs} ms.`,
        { eventName: contract.eventName, status: 504, details: { timeoutMs } }
      )));
    }, timeoutMs);

    try {
      const emitted = motherEmitter.emit(contract.eventName, payload, (error, result) => {
        if (error) {
          finish(() => reject(normalizeEventContractError(error, contract)));
          return;
        }
        try {
          assertSchema(contract, 'result', result);
          finish(() => resolve(result));
        } catch (validationError) {
          finish(() => reject(validationError));
        }
      });

      if (emitted === false) {
        const hasNoRegisteredListener = (
          typeof motherEmitter.listenerCount === 'function' &&
          motherEmitter.listenerCount(contract.eventName) === 0
        );
        const code = hasNoRegisteredListener
          ? EVENT_CONTRACT_ERROR_CODES.NOT_REGISTERED
          : EVENT_CONTRACT_ERROR_CODES.DISPATCH_REJECTED;
        finish(() => reject(new EventContractError(
          code,
          `${code}: Event "${contract.eventName}" ${hasNoRegisteredListener ? 'is not registered' : 'was rejected before dispatch'}.`,
          { eventName: contract.eventName, status: hasNoRegisteredListener ? 404 : 503 }
        )));
      }
    } catch (error) {
      finish(() => reject(normalizeEventContractError(error, contract)));
    }
  });
}

/** Register a schema-validating callback listener on the existing bus. */
function registerEventContractHandler(motherEmitter, contract, handler, options = {}) {
  if (!motherEmitter || typeof motherEmitter.on !== 'function') {
    throw new TypeError(`EVENT_CONTRACT_REGISTRATION_INVALID: Event emitter is unavailable for "${contract.eventName}".`);
  }
  if (typeof handler !== 'function') {
    throw new TypeError(`EVENT_CONTRACT_REGISTRATION_INVALID: Handler is required for "${contract.eventName}".`);
  }

  const listener = async (payload, originalCallback) => {
    let callbackFired = false;
    const callback = (...args) => {
      if (callbackFired) return;
      callbackFired = true;
      if (typeof originalCallback === 'function') originalCallback(...args);
    };

    try {
      assertSchema(contract, 'payload', payload);
      const result = await handler(payload);
      assertSchema(contract, 'result', result);
      callback(null, result);
    } catch (error) {
      callback(normalizeEventContractError(error, contract));
    }
  };

  if (options.moduleName) listener.moduleName = options.moduleName;
  motherEmitter.on(contract.eventName, listener);
  return listener;
}

function serializeEventContractError(error, contract) {
  const normalized = normalizeEventContractError(error, contract);
  const details = sanitizeEventContractDetails(normalized.details);
  return {
    error: normalized.message,
    code: normalized.code,
    ...(details ? { details } : {})
  };
}

module.exports = {
  DEFAULT_EVENT_TIMEOUT_MS,
  EVENT_CONTRACT_ERROR_CODES,
  EventContractError,
  assertSchema,
  defineEventContract,
  firstSchemaIssue,
  normalizeEventContractError,
  registerEventContractHandler,
  requestEvent,
  sanitizeEventContractDetails,
  serializeEventContractError
};
