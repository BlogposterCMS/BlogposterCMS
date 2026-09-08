const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const AdmZip = require('adm-zip');
const { inspectWidgetPackage, installWidgetPackage, setWidgetPackageAccess } = require('../mother/modules/widgetManager/widgetPackageService');
const { projectWidgetPolicy } = require('../mother/modules/runtimeManager/publicWidgetServices');
const { assertPackageReview, packageHash, validateArchiveLimits } = require('../mother/utils/extensionPackage');
const { approvedRuntimeRecords, treeRecords } = require('../mother/security/extensionIntegrity');

class Host extends EventEmitter {
  constructor() { super(); this.config = { version: 1, widgets: { sample: { draft: true } } }; this.created = false; }
  emit(event, payload, callback) {
    if (event === 'getSetting') { callback(null, JSON.parse(JSON.stringify(this.config))); return true; }
    if (event === 'setSetting') { this.config = JSON.parse(JSON.stringify(payload.value)); callback(null, {}); return true; }
    if (event === 'createWidget') { callback(null, { created: !this.created }); this.created = true; return true; }
    return super.emit(event, payload, callback);
  }
}
function archive(extra = {}, info = {}) {
  const zip = new AdmZip();
  zip.addFile('sample/widgetInfo.json', Buffer.from(JSON.stringify({ widgetId: 'sample', widgetType: 'public', label: 'Sample', category: 'test', version: '1.0.0', requestedAccess: [{ service: 'draft', name: 'draft', reason: 'Keep unsent text' }], ...info })));
  zip.addFile('sample/widget.js', Buffer.from('export function render(root) { root.textContent = "Sample"; }'));
  for (const [name, content] of Object.entries(extra)) zip.addFile(name, Buffer.from(content));
  return zip.toBuffer();
}
let root, options, host;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-packages-')); options = { widgetsRoot: path.join(root, 'widgets'), tempRoot: path.join(root, 'tmp') }; host = new Host(); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('inspection executes no package code, reports configured capabilities and binds bytes', async () => {
  const zip = archive();
  const result = await inspectWidgetPackage(host, 'token', zip, options);
  expect(result.reviewedHash).toBe(packageHash(zip));
  expect(result.requestedAccess[0]).toMatchObject({ service: 'draft', available: true });
  expect(host.created).toBe(false);
  expect(fs.readdirSync(options.tempRoot)).toEqual([]);
  expect(() => assertPackageReview(archive({}, { version: '2' }), result.reviewedHash)).toThrow('EXTENSION_REVIEW_REQUIRED');
});

test('installation stores consent outside package and revocation removes public service grant', async () => {
  const zip = archive();
  await installWidgetPackage(host, 'token', zip, { reviewedHash: packageHash(zip), approvedAccess: ['draft:draft'] }, options);
  expect(fs.existsSync(path.join(options.widgetsRoot, 'sample/widget.js'))).toBe(true);
  expect(projectWidgetPolicy(host.config, 'sample').draft).toBe(true);
  expect(approvedRuntimeRecords(root, [])).toEqual(treeRecords(path.join(options.widgetsRoot, 'sample'), 'widgets/sample'));
  await setWidgetPackageAccess(host, 'token', { widgetId: 'sample', approvedAccess: [] });
  expect(projectWidgetPolicy(host.config, 'sample').draft).toBe(false);
  await expect(setWidgetPackageAccess(host, 'token', { widgetId: 'sample', approvedAccess: ['operation:deleteUsers'] })).rejects.toThrow('WIDGET_ACCESS_UNDECLARED');
});

test('an ID collision restores files, integrity receipt and prior operator configuration', async () => {
  host.created = true;
  const original = JSON.stringify(host.config);
  const zip = archive();
  await expect(installWidgetPackage(host, 'token', zip, { reviewedHash: packageHash(zip), approvedAccess: [] }, options)).rejects.toThrow('WIDGET_PACKAGE_ID_CONFLICT');
  expect(JSON.stringify(host.config)).toBe(original);
  expect(fs.existsSync(path.join(options.widgetsRoot, 'sample'))).toBe(false);
  expect(approvedRuntimeRecords(root, [])).toEqual([]);
});

test.each([
  [{ 'sample/moduleInfo.json': '{}' }, {}],
  [{ 'sample/node_modules/evil.js': 'evil' }, {}],
  [{ 'outside.txt': 'evil' }, {}],
  [{}, { requestedAccess: [{ service: 'operation', name: 'x', event: 'deleteUser', reason: 'lie' }] }],
  [{}, { widgetType: 'admin' }]
])('mixed or privilege-claiming widget packages are rejected', async (extra, info) => {
  await expect(inspectWidgetPackage(host, 'token', archive(extra, info), options)).rejects.toThrow();
  expect(host.created).toBe(false);
});

test('ZIP paths, duplicate names and expansion are bounded before extraction', () => {
  const entry = name => ({ entryName: name, header: { size: 1, attr: 0 } });
  expect(() => validateArchiveLimits([entry('a/../b')])).toThrow('EXTENSION_ARCHIVE_PATH');
  expect(() => validateArchiveLimits([entry('a/x'), entry('A/X')])).toThrow('EXTENSION_ARCHIVE_DUPLICATE');
  expect(() => validateArchiveLimits([{ entryName: 'a/x', header: { size: 100000000, attr: 0 } }])).toThrow('EXTENSION_ARCHIVE_LIMIT');
});

test('local approval receipts cannot override release-owned code', async () => {
  const zip = archive();
  await installWidgetPackage(host, 'token', zip, { reviewedHash: packageHash(zip), approvedAccess: [] }, options);
  expect(() => approvedRuntimeRecords(root, [{ path: 'widgets/sample/widget.js' }])).toThrow('EXTENSION_INTEGRITY_CORE_CONFLICT');
});

test('widget package events require a verified actor and settings ownership', async () => {
  const { _internals } = require('../mother/modules/widgetManager');
  const emitter = new EventEmitter();
  _internals.setupWidgetManagerEvents(emitter);
  const send = decodedJWT => new Promise((resolve, reject) => emitter.emit('installWidgetZip', {
    jwt: 'token', moduleName: 'widgetManager', moduleType: 'core', decodedJWT
  }, (err, value) => err ? reject(err) : resolve(value)));
  await expect(send(undefined)).rejects.toThrow('WIDGET_PACKAGE_PERMISSION');
  await expect(send({ permissions: { widgets: { create: true } } })).rejects.toThrow('settings.core.edit');
});
