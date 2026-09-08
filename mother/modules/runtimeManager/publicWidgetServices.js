"use strict";
const { requestBackendEvent } = require('../../contracts/backendEventContracts');
const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

// Settings Manager remains the sole configuration owner. Never expose raw settings or credentials.
function projectWidgetPolicy(value, widgetId) {
  const config = typeof value === 'string' ? JSON.parse(value) : value;
  if (!config) return { operations: {}, draft: false };
  if (config.version !== 1 || !config.widgets || typeof config.widgets !== 'object') throw new Error('WIDGET_SERVICE_POLICY_INVALID');
  const policy = Object.hasOwn(config.widgets, widgetId) ? config.widgets[widgetId] : {};
  const operations = {};
  for (const [name, op] of Object.entries(policy.operations || {})) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,59}$/.test(name) || !op || !['GET', 'POST'].includes(op.method)
      || typeof op.path !== 'string' || !/^\/api\/[a-zA-Z0-9_/{}/-]+$/.test(op.path)
      || /^\/api\/(?:admin|internal|meltdown)(?:\/|$)/.test(op.path)
      || (op.stream && op.method !== 'GET')
      || (op.query && (!Array.isArray(op.query) || op.query.length > 20 || op.query.some(key => !/^[a-zA-Z][a-zA-Z0-9_-]{0,59}$/.test(key))))) throw new Error('WIDGET_SERVICE_POLICY_INVALID');
    operations[name] = { path: op.path, method: op.method, query: op.query || [], stream: op.stream === true, credentials: op.credentials === true };
  }
  if (Object.keys(operations).length > 20) throw new Error('WIDGET_SERVICE_POLICY_INVALID');
  const preferences = {};
  for (const [name, spec] of Object.entries(policy.preferences || {})) {
    if (!['locale', 'theme'].includes(name) || !spec || !['locale', 'theme', 'workspace-theme'].includes(spec.cookie)
      || !Array.isArray(spec.values) || spec.values.length > 20 || spec.values.some(value => typeof value !== 'string' || !/^[a-zA-Z-]{1,20}$/.test(value))) throw new Error('WIDGET_SERVICE_POLICY_INVALID');
    preferences[name] = { cookie: spec.cookie, values: spec.values };
  }
  return { operations, preferences, draft: policy.draft === true };
}
function registerPublicWidgetServices(app, motherEmitter, jwt) {
  app.get('/api/public/widget-services/:widgetId', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(req.params.widgetId)) return res.status(400).json({ error: 'WIDGET_SERVICE_ID_INVALID' });
    try {
      const value = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_SETTING, {
        jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'PUBLIC_WIDGET_SERVICES'
      });
      return res.json(projectWidgetPolicy(value, req.params.widgetId));
    } catch {
      return res.status(503).json({ error: 'WIDGET_SERVICE_POLICY_UNAVAILABLE' });
    }
  });
}
module.exports = { projectWidgetPolicy, registerPublicWidgetServices };
