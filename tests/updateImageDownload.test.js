const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { createDownloadDescriptor } = require('../tools/create-update-download-descriptor');
const { downloadImage, CHUNK_SIZE } = require('../deploy/download-update-image');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-download-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function fixture(bytes) {
  const source = path.join(root, 'source'); fs.writeFileSync(source, bytes);
  return { version: '0.10.22', source: { repository: 'BlogposterCMS/BlogposterCMS', tag: 'v0.10.22' },
    image: { download: createDownloadDescriptor(source, '0.10.22') } };
}
function transport(bytes, invalid = false) {
  return jest.fn((_url, options, receive) => {
    const req = new EventEmitter(); req.setTimeout = () => {};
    req.destroy = error => { req.emit('error', error); req.emit('close'); };
    req.end = () => process.nextTick(() => {
      const [, a, b] = options.headers.Range.match(/bytes=(\d+)-(\d+)/);
      const start = Number(a), end = Number(b);
      const res = new PassThrough(); res.statusCode = invalid ? 200 : 206;
      res.headers = { 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': String(end - start + 1) };
      receive(res); res.end(bytes.subarray(start, end + 1)); req.emit('close');
    }); return req;
  });
}
test('cancel retains verified chunks; resume downloads only the missing chunk', async () => {
  const bytes = Buffer.alloc(CHUNK_SIZE + 7, 42), manifest = fixture(bytes), request = transport(bytes);
  const signal = new AbortController();
  await expect(downloadImage(manifest, path.join(root, 'state'), { request, signal: signal.signal,
    onProgress: p => { if (p.completedChunks === 1) signal.abort(); } })).rejects.toBeDefined();
  const archive = await downloadImage(manifest, path.join(root, 'state'), { request });
  expect(request).toHaveBeenCalledTimes(2);
  expect(fs.readFileSync(archive)).toEqual(bytes);
});
test('rejects incorrect range responses and corrupted signed bytes', async () => {
  const manifest = fixture(Buffer.from('trusted'));
  await expect(downloadImage(manifest, path.join(root, 'state'), { request: transport(Buffer.from('trusted'), true) })).rejects.toMatchObject({ code: 'CORE_UPDATE_DOWNLOAD_RANGE_INVALID' });
  await expect(downloadImage(manifest, path.join(root, 'state'), { request: transport(Buffer.from('changed')) })).rejects.toMatchObject({ code: 'CORE_UPDATE_DOWNLOAD_CHECKSUM_INVALID' });
});
test('rejects a changed release URL before making a request', async () => {
  const manifest = fixture(Buffer.from('trusted')); manifest.image.download.url = 'https://example.com/image';
  const request = jest.fn();
  await expect(downloadImage(manifest, path.join(root, 'state'), { request })).rejects.toMatchObject({ code: 'CORE_UPDATE_DOWNLOAD_MANIFEST_INVALID' });
  expect(request).not.toHaveBeenCalled();
});
