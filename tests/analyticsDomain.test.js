const { normalizeRecord, clientDimensions, summarize } = require('../mother/modules/analyticsManager/domain');
const collector = require('../mother/modules/analyticsManager/collector');

test('analytics retains only bounded, explicit metadata', () => {
  const row = normalizeRecord({ kind: 'system', event: 'x'.repeat(300), jwt: 'secret', password: 'private', data: { secret: true }, durationMs: -3 }, 0);
  expect(row.event).toHaveLength(120);
  expect(row.durationMs).toBe(0);
  expect(JSON.stringify(row)).not.toMatch(/secret|private|password|jwt/);
  expect(() => normalizeRecord({ kind: 'unknown' })).toThrow('ANALYTICS_INVALID_KIND');
});

test('period boundaries, previous counts and dimensions separate page and system activity', () => {
  const now = Date.UTC(2026, 8, 7);
  const rows = [
    normalizeRecord({ kind: 'page', device: 'mobile', page: '3' }, now - 100),
    normalizeRecord({ kind: 'system', event: 'save', outcome: 'error' }, now - 200),
    normalizeRecord({ kind: 'page' }, now - 86400001),
    normalizeRecord({ kind: 'page' }, now + 1)
  ];
  const result = summarize(rows, 1, now);
  expect(result).toMatchObject({ pages: 1, system: 1, errors: 1, previous: { pages: 1, system: 0 } });
  expect(result.tables.device).toEqual([{ name: 'mobile', count: 1 }]);
  expect(result.tables.event).toEqual([{ name: 'save', count: 1 }]);
  expect(() => summarize(rows, 365, now)).toThrow('ANALYTICS_INVALID_PERIOD');
});

test('client metadata drops referrer path, credentials and query', () => {
  expect(clientDimensions('Mozilla Windows Chrome/120 Edg/120', 'https://user:pass@example.com/private?token=secret')).toEqual({ device: 'desktop', browser: 'Edge', os: 'Windows', source: 'example.com' });
  expect(clientDimensions('Googlebot', '')).toMatchObject({ device: 'bot', source: 'direct' });
});

test('queue is bounded and retry records keep IDs', () => {
  collector.take(); collector.setEnabled(true);
  for (let i = 0; i < 2001; i++) collector.record({ kind: 'system' });
  expect(collector.health()).toMatchObject({ queued: 2000, dropped: 1 });
  collector.take(); collector.restore([{ id: 'retry', kind: 'system' }]);
  expect(collector.take()[0].id).toBe('retry');
  collector.setEnabled(false);
});
