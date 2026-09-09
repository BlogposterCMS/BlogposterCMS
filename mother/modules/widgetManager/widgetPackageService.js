'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { requestBackendEvent } = require('../../contracts/backendEventContracts');
const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');
const { packageError, packageHash, assertPackageReview, validateArchiveLimits } = require('../../utils/extensionPackage');
const { normalizeWidgetAccess, approveWidgetAccess } = require('./widgetPackageAccess');
const { projectWidgetPolicy } = require('../runtimeManager/publicWidgetServices');
const ROOT = path.resolve(__dirname, '../../../widgets');
const TEMP = path.resolve(__dirname, '../../../temp_uploads');
let busy = false;

async function readPolicies(emitter, jwt) {
  const value = await requestBackendEvent(emitter, BACKEND_EVENTS.GET_SETTING, { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'PUBLIC_WIDGET_SERVICES' });
  const config = typeof value === 'string' ? JSON.parse(value) : value;
  if (!config) return { version: 1, widgets: {} };
  if (config.version !== 1 || !config.widgets || Array.isArray(config.widgets)) throw packageError('WIDGET_SERVICE_POLICY_INVALID', 'Invalid widget service configuration.');
  return config;
}

async function writePolicies(emitter, jwt, value) {
  await requestBackendEvent(emitter, BACKEND_EVENTS.SET_SETTING, { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'PUBLIC_WIDGET_SERVICES', value });
}

function stagePackage(buffer, options = {}) {
  const reviewedHash = packageHash(buffer);
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  validateArchiveLimits(entries);
  const manifests = entries.filter(entry => /(^|\/)widgetInfo\.json$/.test(entry.entryName));
  if (manifests.length !== 1 || !/^[A-Za-z0-9_-]{1,80}\/widgetInfo\.json$/.test(manifests[0].entryName)) {
    throw packageError('WIDGET_PACKAGE_MANIFEST', 'ZIP must contain one widget folder with widgetInfo.json.');
  }
  const folder = manifests[0].entryName.split('/')[0];
  if (entries.some(entry => !entry.entryName.startsWith(`${folder}/`))) throw packageError('WIDGET_PACKAGE_ROOT', 'All files must belong to the widget folder.');
  const info = JSON.parse(manifests[0].getData().toString('utf8'));
  const validators = require('./index')._internals;
  const widget = validators.normalizeCommunityWidgetInfo(info, folder);
  const requestedAccess = normalizeWidgetAccess(info);
  if (!info.version || typeof info.version !== 'string') throw packageError('WIDGET_PACKAGE_VERSION', 'A widget version is required.');
  const tempRoot = options.tempRoot || TEMP;
  fs.mkdirSync(tempRoot, { recursive: true });
  const staged = fs.mkdtempSync(path.join(tempRoot, 'widget-'));
  try {
    zip.extractAllTo(staged, false);
    const dir = path.join(staged, folder);
    validators.assertCommunityWidgetFolderShape(dir, folder);
    if (!fs.existsSync(path.join(dir, 'widget.js'))) throw packageError('WIDGET_PACKAGE_ENTRY', 'widget.js is required.');
    require('./widgetSandboxSource').validateWidgetSandboxSource(fs.readFileSync(path.join(dir, 'widget.js'), 'utf8'));
    validators.assertCommunityWidgetScriptsAllowed(dir, folder);
    const report = validators.validateCommunityWidgetDesignContract(dir, folder);
    const codeHash = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(dir, 'widget.js'))).digest('hex');
    return { staged, dir, widget, info: { ...widget, codeHash, version: info.version, developer: String(info.developer || ''), description: String(info.description || '') }, requestedAccess, reviewedHash, warnings: report.warnings || [] };
  } catch (err) { fs.rmSync(staged, { recursive: true, force: true }); throw err; }
}

function inspectionOf(prepared, config) {
  const id = prepared.widget.widgetId;
  // Inspection shows operator-configured availability, never the old package's
  // grant intersection. This projection grants no live access and is not saved.
  const policy = projectWidgetPolicy({ ...config, widgets: { ...config.widgets, [id]: {
    ...config.widgets[id], packageAccess: { policyVersion: 1, requestedAccess: prepared.requestedAccess,
      approvedAccess: prepared.requestedAccess.map(item => `${item.service}:${item.name}`) }
  } } }, id);
  return { ...prepared.info, reviewedHash: prepared.reviewedHash, warnings: prepared.warnings,
    requestedAccess: prepared.requestedAccess.map(item => ({ ...item,
      available: item.service === 'operation' ? !!policy.operations[item.name] : item.service === 'draft' ? policy.draft : !!policy.preferences?.[item.name],
      // Descriptions of configured operations come from operator policy, not the ZIP.
      operation: item.service === 'operation' ? policy.operations[item.name] : undefined
    })) };
}

async function inspectWidgetPackage(emitter, jwt, buffer, options = {}) {
  const prepared = stagePackage(buffer, options);
  try { return { ...inspectionOf(prepared, await readPolicies(emitter, jwt)), replacing: fs.existsSync(path.join(options.widgetsRoot || ROOT, prepared.widget.widgetId)) }; }
  finally { fs.rmSync(prepared.staged, { recursive: true, force: true }); }
}

