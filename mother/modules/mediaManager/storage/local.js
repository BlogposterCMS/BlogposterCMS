'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

/** Reuses Media Manager's containment and symlink guards for public local delivery. */
module.exports = function createLocalAdapter({ resolveSafePath }) {
  return {
    async put({ key, filePath }) {
      const target = resolveSafePath(`public/${key}`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      resolveSafePath(`public/${key}`);
      await fs.copyFile(filePath, target, require('node:fs').constants.COPYFILE_EXCL);
    },
    async head(key) { return fs.stat(resolveSafePath(`public/${key}`)); },
    async delete(key) { await fs.unlink(resolveSafePath(`public/${key}`)); },
    async test() { await fs.access(resolveSafePath('public')); },
    async downloadUrl(key) { return `/media/${key.split('/').map(encodeURIComponent).join('/')}`; }
  };
};
