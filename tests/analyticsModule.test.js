jest.mock('../mother/contracts/backendEventContracts', () => ({ requestBackendEvent: jest.fn() }));
const { requestBackendEvent } = require('../mother/contracts/backendEventContracts');
const { initialize } = require('../mother/modules/analyticsManager');
const collector = require('../mother/modules/analyticsManager/collector');

test('module rejects missing/public principals and preserves queue through storage failures', async () => {
  const handlers = new Map(); const stored = new Map(); let fail = false;
  requestBackendEvent.mockImplementation(async (_emitter, _event, payload) => {
    const op = payload.data?.rawSQL;
    if (op === 'APPEND_ANALYTICS') {
      if (fail) throw new Error('db unavailable');
      payload.data.params.records.forEach(row => stored.set(row.id, row));
    }
    if (op === 'READ_ANALYTICS') return [...stored.values()];
    return {};
  });
  const runtime = await initialize({ motherEmitter: { registerModuleType() {}, on: (name, handler) => handlers.set(name, handler) }, jwt: 'module-token', isCore: true });
  const handler = handlers.get('analyticsSummary');
  const call = request => new Promise(resolve => handler(request, (error, result) => resolve({ error, result })));
  try {
    expect((await call({})).error.message).toBe('ANALYTICS_FORBIDDEN');
    expect((await call({ decodedJWT: { isPublic: true, permissions: { '*': true } } })).error.message).toBe('ANALYTICS_FORBIDDEN');
    const principal = { permissions: { analytics: { read: true } } };
    expect((await call({ decodedJWT: principal, days: 90 })).error.message).toBe('ANALYTICS_INVALID_PERIOD');
    collector.record({ kind: 'system', event: 'save' }); fail = true; await runtime.flush();
    expect(collector.health().queued).toBeGreaterThan(0);
    fail = false;
    stored.set('legacy-storage', { kind: 'system', event: 'dbSelect', at: new Date().toISOString() });
    const result = await call({ decodedJWT: principal, days: 7 });
    expect(result.error).toBeNull(); expect(result.result.system).toBe(1);
    expect(result.result.health.lastError).toBeNull();
  } finally { await runtime.shutdown(); }
});
