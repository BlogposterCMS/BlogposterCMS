'use strict';

const {
  EVENT_CONTRACT_ERROR_CODES,
  EventContractError,
  defineEventContract,
  requestEvent
} = require('./eventContract');
const { BACKEND_EVENTS, BACKEND_EVENT_NAMES } = require('./generatedBackendEventCatalog');
const {
  GENERATED_BACKEND_EVENT_CONTRACT_SPECS
} = require('./generatedBackendEventContractSpecs');

const NON_EMPTY_STRING = Object.freeze({ type: 'string', minLength: 1 });
const OPTIONAL_OBJECT = Object.freeze({ type: 'object' });
const JSON_VALUE = Object.freeze({ type: 'json' });

const CMS_FACADE_PAYLOAD_SCHEMA = Object.freeze({
  type: 'object',
  required: ['jwt', 'moduleName', 'moduleType', 'resource', 'action'],
  properties: {
    jwt: NON_EMPTY_STRING,
    moduleName: { type: 'string', enum: ['runtimeManager'] },
    moduleType: { type: 'string', enum: ['core'] },
    resource: NON_EMPTY_STRING,
    action: NON_EMPTY_STRING,
    params: OPTIONAL_OBJECT,
    decodedJWT: OPTIONAL_OBJECT,
    appContext: OPTIONAL_OBJECT,
    isExternalRequest: { type: 'boolean' }
  }
});

const CMS_FACADE_RESULT_SCHEMA = Object.freeze({
  type: 'object',
  required: ['resource', 'action', 'eventName', 'data'],
  properties: {
    resource: NON_EMPTY_STRING,
    action: NON_EMPTY_STRING,
    eventName: NON_EMPTY_STRING,
    data: JSON_VALUE
  }
});

/**
 * @typedef {object} CmsFacadeResult
 * @property {string} resource Stable facade resource key.
 * @property {string} action Stable facade action key.
 * @property {string} eventName Internal owning-module event used by the facade.
 * @property {import('./generatedBackendEventContracts').JsonValue} data Sanitized owning-module result.
 */

/** @type {Readonly<Record<string, Readonly<object>>>} */
const BACKEND_EVENT_CONTRACTS = Object.freeze({
  ISSUE_PUBLIC_TOKEN: defineEventContract({
    eventName: BACKEND_EVENTS.ISSUE_PUBLIC_TOKEN,
    description: 'Issue a short-lived public runtime token.',
    payloadSchema: {
      type: 'object',
      required: ['moduleName'],
      properties: {
        moduleName: NON_EMPTY_STRING,
        moduleType: { type: 'string', enum: ['core'] },
        purpose: NON_EMPTY_STRING,
        isExternalRequest: { type: 'boolean' }
      }
    },
    resultSchema: NON_EMPTY_STRING,
    resultType: 'IssuePublicTokenResult'
  }),
  ENSURE_PUBLIC_TOKEN: defineEventContract({
    eventName: BACKEND_EVENTS.ENSURE_PUBLIC_TOKEN,
    description: 'Return a valid public runtime token, refreshing it when required.',
    payloadSchema: {
      type: 'object',
      required: ['moduleName'],
      properties: {
        moduleName: NON_EMPTY_STRING,
        moduleType: { type: 'string', enum: ['core'] },
        currentToken: { anyOf: [NON_EMPTY_STRING, { type: 'null' }] },
        purpose: NON_EMPTY_STRING,
        isExternalRequest: { type: 'boolean' }
      }
    },
    resultSchema: NON_EMPTY_STRING,
    resultType: 'EnsurePublicTokenResult'
  }),
  CMS_ADMIN_API_REQUEST: defineEventContract({
    eventName: BACKEND_EVENTS.CMS_ADMIN_API_REQUEST,
    description: 'Authenticated admin/editor request routed through Runtime Manager.',
    payloadSchema: CMS_FACADE_PAYLOAD_SCHEMA,
    resultSchema: CMS_FACADE_RESULT_SCHEMA,
    resultType: 'CmsAdminApiRequestResult',
    // The facade can own update/import/export operations. Its outer deadline
    // must outlive the longest declared inner event so a mutation is not
    // reported as timed out while its owning handler is still progressing.
    timeoutMs: 305_000
  }),
  CMS_PUBLIC_RUNTIME_REQUEST: defineEventContract({
    eventName: BACKEND_EVENTS.CMS_PUBLIC_RUNTIME_REQUEST,
    description: 'Public read request routed through Runtime Manager.',
    payloadSchema: CMS_FACADE_PAYLOAD_SCHEMA,
    resultSchema: CMS_FACADE_RESULT_SCHEMA,
    resultType: 'CmsPublicRuntimeRequestResult'
  }),
  DISPATCH_APP_EVENT: defineEventContract({
    eventName: BACKEND_EVENTS.DISPATCH_APP_EVENT,
    description: 'Validated AppLoader bridge request from an admin iframe.',
    payloadSchema: {
      type: 'object',
      required: ['jwt', 'moduleName', 'moduleType', 'appName'],
      properties: {
        jwt: NON_EMPTY_STRING,
        moduleName: { type: 'string', enum: ['appLoader'] },
        moduleType: { type: 'string', enum: ['core'] },
        appName: NON_EMPTY_STRING,
        event: NON_EMPTY_STRING,
        type: NON_EMPTY_STRING,
        data: OPTIONAL_OBJECT,
        decodedJWT: OPTIONAL_OBJECT,
        isExternalRequest: { type: 'boolean' }
      },
      anyOf: [
        { type: 'object', required: ['event'] },
        { type: 'object', required: ['type'] }
      ]
    },
    resultSchema: {
      type: 'object',
      required: ['ok', 'handled', 'appName', 'event', 'data'],
      properties: {
        ok: { type: 'boolean' },
        handled: { type: 'boolean' },
        appName: NON_EMPTY_STRING,
        event: NON_EMPTY_STRING,
        data: JSON_VALUE
      }
    },
    resultType: 'DispatchAppEventResult'
  })
});