async function installWidgetPackage(emitter, jwt, buffer, params, options = {}) {
  assertPackageReview(buffer, params.reviewedHash);
  if (busy) throw packageError('WIDGET_PACKAGE_BUSY', 'Another widget package operation is running.');
  busy = true;
  let prepared, target, oldPolicy, policyWritten = false, files;
  try {
    prepared = stagePackage(buffer, options);
    const id = prepared.widget.widgetId;
    const root = options.widgetsRoot || ROOT;
    fs.mkdirSync(root, { recursive: true });
    target = path.join(root, id);
    const replacing = fs.existsSync(target);
    require('../../security/runtimeIntegrity').assertExtensionInstallerOwnership('widgets', id);
    if (replacing) {
      if (params.replaceExisting !== true) throw packageError('WIDGET_PACKAGE_EXISTS', 'Review and confirm replacement of this existing widget.');
      if (!require('../userManagement/permissionUtils').hasPermission(params.decodedJWT, 'widgets.update')) throw packageError('WIDGET_PACKAGE_PERMISSION', 'Replacing a widget requires widgets.update.');
      const widgets = await requestBackendEvent(emitter, BACKEND_EVENTS.GET_WIDGETS, {jwt,moduleName:'widgetManager',moduleType:'core',widgetType:'public'});
      if (!widgets?.some(widget => widget.widgetId === id && widget.content === `/widgets/${id}/widget.js`)) throw packageError('WIDGET_PACKAGE_ID_CONFLICT', 'Existing widget is not owned by this package path.');
    }
    const config = await readPolicies(emitter, jwt);
    const inspection = inspectionOf(prepared, config);
    const approved = approveWidgetAccess(prepared.requestedAccess, params.approvedAccess);
    if (inspection.requestedAccess.some(item => !item.available && approved.includes(`${item.service}:${item.name}`))) throw packageError('WIDGET_SERVICE_UNCONFIGURED', 'An approved service is not configured by the site operator.');
    oldPolicy = config.widgets[id];
    files = require('./widgetPackageFiles').stageWidgetFiles(root, id, prepared.dir, replacing, oldPolicy);
    config.widgets[id] = { ...(oldPolicy || {}), packageAccess: { policyVersion: 1, ...prepared.info, requestedAccess: prepared.requestedAccess, approvedAccess: approved, hash: prepared.reviewedHash } };
    // Record consent before exposing files. A collision never overwrites a core widget.
    await writePolicies(emitter, jwt, config);
    policyWritten = true;
    files.expose();
    require('../../security/extensionIntegrity').saveExtensionReceipt(path.dirname(root), 'widgets', id, target, prepared.reviewedHash);
    if (!replacing) {
      const result = await requestBackendEvent(emitter, BACKEND_EVENTS.CREATE_WIDGET, { jwt, moduleName: 'widgetManager', moduleType: 'core', ...prepared.widget, content: `/widgets/${id}/widget.js` });
      if (!result?.created) throw packageError('WIDGET_PACKAGE_ID_CONFLICT', 'A widget with this ID already exists.');
    }
    const backup = files.commit();
    return { installed: true, replaced: replacing, widgetId: id, backup };
  } catch (err) {
    if (files) files.rollback();
    if (policyWritten) {
      try {
        const config = await readPolicies(emitter, jwt);
        if (oldPolicy === undefined) delete config.widgets[prepared.widget.widgetId];
        else config.widgets[prepared.widget.widgetId] = oldPolicy;
        await writePolicies(emitter, jwt, config);
      } catch (rollback) { throw packageError('WIDGET_PACKAGE_ROLLBACK_FAILED', `${err.message}; ${rollback.message}`); }
    }
    throw err;
  } finally {
    if (prepared) fs.rmSync(prepared.staged, { recursive: true, force: true });
    busy = false;
  }
}

async function listWidgetPackages(emitter, jwt) {
  const config = await readPolicies(emitter, jwt);
  return Object.values(config.widgets).filter(policy => policy?.packageAccess?.policyVersion === 1).map(policy => policy.packageAccess);
}

async function setWidgetPackageAccess(emitter, jwt, params) {
  if (busy) throw packageError('WIDGET_PACKAGE_BUSY', 'Another widget package operation is running.');
  busy = true;
  try {
    const config = await readPolicies(emitter, jwt);
    const policy = Object.hasOwn(config.widgets, params.widgetId) ? config.widgets[params.widgetId] : null;
    if (!policy?.packageAccess) throw packageError('WIDGET_PACKAGE_MISSING', 'Installed widget package not found.');
    const requested = normalizeWidgetAccess(policy.packageAccess);
    policy.packageAccess.approvedAccess = approveWidgetAccess(requested, params.approvedAccess);
    await writePolicies(emitter, jwt, config);
    return { saved: true };
  } finally { busy = false; }
}

module.exports = { inspectWidgetPackage, installWidgetPackage, listWidgetPackages, setWidgetPackageAccess, _internals: { stagePackage } };
