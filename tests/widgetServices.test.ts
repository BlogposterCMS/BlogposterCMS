/** @jest-environment jsdom */
import { createWidgetServices, loadWidgetServices } from '../ui/widgets/rendering/widgetServices';
const { projectWidgetPolicy } = require('../mother/modules/runtimeManager/publicWidgetServices');
const response = () => ({ ok: true, headers: { get: () => 'application/json' }, body: { getReader: () => { let read = false; return { read: async () => read ? { done: true } : (read = true, { done: false, value: new Uint8Array([123,125]) }) }; } } });
beforeEach(() => { window.sessionStorage.clear(); (window as any).fetch = jest.fn(async () => response()); });

test('managed services recheck revoked grants before dispatch and fail closed on refresh failure', async () => {
  const refresh = jest.fn(async () => ({ operations: {} }));
  const services = createWidgetServices('sample', { managed: true, operations: { search: { method: 'GET', path: '/api/public/search' } } }, window, false, refresh);
  try {
    await expect(services.request('search')).rejects.toThrow('WIDGET_SERVICE_DENIED');
    expect(window.fetch).not.toHaveBeenCalled();
    refresh.mockRejectedValueOnce(new Error('WIDGET_SERVICE_POLICY_UNAVAILABLE'));
    await expect(services.request('search')).rejects.toThrow('WIDGET_SERVICE_POLICY_UNAVAILABLE');
    expect(window.fetch).not.toHaveBeenCalled();
  } finally { services.dispose(); }
});
test('missing grants deny requests and draft storage', async () => {
  const services = createWidgetServices('example', {});
  await expect(services.request('send')).rejects.toThrow('WIDGET_SERVICE_DENIED');
  expect(() => services.draft.set('text')).toThrow('WIDGET_SERVICE_DRAFT_DENIED');
  expect(window.fetch).not.toHaveBeenCalled();
});
test('named requests cannot change destination, verb, headers or tenant authority', async () => {
  const services = createWidgetServices('example', { operations: { send: { path: '/api/support/{id}/messages', method: 'POST', credentials: true } } });
  // Abort before fetching exercises route validation without depending on browser streams in jsdom.
  await expect(services.request('send', { params: { id: '../admin' } })).rejects.toThrow('WIDGET_SERVICE_PARAM_INVALID');
  await expect(services.request('send', { params: { id: 1 }, query: { target: 'foreign' } })).rejects.toThrow('WIDGET_SERVICE_QUERY_DENIED');
  await expect(services.request('send', { params: { id: 1 }, body: 'x'.repeat(20000) })).rejects.toThrow('WIDGET_SERVICE_BODY_LIMIT');
  expect(window.fetch).not.toHaveBeenCalled();
});
test('drafts are isolated by widget and bounded', () => {
  const first = createWidgetServices('first', { draft: true });
  const second = createWidgetServices('second', { draft: true });
  first.draft.set('unsent question');
  expect(first.draft.get()).toBe('unsent question');
  expect(second.draft.get()).toBeNull();
  expect(() => first.draft.set('x'.repeat(16385))).toThrow('WIDGET_SERVICE_DRAFT_DENIED');
});
test('public projection excludes secrets and other widget policies', () => {
  const policy = projectWidgetPolicy({ version: 1, widgets: { example: { secret: 'private', operations: { search: { path: '/api/public/search', method: 'GET', token: 'private' } } }, other: { draft: true } } }, 'example');
  expect(JSON.stringify(policy)).not.toContain('private');
  expect(policy.operations.search).toEqual({ path: '/api/public/search', method: 'GET', query: [], stream: false, credentials: false });
});
test.each(['https://example.test/api/x', '/api/../admin', '/api/meltdown', '/api/internal/x'])('operator configuration rejects unsafe path %s', path => {
  expect(() => projectWidgetPolicy({ version: 1, widgets: { example: { operations: { read: { path, method: 'GET' } } } } }, 'example')).toThrow('WIDGET_SERVICE_POLICY_INVALID');
});
test('preferences cannot expose arbitrary authentication cookies', () => {
  expect(() => projectWidgetPolicy({ version: 1, widgets: { example: { preferences: { locale: { cookie: 'session', values: ['x'] } } } } }, 'example')).toThrow('WIDGET_SERVICE_POLICY_INVALID');
});

test('successful request uses the declared method and never accepts custom credentials', async () => {
  (globalThis as any).TextDecoder = require('util').TextDecoder;
  const services = createWidgetServices('example', { operations: { send: { path: '/api/support/{id}/messages', method: 'POST', credentials: true } } });
  await expect(services.request('send', { params: { id: 7 }, body: { message: 'Question' } })).resolves.toEqual({});
  expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/support/7/messages'), expect.objectContaining({ method: 'POST', credentials: 'same-origin', redirect: 'error', body: '{"message":"Question"}' }));
});
test('streams are bounded, deny undeclared actions and dispose their resources', () => {
  const close = jest.fn();
  (window as any).EventSource = jest.fn(() => ({ close, addEventListener: jest.fn() }));
  const services = createWidgetServices('example', { operations: { replies: { path: '/api/support/events', method: 'GET', stream: true, credentials: true } } });
  services.subscribe('replies', 'reply', jest.fn(), jest.fn());
  expect(() => services.subscribe('replies', 'reply', jest.fn(), jest.fn())).toThrow('WIDGET_SERVICE_STREAM_DENIED');
  services.dispose();
  expect(close).toHaveBeenCalledTimes(1);
});


test('opaque-origin Designer preview uses ephemeral drafts without network or cookies', async () => {
 const services = await loadWidgetServices('example', true);
 services.draft.set('Preview text');
 expect(services.draft.get()).toBe('Preview text');
 expect(services.preferences.get('locale')).toBe('');
 await expect(services.request('send')).rejects.toThrow('WIDGET_SERVICE_DENIED');
 expect(window.fetch).not.toHaveBeenCalled();
});
