/** @jest-environment jsdom */
import { configureWidgetServices, mergeWidgetServiceConfiguration, parseWidgetServiceConfiguration } from '../ui/shared/module-access/widgetServiceConfiguration';
import { emitRuntimeAdmin } from '../ui/shared/api-client/runtimeFacade';
jest.mock('../ui/shared/api-client/runtimeFacade', () => ({ emitRuntimeAdmin: jest.fn() }));
const incoming = { version: 1, widgets: { help: { operations: { search: { path: '/api/public/search', method: 'GET', query: ['q', 'lang'] } }, draft: true, preferences: { locale: { cookie: 'locale', values: ['en', 'zh'] } } } } };

test('accepts bounded operator destinations, with explicit user-session streams', () => {
  expect(parseWidgetServiceConfiguration(JSON.stringify(incoming))).toEqual(incoming);
  const streamed = JSON.parse(JSON.stringify(incoming));
  streamed.widgets.help.operations.replies = { method: 'GET', path: '/api/support/events', stream: true, credentials: true };
  expect(parseWidgetServiceConfiguration(JSON.stringify(streamed))).toEqual(streamed);
});

test.each([
  { packageAccess: { approvedAccess: ['operation:search'] } },
  { operations: { search: { method: 'GET', path: 'https://example.com/api/search' } } },
  { operations: { search: { method: 'GET', path: '/api/admin/users' } } },
  { operations: { search: { method: 'GET', path: '/api/meltdown' } } },
  { operations: { replies: { method: 'POST', path: '/api/events', stream: true } } },
  { preferences: { locale: { cookie: 'admin_jwt', values: ['en'] } } },
])('rejects trust metadata, privileged destinations and unsupported preferences', policy => {
  expect(() => parseWidgetServiceConfiguration(JSON.stringify({ version: 1, widgets: { help: policy } }))).toThrow('WIDGET_SERVICE_CONFIG_INVALID');
});

test('rejects inherited property names without accepting them as widget or operation IDs', () => {
  expect(() => parseWidgetServiceConfiguration('{"version":1,"widgets":{"__proto__":{}}}')).toThrow('WIDGET_SERVICE_CONFIG_INVALID');
  expect(() => parseWidgetServiceConfiguration('{"version":1,"widgets":{"help":{"operations":{"constructor":{"method":"GET","path":"/api/search"}}}}}')).toThrow('WIDGET_SERVICE_CONFIG_INVALID');
});

test('merging destinations preserves installed receipts, grants and other widgets', () => {
  const current = { version: 1, widgets: { help: { packageAccess: { hash: 'reviewed', approvedAccess: [] } }, other: { draft: false } } };
  const merged = mergeWidgetServiceConfiguration(JSON.stringify(current), incoming);
  expect(merged.widgets.help.packageAccess).toEqual(current.widgets.help.packageAccess);
  expect(merged.widgets.other).toEqual(current.widgets.other);
  expect(current.widgets.help).not.toHaveProperty('operations');
});

test('uses authenticated Settings read/write, scalar JSON storage and propagates denied access', async () => {
  window.meltdownEmit = jest.fn();
  const call = jest.mocked(emitRuntimeAdmin);
  call.mockResolvedValueOnce(null).mockResolvedValueOnce({ saved: true });
  await configureWidgetServices(JSON.stringify(incoming));
  expect(call).toHaveBeenLastCalledWith(window.meltdownEmit, window.ADMIN_TOKEN, 'settings', 'set', { key: 'PUBLIC_WIDGET_SERVICES', value: JSON.stringify(incoming) });
  call.mockReset().mockRejectedValueOnce(new Error('Forbidden'));
  await expect(configureWidgetServices(JSON.stringify(incoming))).rejects.toThrow('Forbidden');
  expect(call).toHaveBeenCalledTimes(1);
});
