'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const {
  EVENT_CONTRACT_ERROR_CODES,
  assertSchema,
  defineEventContract,
  registerEventContractHandler,
  requestEvent,
  serializeEventContractError
} = require('../mother/contracts/eventContract');
const {
  BACKEND_EVENT_CONTRACTS,
  HTTP_DIRECT_EVENT_CONTRACTS,
  getHttpEventContract
} = require('../mother/contracts/backendEventContracts');
const {
  HTTP_DIRECT_CONTRACT_EVENTS,
  HTTP_PUBLIC_EVENTS,
  HTTP_PUBLIC_TOKEN_EVENTS
} = require('../mother/utils/meltdownHttpPolicy');

function testContract(timeoutMs = 100) {
  return defineEventContract({
    eventName: 'example.request',
    description: 'Focused event contract test.',
    timeoutMs,
    payloadSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', minLength: 1 } },
      additionalProperties: false
    },
    resultSchema: {
      type: 'object',
      required: ['ok'],
      properties: { ok: { type: 'boolean' } },
      additionalProperties: false
    }
  });
}

test('contract definitions reject the unbounded any schema', () => {
  assert.throws(
    () => defineEventContract({
      eventName: 'example.any',
      payloadSchema: { type: 'object' },
      resultSchema: { type: 'any' }
    }),
    /EVENT_CONTRACT_DEFINITION_INVALID: example\.any cannot use the unbounded any schema/
  );
});

test('event contracts reject invalid payloads before dispatch with a stable error code', async () => {
  const emitter = new EventEmitter();
  let dispatched = false;
  emitter.on('example.request', () => {
    dispatched = true;
  });

  await assert.rejects(
    () => requestEvent(emitter, testContract(), { id: '' }),
    error => {
      assert.strictEqual(error.code, EVENT_CONTRACT_ERROR_CODES.INVALID_PAYLOAD);
      assert.strictEqual(error.status, 400);
      assert.strictEqual(error.details.path, '$.id');
      return true;
    }
  );
  assert.strictEqual(dispatched, false);
});

test('registered contract handlers validate result schemas for legacy callback callers', async () => {
  const emitter = new EventEmitter();
  const contract = testContract();
  registerEventContractHandler(emitter, contract, async payload => ({ ok: payload.id }));

  const result = await new Promise(resolve => {
    emitter.emit(contract.eventName, { id: 'request-1' }, (error, data) => resolve({ error, data }));
  });

  assert(result.error);
  assert.strictEqual(result.error.code, EVENT_CONTRACT_ERROR_CODES.INVALID_RESULT);
  assert.strictEqual(result.error.details.path, '$.ok');
  assert.strictEqual(result.data, undefined);
});

test('requestEvent rejects missing listeners and stalled callbacks deterministically', async () => {
  const contract = testContract(15);
  const missingEmitter = new EventEmitter();

  await assert.rejects(
    () => requestEvent(missingEmitter, contract, { id: 'missing' }),
    error => error.code === EVENT_CONTRACT_ERROR_CODES.NOT_REGISTERED && error.status === 404
  );

  const stalledEmitter = {
    listenerCount: () => 1,
    emit: () => true
  };
  await assert.rejects(
    () => requestEvent(stalledEmitter, contract, { id: 'slow' }),
    error => (
      error.code === EVENT_CONTRACT_ERROR_CODES.TIMEOUT &&
      error.status === 504 &&
      error.details.timeoutMs === 15
    )
  );
});

test('requestEvent preserves existing searchable handler codes and serializes HTTP-safe fields', async () => {
  const emitter = new EventEmitter();
  const contract = testContract();
  emitter.on(contract.eventName, (_payload, callback) => {
    const error = new Error('Permission missing');
    error.code = 'EXAMPLE_PERMISSION_DENIED';
    error.status = 403;
    callback(error);
  });

  const error = await requestEvent(emitter, contract, { id: 'request-1' }).catch(caught => caught);
  assert.strictEqual(error.code, 'EXAMPLE_PERMISSION_DENIED');
  assert.strictEqual(error.status, 403);
  assert.deepStrictEqual(serializeEventContractError(error, contract), {
    error: 'Permission missing',
    code: 'EXAMPLE_PERMISSION_DENIED'
  });
});