const REQUEST_TIMEOUT_OVERRIDES_MS = Object.freeze({
  [BACKEND_EVENTS.AGENT_INVOKE_SURFACE_COMMAND_AND_OBSERVE]: 30_000,
  [BACKEND_EVENTS.AGENT_INVOKE_SURFACE_WORKFLOW]: 30_000,
  [BACKEND_EVENTS.AGENT_WAIT_FOR_SURFACE_COMMAND]: 30_000,
  checkModuleUpdates: 60_000,
  installAppFromDirectory: 300_000,
  installModuleFromZip: 300_000,
  installModuleUpdate: 300_000,
  runExport: 300_000,
  runImport: 300_000
});

/**
 * Generated contracts are derived from callers and owning listeners. This
 * keeps event-specific payload keys and result names synchronized while domain
 * modules continue to own the actual behavior.
 */
function defineCatalogContract(eventName) {
  const generated = GENERATED_BACKEND_EVENT_CONTRACT_SPECS[eventName];
  if (!generated) {
    throw new TypeError(`EVENT_CONTRACT_DEFINITION_INVALID: Missing generated schema for ${eventName}.`);
  }
  return defineEventContract({
    eventName,
    ...generated,
    timeoutMs: REQUEST_TIMEOUT_OVERRIDES_MS[eventName]
  });
}

const EXPLICIT_CONTRACTS_BY_NAME = new Map(
  Object.values(BACKEND_EVENT_CONTRACTS).map(contract => [contract.eventName, contract])
);
const BACKEND_EVENT_CONTRACTS_BY_NAME = new Map(
  BACKEND_EVENT_NAMES.map(eventName => [
    eventName,
    EXPLICIT_CONTRACTS_BY_NAME.get(eventName) || defineCatalogContract(eventName)
  ])
);
for (const [eventName, contract] of EXPLICIT_CONTRACTS_BY_NAME) {
  BACKEND_EVENT_CONTRACTS_BY_NAME.set(eventName, contract);
}

function getBackendEventContract(eventName) {
  return BACKEND_EVENT_CONTRACTS_BY_NAME.get(String(eventName || '').trim()) || null;
}

function resolveBackendEventContract(contractOrEventName) {
  if (contractOrEventName && typeof contractOrEventName === 'object' && contractOrEventName.eventName) {
    return contractOrEventName;
  }
  return getBackendEventContract(contractOrEventName);
}

function requestBackendEvent(motherEmitter, contractOrEventName, payload, options = {}) {
  const contract = resolveBackendEventContract(contractOrEventName);
  if (!contract) {
    const eventName = String(contractOrEventName || '').trim();
    return Promise.reject(new EventContractError(
      EVENT_CONTRACT_ERROR_CODES.NOT_REGISTERED,
      `${EVENT_CONTRACT_ERROR_CODES.NOT_REGISTERED}: Backend event contract "${eventName}" is not declared.`,
      { eventName, status: 404 }
    ));
  }
  return requestEvent(motherEmitter, contract, payload, options);
}

const HTTP_PUBLIC_EVENT_CONTRACTS = Object.freeze([
  BACKEND_EVENT_CONTRACTS.ISSUE_PUBLIC_TOKEN,
  BACKEND_EVENT_CONTRACTS.ENSURE_PUBLIC_TOKEN
]);
const HTTP_PUBLIC_TOKEN_EVENT_CONTRACTS = Object.freeze([
  BACKEND_EVENT_CONTRACTS.CMS_PUBLIC_RUNTIME_REQUEST
]);
const HTTP_DIRECT_EVENT_CONTRACTS = Object.freeze([
  ...HTTP_PUBLIC_EVENT_CONTRACTS,
  ...HTTP_PUBLIC_TOKEN_EVENT_CONTRACTS,
  BACKEND_EVENT_CONTRACTS.CMS_ADMIN_API_REQUEST,
  BACKEND_EVENT_CONTRACTS.DISPATCH_APP_EVENT
]);
const HTTP_EVENT_CONTRACTS_BY_NAME = new Map(
  HTTP_DIRECT_EVENT_CONTRACTS.map(contract => [contract.eventName, contract])
);

function getHttpEventContract(eventName) {
  return HTTP_EVENT_CONTRACTS_BY_NAME.get(String(eventName || '').trim()) || null;
}

module.exports = {
  BACKEND_EVENT_CONTRACTS,
  BACKEND_EVENT_CONTRACTS_BY_NAME,
  CMS_FACADE_PAYLOAD_SCHEMA,
  CMS_FACADE_RESULT_SCHEMA,
  HTTP_DIRECT_EVENT_CONTRACTS,
  HTTP_PUBLIC_EVENT_CONTRACTS,
  HTTP_PUBLIC_TOKEN_EVENT_CONTRACTS,
  getBackendEventContract,
  getHttpEventContract,
  requestBackendEvent
};
