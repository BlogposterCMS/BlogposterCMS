import { emitRuntimeAdmin } from '../api-client/runtimeFacade.js';

type JsonObject = Record<string, any>;
const settingKey = 'PUBLIC_WIDGET_SERVICES';
const namePattern = /^[a-zA-Z][a-zA-Z0-9_-]{0,59}$/;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
function invalid(message: string): never { throw new Error(`WIDGET_SERVICE_CONFIG_INVALID: ${message}`); }
function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected an object.');
  return value as JsonObject;
}
function keys(value: JsonObject, allowed: string[]): void {
  if (Object.keys(value).some(key => forbiddenKeys.has(key) || !allowed.includes(key))) invalid('Unknown configuration field.');
}

/** Import only destination descriptors. Installer receipts and grants are never importable. */
export function parseWidgetServiceConfiguration(text: string): JsonObject {
  if (text.length > 128 * 1024) invalid('Maximum configuration size is 128 KiB.');
  let parsed: JsonObject;
  try { parsed = object(JSON.parse(text)); } catch { invalid('Choose a valid JSON configuration.'); }
  keys(parsed, ['version', 'widgets']);
  if (parsed.version !== 1) invalid('Expected version 1.');
  const widgets = object(parsed.widgets);
  if (!Object.keys(widgets).length || Object.keys(widgets).length > 50) invalid('Choose between 1 and 50 widgets.');
  for (const [id, raw] of Object.entries(widgets)) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || forbiddenKeys.has(id)) invalid('Invalid widget ID.');
    const policy = object(raw); keys(policy, ['operations', 'draft', 'preferences']);
    if (policy.draft !== undefined && typeof policy.draft !== 'boolean') invalid('Draft must be a boolean.');
    const operations = object(policy.operations || {});
    if (Object.keys(operations).length > 20) invalid('Maximum 20 operations per widget.');
    for (const [name, rawOperation] of Object.entries(operations)) {
      if (!namePattern.test(name) || forbiddenKeys.has(name)) invalid('Invalid operation name.');
      const op = object(rawOperation); keys(op, ['path', 'method', 'query', 'stream', 'credentials']);
      if (!['GET', 'POST'].includes(op.method) || typeof op.path !== 'string'
        || !/^\/api\/[a-zA-Z0-9_/{}/-]+$/.test(op.path)
        || /^\/api\/(?:admin|internal|meltdown)(?:\/|$)/.test(op.path)) invalid('Use a supported same-origin public/application API path.');
      if (op.query !== undefined && (!Array.isArray(op.query) || op.query.length > 20
        || op.query.some((key: unknown) => typeof key !== 'string' || !namePattern.test(key) || forbiddenKeys.has(key)))) invalid('Invalid query keys.');
      for (const flag of ['stream', 'credentials']) if (op[flag] !== undefined && typeof op[flag] !== 'boolean') invalid(`${flag} must be a boolean.`);
      if (op.stream && (op.method !== 'GET' || op.credentials !== true)) invalid('Streams require GET and the current user session.');
    }
    const preferences = object(policy.preferences || {}); keys(preferences, ['locale', 'theme']);
    for (const rawPreference of Object.values(preferences)) {
      const spec = object(rawPreference); keys(spec, ['cookie', 'values']);
      if (!['locale', 'theme', 'workspace-theme'].includes(spec.cookie) || !Array.isArray(spec.values)
        || !spec.values.length || spec.values.length > 20
        || spec.values.some((value: unknown) => typeof value !== 'string' || !/^[a-zA-Z-]{1,20}$/.test(value))) invalid('Use supported preference cookies and values.');
    }
  }
  return parsed;
}

export function mergeWidgetServiceConfiguration(current: unknown, incoming: JsonObject): JsonObject {
  const existing = typeof current === 'string' ? JSON.parse(current) : current;
  const config = existing == null ? { version: 1, widgets: {} } : object(existing);
  if (config.version !== 1) invalid('Existing configuration needs operator review.');
  const widgets = { ...object(config.widgets) };
  for (const [id, raw] of Object.entries(incoming.widgets)) {
    // Keep packageAccess and all unrelated widgets exactly as Settings currently stores them.
    widgets[id] = { ...(widgets[id] || {}), ...raw as JsonObject };
  }
  return { ...config, widgets };
}

export async function configureWidgetServices(text: string): Promise<void> {
  const incoming = parseWidgetServiceConfiguration(text);
  if (!window.meltdownEmit) throw new Error('WIDGET_SERVICE_CONFIG_BRIDGE_MISSING');
  const current = await emitRuntimeAdmin(window.meltdownEmit, window.ADMIN_TOKEN, 'settings', 'get', { key: settingKey });
  const merged = mergeWidgetServiceConfiguration(current, incoming);
  // Read just before writing; never save a stale configuration captured during file selection.
  await emitRuntimeAdmin(window.meltdownEmit, window.ADMIN_TOKEN, 'settings', 'set', { key: settingKey, value: JSON.stringify(merged) });
}
