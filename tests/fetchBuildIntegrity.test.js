'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fetchBuildIntegrity } = require('../tools/fetch-build-integrity');

const url = 'https://github.com/BlogposterCMS/BlogposterCMS/releases/download/v0.10.39/runtime-integrity-manifest.json';
let directory;
let target;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'build-fetch-'));
  target = path.join(directory, 'manifest.json');
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

test('bounded HTTPS curl output is written exclusively, without a shell', () => {
  const runner = jest.fn(() => ({ status: 0, stdout: Buffer.from('verified later') }));
  fetchBuildIntegrity(url, target, { maxBytes: 1024, runner });
  expect(fs.readFileSync(target, 'utf8')).toBe('verified later');
  expect(runner).toHaveBeenCalledWith('curl', expect.arrayContaining([
    '--disable', '--proto', '=https', '--proto-redir', '--max-redirs', '5',
    '--connect-timeout', '10', '--max-time', '60', '--max-filesize', '1024', url
  ]), { timeout: 62000, maxBuffer: 1024, windowsHide: true });
  expect(runner.mock.calls[0][1][0]).toBe('--disable');
  expect(() => fetchBuildIntegrity(url, target, { maxBytes: 1024, runner })).toThrow();
  expect(fs.readFileSync(target, 'utf8')).toBe('verified later');
});

test('one timeout retry discards the partial response', () => {
  const runner = jest.fn()
    .mockReturnValueOnce({ status: 28, stdout: Buffer.from('partial') })
    .mockReturnValueOnce({ status: 0, stdout: Buffer.from('complete') });
  fetchBuildIntegrity(url, target, { maxBytes: 1024, runner });
  expect(runner).toHaveBeenCalledTimes(2);
  expect(fs.readFileSync(target, 'utf8')).toBe('complete');
});

test.each([
  [{ status: 28 }, 'RUNTIME_INTEGRITY_DOWNLOAD_TIMEOUT', 2],
  [{ error: { code: 'ETIMEDOUT' } }, 'RUNTIME_INTEGRITY_DOWNLOAD_TIMEOUT', 2],
  [{ status: 63 }, 'RUNTIME_INTEGRITY_DOWNLOAD_TOO_LARGE', 1],
  [{ error: { code: 'ENOBUFS' } }, 'RUNTIME_INTEGRITY_DOWNLOAD_TOO_LARGE', 1],
  [{ status: 0, stdout: Buffer.alloc(1025) }, 'RUNTIME_INTEGRITY_DOWNLOAD_TOO_LARGE', 1],
  [{ status: 22, stderr: 'secret redirect URL' }, 'RUNTIME_INTEGRITY_BUILD_DOWNLOAD_FAILED', 1],
  [{ status: 60 }, 'RUNTIME_INTEGRITY_BUILD_DOWNLOAD_FAILED', 1],
  [{ error: { code: 'ENOENT' } }, 'RUNTIME_INTEGRITY_BUILD_DOWNLOAD_FAILED', 1],
  [{ status: 0, stdout: Buffer.alloc(0) }, 'RUNTIME_INTEGRITY_BUILD_DOWNLOAD_FAILED', 1]
])('failed transfer publishes no file (%j)', (result, code, attempts) => {
  const runner = jest.fn(() => result);
  expect(() => fetchBuildIntegrity(url, target, { maxBytes: 1024, runner })).toThrow(code);
  expect(runner).toHaveBeenCalledTimes(attempts);
  expect(fs.existsSync(target)).toBe(false);
});

test.each([
  [url.replace('https:', 'http:'), 1024, 60000],
  [url.replace('github.com', 'example.com'), 1024, 60000],
  [url + '?token=secret', 1024, 60000],
  [url.replace('v0.10.39', 'latest'), 1024, 60000],
  [url, 0, 60000], [url, 17 * 1024 * 1024, 60000], [url, 1024, 60001]
])('rejects invalid input before transport', (input, maxBytes, timeoutMs) => {
  const runner = jest.fn();
  expect(() => fetchBuildIntegrity(input, target, { maxBytes, timeoutMs, runner }))
    .toThrow('RUNTIME_INTEGRITY_BUILD_FETCH_INPUT_INVALID');
  expect(runner).not.toHaveBeenCalled();
});
