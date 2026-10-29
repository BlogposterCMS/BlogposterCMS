'use strict';

// Host-only transport for a descriptor inside the already attested manifest.
// No browser URL, registry credentials or expiring redirect is persisted here.
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { setTimeout: delay } = require('timers/promises');

const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_SIZE = 2 * 1024 * 1024 * 1024;
const ASSET = 'blogposter-image-linux-amd64.tar.gz';
const HASH = /^[a-f0-9]{64}$/;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function failure(code) { return Object.assign(new Error(code), { code }); }

function validateDownload(manifest) {
  const value = manifest?.image?.download;
  const version = manifest?.version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ||
      manifest?.source?.repository !== 'BlogposterCMS/BlogposterCMS' || manifest.source.tag !== `v${version}` ||
      !value || value.platform !== 'linux/amd64' || value.chunkSize !== CHUNK_SIZE ||
      !Number.isSafeInteger(value.size) || value.size <= 0 || value.size > MAX_SIZE ||
      !HASH.test(value.sha256) || !Array.isArray(value.chunks) ||
      value.chunks.length !== Math.ceil(value.size / CHUNK_SIZE) || !value.chunks.every(hash => typeof hash === 'string' && HASH.test(hash)) ||
      value.url !== `https://github.com/BlogposterCMS/BlogposterCMS/releases/download/v${version}/${ASSET}`) {
    throw failure('CORE_UPDATE_DOWNLOAD_MANIFEST_INVALID');
  }
  return value;
}

function allowedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname)) {
    throw failure('CORE_UPDATE_DOWNLOAD_REDIRECT_DENIED');
  }
  return url;
}

function requestRange(url, start, end, total, { request = https.request, signal, redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let checked;
    try { checked = allowedUrl(url); } catch (err) { reject(err); return; }
    const req = request(checked, { signal, headers: { Range: `bytes=${start}-${end}`, 'Accept-Encoding': 'identity' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        if (redirects >= 5 || !res.headers.location) return reject(failure('CORE_UPDATE_DOWNLOAD_REDIRECT_DENIED'));
        let next;
        try { next = allowedUrl(new URL(res.headers.location, checked)); } catch (err) { reject(err); return; }
        resolve(requestRange(next, start, end, total, { request, signal, redirects: redirects + 1 }));
        return;
      }
      const expected = end - start + 1;
      if (res.statusCode !== 206 || res.headers['content-range'] !== `bytes ${start}-${end}/${total}` ||
          (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') ||
          (res.headers['content-length'] && Number(res.headers['content-length']) !== expected)) {
        res.destroy(); reject(failure('CORE_UPDATE_DOWNLOAD_RANGE_INVALID')); return;
      }
      const chunks = []; let received = 0;
      res.on('data', bytes => {
        received += bytes.length;
        if (received > expected) { res.destroy(); reject(failure('CORE_UPDATE_DOWNLOAD_SIZE_INVALID')); }
        else chunks.push(bytes);
      });
      res.on('error', () => reject(failure('CORE_UPDATE_DOWNLOAD_NETWORK_FAILED')));
      res.on('end', () => received === expected ? resolve(Buffer.concat(chunks)) : reject(failure('CORE_UPDATE_DOWNLOAD_SIZE_INVALID')));
    });
    // Each chunk has both an inactivity limit and an absolute attempt deadline.
    const deadline = setTimeout(() => req.destroy(failure('CORE_UPDATE_DOWNLOAD_NETWORK_FAILED')), 120000);
    req.setTimeout(30000, () => req.destroy(failure('CORE_UPDATE_DOWNLOAD_NETWORK_FAILED')));
    req.on('close', () => clearTimeout(deadline));
    req.on('error', err => reject(failure(err.name === 'AbortError' ? 'CORE_UPDATE_DOWNLOAD_CANCELLED' : 'CORE_UPDATE_DOWNLOAD_NETWORK_FAILED')));
    req.end();
  });
}

function privateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      (process.platform !== 'win32' && (stat.uid !== process.getuid() || (stat.mode & 0o022)))) {
    throw failure('CORE_UPDATE_DOWNLOAD_CACHE_DENIED');
  }
}

function openCacheFile(file, flags) {
  // Cache names are derived only from signed hashes/indexes. Refuse links even
  // for an incomplete file left by an interrupted previous attempt.
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.nlink !== 1) throw failure('CORE_UPDATE_DOWNLOAD_CACHE_DENIED');
  }
  return fs.openSync(file, flags | (fs.constants.O_NOFOLLOW || 0), 0o600);
}

