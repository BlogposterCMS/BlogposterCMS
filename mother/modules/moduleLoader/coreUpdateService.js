'use strict';

const http = require('http');
const { version } = require('../../../package.json');

// This socket is the only core-update transport. Never accept a caller URL/path.
const SOCKET = '/run/blogposter-updater/control.sock';
function requestHost(action, target, { request = http.request, socketPath = SOCKET } = {}) {
  return new Promise((resolve, reject) => {
    const body = action === 'status' ? null : JSON.stringify(target || {});
    const req = request({ socketPath, path: `/${action}`, method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {} }, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk.toString();
        if (data.length > 32768) req.destroy(new Error('CORE_UPDATE_RESPONSE_TOO_LARGE'));
      });
      res.on('end', () => {
        try {
          const value = JSON.parse(data);
          if (res.statusCode >= 400) throw new Error(value.errorCode || 'CORE_UPDATE_HOST_FAILED');
          if (!value || value.configured !== true || typeof value.phase !== 'string') throw new Error('CORE_UPDATE_RESPONSE_INVALID');
          resolve({ ...value, installedVersion: version });
        } catch (err) { reject(err); }
      });
      res.on('error', reject);
    });
    req.setTimeout(8000, () => req.destroy(new Error('CORE_UPDATE_HOST_TIMEOUT')));
    req.on('error', reject);
    req.end(body);
  });
}

async function getCoreUpdateStatus() {
  try { return await requestHost('status'); }
  catch (err) {
    // The whole CMS stays usable when hosting has not provisioned the adapter.
    return { configured: false, installedVersion: version, phase: 'unavailable',
      errorCode: err.code === 'ENOENT' ? 'CORE_UPDATE_HOST_NOT_CONFIGURED' : 'CORE_UPDATE_HOST_UNAVAILABLE' };
  }
}

function coreUpdateNotification(state) {
  const candidate = state?.candidate;
  if (!state?.configured || !candidate?.available || !/^\d+\.\d+\.\d+$/.test(candidate.latestVersion)) return null;
  return { id: `blogposter-update-${candidate.latestVersion}`, priority: 'info', moduleName: 'Blogposter',
    timestamp: state.lastCheckedAt, message: `Blogposter ${candidate.latestVersion} is available.`,
    actionLabel: 'View update', actionPath: '/admin/settings/updates' };
}

module.exports = { requestHost, getCoreUpdateStatus, coreUpdateNotification };