test('requestEvent preserves a searchable code embedded in a legacy handler message', async () => {
  const emitter = new EventEmitter();
  const contract = testContract();
  emitter.on(contract.eventName, (_payload, callback) => {
    callback(new Error('EXAMPLE_ALREADY_USED: The one-time value was already consumed.'));
  });

  const error = await requestEvent(emitter, contract, { id: 'request-1' }).catch(caught => caught);
  assert.strictEqual(error.code, 'EXAMPLE_ALREADY_USED');
  assert.strictEqual(error.message, 'EXAMPLE_ALREADY_USED: The one-time value was already consumed.');
});

test('HTTP error serialization allowlists details and removes nested secrets', () => {
  const contract = testContract();
  const error = new Error('Validation failed');
  error.code = 'EXAMPLE_VALIDATION_FAILED';
  error.details = {
    path: '$.profile.email',
    expected: 'email',
    jwt: 'do-not-expose',
    issues: [{ field: 'email', reason: 'invalid', password: 'do-not-expose' }],
    internalDebug: 'do-not-expose'
  };

  assert.deepStrictEqual(serializeEventContractError(error, contract), {
    error: 'Validation failed',
    code: 'EXAMPLE_VALIDATION_FAILED',
    details: {
      path: '$.profile.email',
      expected: 'email',
      issues: [{ field: 'email', reason: 'invalid' }]
    }
  });
});

test('json schemas reject non-transport values and validate additional properties', () => {
  const contract = defineEventContract({
    eventName: 'example.json',
    payloadSchema: {
      type: 'object',
      required: ['moduleName'],
      properties: { moduleName: { type: 'string', minLength: 1 } },
      additionalProperties: { type: 'json' }
    },
    resultSchema: { anyOf: [{ type: 'json' }, { type: 'undefined' }] }
  });

  assert.deepStrictEqual(assertSchema(contract, 'payload', {
    moduleName: 'testModule',
    nested: { values: [1, true, null] }
  }), {
    moduleName: 'testModule',
    nested: { values: [1, true, null] }
  });
  assert.strictEqual(assertSchema(contract, 'result', undefined), undefined);
  assert.throws(
    () => assertSchema(contract, 'payload', { moduleName: 'testModule', handler: () => {} }),
    error => error.code === EVENT_CONTRACT_ERROR_CODES.INVALID_PAYLOAD && error.details.path === '$.handler'
  );
});

test('HTTP event policy is derived from the executable backend contract registry', () => {
  assert.deepStrictEqual(
    [...HTTP_DIRECT_CONTRACT_EVENTS].sort(),
    HTTP_DIRECT_EVENT_CONTRACTS.map(contract => contract.eventName).sort()
  );
  assert.deepStrictEqual([...HTTP_PUBLIC_EVENTS].sort(), ['ensurePublicToken', 'issuePublicToken']);
  assert.deepStrictEqual([...HTTP_PUBLIC_TOKEN_EVENTS], ['cmsPublicRuntimeRequest']);
  for (const eventName of HTTP_DIRECT_CONTRACT_EVENTS) {
    assert.strictEqual(getHttpEventContract(eventName)?.eventName, eventName);
  }
});

test('canonical facade contracts document payload and result requirements', () => {
  const contract = BACKEND_EVENT_CONTRACTS.CMS_ADMIN_API_REQUEST;
  assert.deepStrictEqual(contract.payloadSchema.required, [
    'jwt',
    'moduleName',
    'moduleType',
    'resource',
    'action'
  ]);
  assert.deepStrictEqual(contract.resultSchema.required, ['resource', 'action', 'eventName', 'data']);
  assert.strictEqual(contract.timeoutMs, 305_000);
  assert.strictEqual(contract.resultType, 'CmsAdminApiRequestResult');
});
