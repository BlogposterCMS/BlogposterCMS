'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const { parseManifest, packageError } = require('./coreModulePackages');

/** Extract only files enumerated by a bounded manifest; never execute an archive. */
function extractModuleArchive(buffer, moduleName, destination) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 80 * 1024 * 1024) throw packageError('CORE_MODULE_ARCHIVE_TOO_LARGE');
  const archive = new AdmZip(buffer);
  const entries = archive.getEntries();
  if (entries.length > 10002) throw packageError('CORE_MODULE_ARCHIVE_TOO_LARGE');
  const indexed = new Map();
  let expandedSize = 0;
  for (const entry of entries) {
    if (((Number(entry.header.attr) >>> 16) & 0o170000) === 0o120000 ||
        !Number.isSafeInteger(entry.header.size) || entry.header.size < 0 ||
        (expandedSize += entry.header.size) > 80 * 1024 * 1024 ||
        indexed.has(entry.entryName.toLowerCase())) throw packageError('CORE_MODULE_ARCHIVE_INVALID');
    // The packager emits file entries only, so directory/traversal/alias entries
    // are unnecessary and cannot acquire filesystem semantics on the host.
    if (entry.isDirectory) throw packageError('CORE_MODULE_ARCHIVE_INVALID');
    indexed.set(entry.entryName.toLowerCase(), entry);
  }
  const manifestEntry = indexed.get('manifest.json');
  if (!manifestEntry || manifestEntry.header.size > 8 * 1024 * 1024) throw packageError('CORE_MODULE_ARCHIVE_INVALID');
  const manifest = parseManifest(manifestEntry.getData(), moduleName);
  const allowed = new Set(['manifest.json', 'manifest.bundle.json', ...manifest.files.map(record => `code/${record.path}`)]);
  if (allowed.size !== entries.length || entries.some(entry => !allowed.has(entry.entryName))) throw packageError('CORE_MODULE_ARCHIVE_INVALID');
  // Destination must be newly created by the owning store/download operation.
  fs.mkdirSync(destination, { recursive: false, mode: 0o700 });
  for (const entry of entries) {
    const expected = manifest.files.find(record => `code/${record.path}` === entry.entryName);
    if ((expected && entry.header.size !== expected.size) || (!expected && entry.header.size > 8 * 1024 * 1024)) throw packageError('CORE_MODULE_ARCHIVE_INVALID');
    const data = entry.getData();
    if (data.length !== entry.header.size) throw packageError('CORE_MODULE_ARCHIVE_INVALID');
    const filename = path.join(destination, entry.entryName);
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    fs.writeFileSync(filename, data, { flag: 'wx', mode: 0o600 });
  }
  return manifest;
}

function buildModuleArchive({ moduleDir, moduleName, manifest, bundle }) {
  const parsed = parseManifest(manifest, moduleName);
  const archive = new AdmZip();
  // Preserve the exact attested bytes, including formatting and final newline.
  archive.addFile('manifest.json', Buffer.from(manifest));
  archive.addFile('manifest.bundle.json', Buffer.isBuffer(bundle) ? bundle : Buffer.from(bundle));
  for (const record of parsed.files) {
    const data = fs.readFileSync(path.join(moduleDir, record.path));
    if (data.length !== record.size || crypto.createHash('sha256').update(data).digest('hex') !== record.sha256) throw packageError('CORE_MODULE_RELEASE_BYTES_CHANGED');
    archive.addFile(`code/${record.path}`, data);
  }
  return archive.toBuffer();
}

module.exports = { extractModuleArchive, buildModuleArchive };
