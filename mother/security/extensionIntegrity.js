'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { packageError } = require('../utils/extensionPackage');

function receiptPath(root, kind, id) {
  if (!['modules', 'widgets'].includes(kind) || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw packageError('EXTENSION_INTEGRITY_ID', 'Invalid package identity.');
  return path.join(root, 'data', 'extension-integrity', kind, `${id}.json`);
}

function treeRecords(dir, prefix) {
  const records = [];
  function walk(current, relative) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      const name = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw packageError('EXTENSION_INTEGRITY_SYMLINK', 'Package symlinks are forbidden.');
      if (entry.isDirectory()) walk(file, name);
      else if (entry.isFile()) records.push({ path: name, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), size: fs.statSync(file).size });
      else throw packageError('EXTENSION_INTEGRITY_FILE', 'Unsupported package file.');
    }
  }
  if (fs.lstatSync(dir).isSymbolicLink()) throw packageError('EXTENSION_INTEGRITY_SYMLINK', 'Package root cannot be a symlink.');
  walk(dir, prefix);
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

// This is a local administrator approval receipt, not a publisher signature.
// Permissions remain in the module registry / Settings Manager, never here.
function saveExtensionReceipt(root, kind, id, dir, hash) {
  const file = receiptPath(root, kind, id);
  const receipt = { version: 1, kind, id, hash, files: treeRecords(dir, `${kind}/${id}`) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(receipt), { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
}

function removeExtensionReceipt(root, kind, id) { fs.rmSync(receiptPath(root, kind, id), { force: true }); }

function extensionRecords(root) {
  const records = [];
  for (const kind of ['modules', 'widgets']) {
    const dir = path.join(root, 'data', 'extension-integrity', kind);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -5);
      const receipt = JSON.parse(fs.readFileSync(receiptPath(root, kind, id), 'utf8'));
      const prefix = `${kind}/${id}/`;
      if (receipt.version !== 1 || receipt.kind !== kind || receipt.id !== id || !Array.isArray(receipt.files) || !receipt.files.length
        || receipt.files.some(record => !record.path?.startsWith(prefix) || record.path.includes('..') || record.path.includes('\\') || !/^[a-f0-9]{64}$/.test(record.sha256))) {
        throw packageError('EXTENSION_INTEGRITY_RECEIPT', 'Invalid local package approval receipt.');
      }
      records.push(...receipt.files);
    }
  }
  return records;
}

function approvedRuntimeRecords(root, baseline) {
  const additions = extensionRecords(root);
  const prefixes = new Set(additions.map(record => record.path.split('/').slice(0, 2).join('/') + '/'));
  if (baseline.some(record => [...prefixes].some(prefix => record.path.startsWith(prefix)))) {
    throw packageError('EXTENSION_INTEGRITY_CORE_CONFLICT', 'Local package approvals cannot replace release-owned files.');
  }
  return [...baseline, ...additions];
}

module.exports = { saveExtensionReceipt, removeExtensionReceipt, approvedRuntimeRecords, treeRecords };
