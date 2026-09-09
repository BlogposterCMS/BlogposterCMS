'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { CHUNK_SIZE, MAX_SIZE, ASSET, validateDownload, digest } = require('../deploy/download-update-image');

/** Bind the portable image and each resumable piece to the signed manifest. */
function createDownloadDescriptor(archive, version) {
  const size = fs.statSync(archive).size;
  if (!size || size > MAX_SIZE) throw new Error('CORE_UPDATE_DOWNLOAD_SIZE_INVALID');
  const fd = fs.openSync(archive, 'r');
  const hash = crypto.createHash('sha256');
  const chunks = [];
  try {
    for (let offset = 0; offset < size; offset += CHUNK_SIZE) {
      const bytes = Buffer.alloc(Math.min(CHUNK_SIZE, size - offset));
      if (fs.readSync(fd, bytes, 0, bytes.length, offset) !== bytes.length) throw new Error('CORE_UPDATE_DOWNLOAD_SIZE_CHANGED');
      hash.update(bytes); chunks.push(digest(bytes));
    }
  } finally { fs.closeSync(fd); }
  const download = { platform: 'linux/amd64', size, chunkSize: CHUNK_SIZE,
    sha256: hash.digest('hex'), chunks,
    url: `https://github.com/BlogposterCMS/BlogposterCMS/releases/download/v${version}/${ASSET}` };
  return validateDownload({ version, source: { repository: 'BlogposterCMS/BlogposterCMS', tag: `v${version}` }, image: { download } });
}

module.exports = { createDownloadDescriptor };
