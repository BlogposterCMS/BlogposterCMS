'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { treeRecords } = require('../../security/extensionIntegrity');

/** Stage on the target filesystem so persisted widget volumes support atomic rename.
 * Replacements retain a durable copy of all old files and the old receipt. */
function stageWidgetFiles(root, id, source, replacing, oldPolicy) {
  const suffix = crypto.randomUUID();
  const target = path.join(root, id);
  const incoming = path.join(root, `.install-${id}-${suffix}`);
  const previous = path.join(root, `.previous-${id}-${suffix}`);
  const receipt = path.join(path.dirname(root), 'data', 'extension-integrity', 'widgets', `${id}.json`);
  const originalReceipt = fs.existsSync(receipt) ? fs.readFileSync(receipt) : null;
  let backup = null, movedOld = false, exposed = false;
  try {
    fs.cpSync(source, incoming, { recursive: true, errorOnExist: true, force: false });
    if (replacing) {
      // Validate the old tree before copying; never follow symlinks into operator files.
      const before = treeRecords(target, id);
      backup = path.join(path.dirname(root), 'data', 'extension-backups', 'widgets', `${id}-${suffix}`);
      fs.mkdirSync(backup, { recursive: true });
      fs.cpSync(target, path.join(backup, 'package'), { recursive: true, errorOnExist: true, force: false });
      if (JSON.stringify(treeRecords(path.join(backup, 'package'), id)) !== JSON.stringify(before)) throw new Error('WIDGET_PACKAGE_BACKUP_MISMATCH');
      fs.writeFileSync(path.join(backup, 'policy.json'), JSON.stringify(oldPolicy || null), { mode: 0o600 });
      if (originalReceipt) fs.writeFileSync(path.join(backup, 'receipt.json'), originalReceipt, { mode: 0o600 });
    }
  } catch (err) { fs.rmSync(incoming, {recursive:true,force:true}); throw err; }
  return {
    expose() {
      if (replacing) { fs.renameSync(target, previous); movedOld = true; }
      fs.renameSync(incoming, target); exposed = true;
    },
    commit() {
      if (movedOld) fs.rmSync(previous, { recursive: true, force: true });
      return backup ? path.relative(path.dirname(root), backup).split(path.sep).join('/') : null;
    },
    rollback() {
      if (exposed) fs.rmSync(target, {recursive:true,force:true});
      if (movedOld) fs.renameSync(previous, target);
      fs.rmSync(incoming, {recursive:true,force:true});
      if (originalReceipt) { fs.mkdirSync(path.dirname(receipt), {recursive:true}); fs.writeFileSync(receipt, originalReceipt, {mode:0o600}); }
      else fs.rmSync(receipt, {force:true});
    }
  };
}

module.exports = { stageWidgetFiles };
