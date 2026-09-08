'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const Busboy = require('busboy');
const { fail } = require('./config');

/** Spool bounded multipart data with backpressure; never buffer an APK in memory. */
async function receiveUpload(req, mimeMap, maxBytes) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'blogposter-media-'));
  const filePath = path.join(directory, 'upload');
  let fileTask = Promise.resolve();
  let failure;
  let file;
  let appVersion = '';
  const cleanup = () => fs.promises.rm(directory, { recursive: true, force: true });
  try {
    await new Promise((resolve, reject) => {
      // Busboy emits partsLimit when the count reaches the limit, not only when exceeded.
      const parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 1, parts: 3, fileSize: maxBytes, fieldSize: 120 } });
      const abort = () => parser.destroy(new Error('MEDIA_STORAGE_UPLOAD_ABORTED'));
      req.once('aborted', abort);
      parser.once('close', () => req.off('aborted', abort));
      parser.on('file', (field, stream, info) => {
        const fileName = path.posix.basename(info.filename.replace(/\\/g, '/'));
        const mimeType = mimeMap[path.extname(fileName).toLowerCase()];
        if (field !== 'file' || !mimeType || !fileName) {
          failure = new Error('MEDIA_STORAGE_FILE_TYPE_INVALID');
          stream.resume();
          return;
        }
        file = { fileName, mimeType, filePath, sizeBytes: 0 };
        const hash = crypto.createHash('sha256');
        stream.on('data', chunk => { file.sizeBytes += chunk.length; hash.update(chunk); });
        stream.once('limit', () => { failure = new Error('MEDIA_STORAGE_UPLOAD_TOO_LARGE'); });
        fileTask = pipeline(stream, fs.createWriteStream(filePath, { flags: 'wx', mode: 0o600 }))
          .then(() => { file.checksum = hash.digest('hex'); })
          .catch(() => { failure = new Error('MEDIA_STORAGE_UPLOAD_FAILED'); });
      });
      parser.on('field', (name, value, info) => {
        if (name !== 'appVersion' || info.valueTruncated) failure = new Error('MEDIA_STORAGE_VERSION_INVALID');
        else appVersion = value.trim();
      });
      for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) {
        parser.on(event, () => { failure = new Error('MEDIA_STORAGE_UPLOAD_FIELDS_INVALID'); });
      }
      parser.once('error', reject);
      parser.once('finish', resolve);
      req.pipe(parser);
    });
    await fileTask;
    if (failure) throw failure;
    if (!file) fail('FILE_REQUIRED');
    return { ...file, appVersion, cleanup };
  } catch (error) {
    await fileTask;
    await cleanup();
    throw error;
  }
}

module.exports = { receiveUpload };