function cachedChunk(file, size, hash) {
  let fd;
  try {
    fd = openCacheFile(file, fs.constants.O_RDONLY);
    if (fs.fstatSync(fd).size !== size) return null;
    const bytes = fs.readFileSync(fd);
    return digest(bytes) === hash ? bytes : null;
  } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

async function downloadImage(manifest, stateDir, { signal, request, onProgress = () => {}, retryDelay = 1000 } = {}) {
  const descriptor = validateDownload(manifest);
  privateDirectory(stateDir);
  const root = path.join(stateDir, 'download-cache'); privateDirectory(root);
  const directory = path.join(root, descriptor.sha256); privateDirectory(directory);
  const archive = path.join(directory, 'image.tar.gz');
  const chunkFile = index => path.join(directory, `${index}.chunk`);
  const chunkLength = index => Math.min(CHUNK_SIZE, descriptor.size - index * CHUNK_SIZE);
  const verified = descriptor.chunks.map((hash, index) => Boolean(cachedChunk(chunkFile(index), chunkLength(index), hash)));
  let completedBytes = verified.reduce((sum, present, index) => sum + (present ? chunkLength(index) : 0), 0);
  const report = () => onProgress({ completedBytes, totalBytes: descriptor.size, completedChunks: verified.filter(Boolean).length, totalChunks: verified.length, resumable: true });
  report();
  // Reserve room for missing chunks and assembly, plus headroom for the host.
  // Docker's expanded image/backup capacity remains an operator prerequisite.
  const disk = fs.statfsSync(directory, { bigint: true });
  if (disk.bavail * disk.bsize < BigInt(2 * descriptor.size - completedBytes + 512 * 1024 * 1024)) throw failure('CORE_UPDATE_DOWNLOAD_SPACE_MISSING');
  for (let index = 0; index < descriptor.chunks.length; index += 1) {
    signal?.throwIfAborted();
    if (verified[index]) continue;
    let bytes;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        bytes = await requestRange(descriptor.url, index * CHUNK_SIZE, index * CHUNK_SIZE + chunkLength(index) - 1, descriptor.size, { request, signal });
        break;
      } catch (err) {
        if (err.code !== 'CORE_UPDATE_DOWNLOAD_NETWORK_FAILED' || attempt === 2) throw err;
        await delay(retryDelay * (attempt + 1), undefined, { signal });
      }
    }
    if (digest(bytes) !== descriptor.chunks[index]) throw failure('CORE_UPDATE_DOWNLOAD_CHECKSUM_INVALID');
    const fd = openCacheFile(chunkFile(index), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    verified[index] = true; completedBytes += bytes.length; report();
  }
  // Recheck every stored piece and the whole archive before Docker can import it.
  const fd = openCacheFile(archive, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC);
  const hash = crypto.createHash('sha256');
  try {
    for (let index = 0; index < descriptor.chunks.length; index += 1) {
      signal?.throwIfAborted();
      const bytes = cachedChunk(chunkFile(index), chunkLength(index), descriptor.chunks[index]);
      if (!bytes) throw failure('CORE_UPDATE_DOWNLOAD_CHECKSUM_INVALID');
      hash.update(bytes); fs.writeFileSync(fd, bytes);
    }
    if (hash.digest('hex') !== descriptor.sha256) throw failure('CORE_UPDATE_DOWNLOAD_CHECKSUM_INVALID');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  return archive;
}

if (require.main === module) {
  const controller = new AbortController();
  process.once('SIGTERM', () => controller.abort());
  Promise.resolve().then(() => {
    const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    return downloadImage(manifest, process.argv[3], { signal: controller.signal,
      onProgress: progress => console.log(`[CORE_UPDATE_DOWNLOAD_PROGRESS] ${JSON.stringify(progress)}`) });
  }).catch(err => {
    const code = controller.signal.aborted ? 'CORE_UPDATE_DOWNLOAD_CANCELLED' :
      /^CORE_UPDATE_/.test(err.code || '') ? err.code : 'CORE_UPDATE_DOWNLOAD_FAILED';
    console.error(`[${code}] Download stopped; verified chunks are retained.`); process.exitCode = 1;
  });
}
module.exports = { downloadImage, requestRange, validateDownload, CHUNK_SIZE, MAX_SIZE, ASSET, digest };
