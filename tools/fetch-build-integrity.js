'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

// Build-only transport: reuse the verifier stage's curl and CA store, including
// its configured proxy environment. Runtime download and trust policy stay intact.
function fetchBuildIntegrity(url, target, { maxBytes, timeoutMs = 60000, runner = spawnSync } = {}) {
  if (!/^https:\/\/github\.com\/BlogposterCMS\/BlogposterCMS\/releases\/download\/v\d+\.\d+\.\d+\/runtime-integrity-manifest(?:\.bundle)?\.json$/.test(url)
      || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
    fail('RUNTIME_INTEGRITY_BUILD_FETCH_INPUT_INVALID', 'Expected bounded official release metadata.');
  }
  const args = ['--disable', '--fail', '--silent', '--show-error', '--location',
    '--proto', '=https', '--proto-redir', '=https', '--tlsv1.2', '--max-redirs', '5',
    '--connect-timeout', '10', '--max-time', String(timeoutMs / 1000),
    '--max-filesize', String(maxBytes), url];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = runner('curl', args, {
      timeout: timeoutMs + 2000, maxBuffer: maxBytes, windowsHide: true
    });
    const timedOut = result.status === 28 || result.error?.code === 'ETIMEDOUT';
    // A separate process discards partial stdout before the one timeout retry.
    if (timedOut && attempt === 0) continue;
    if (timedOut) fail('RUNTIME_INTEGRITY_DOWNLOAD_TIMEOUT', 'Build metadata download timed out after two attempts.');
    if (result.status === 63 || result.error?.code === 'ENOBUFS' || result.stdout?.length > maxBytes) {
      fail('RUNTIME_INTEGRITY_DOWNLOAD_TOO_LARGE', 'Build metadata exceeds its size limit.');
    }
    if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length === 0) {
      // Do not expose curl stderr: redirect URLs may contain temporary signatures.
      fail('RUNTIME_INTEGRITY_BUILD_DOWNLOAD_FAILED', 'Could not download signed build metadata.');
    }
    fs.writeFileSync(target, result.stdout, { flag: 'wx', mode: 0o600 });
    return;
  }
}

module.exports = { fetchBuildIntegrity };
