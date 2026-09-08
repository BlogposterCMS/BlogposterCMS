'use strict';

const crypto = require('crypto');

const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;

function packageError(code, message) {
  return Object.assign(new Error(`[${code}] ${message}`), { code });
}

// Inspection and confirmation refer to the exact same bytes, not just a name.
function packageHash(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_PACKAGE_BYTES) {
    throw packageError('EXTENSION_PACKAGE_SIZE', 'Choose one ZIP file up to 10 MiB.');
  }
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function assertPackageReview(buffer, reviewedHash) {
  if (packageHash(buffer) !== reviewedHash) {
    throw packageError('EXTENSION_REVIEW_REQUIRED', 'Review this exact package before installing.');
  }
}

// Bound decompression and reject ambiguous filesystem names before extraction.
function validateArchiveLimits(entries) {
  if (!entries.length || entries.length > 1000) throw packageError('EXTENSION_ARCHIVE_LIMIT', 'ZIP must contain 1–1000 entries.');
  let total = 0;
  const seen = new Set();
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    const parts = name.replace(/\/$/, '').split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':') || [...part].some(char => char.charCodeAt(0) < 32) || /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      throw packageError('EXTENSION_ARCHIVE_PATH', 'ZIP contains an unsafe path.');
    }
    const key = name.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) throw packageError('EXTENSION_ARCHIVE_DUPLICATE', 'ZIP contains duplicate paths.');
    seen.add(key);
    if (((Number(entry.header.attr) >>> 16) & 0o170000) === 0o120000) throw packageError('EXTENSION_ARCHIVE_SYMLINK', 'ZIP symlinks are forbidden.');
    total += entry.header.size;
    if (entry.header.size > MAX_PACKAGE_BYTES || total > 30 * 1024 * 1024) throw packageError('EXTENSION_ARCHIVE_LIMIT', 'Unpacked ZIP is too large.');
  }
}

module.exports = { packageError, packageHash, assertPackageReview, validateArchiveLimits };
