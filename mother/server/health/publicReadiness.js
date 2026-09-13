'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');
const { requestBackendEvent } = require('../../contracts/backendEventContracts');

/** Exercise public authorization, runtime dispatch and page storage without rendering or writing. */
function createPublicReadiness({ motherEmitter, now = Date.now }) {
  let pending;
  let lastResult;
  let checkedAt = -Infinity;
  return function readiness() {
    // Coalesce monitoring traffic. Never keep an old success through a long outage.
    if (pending) return pending;
    if (lastResult && now() - checkedAt < 1000) return Promise.resolve(lastResult);
    pending = (async () => {
      try {
        const token = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.ENSURE_PUBLIC_TOKEN, {
          purpose: 'public', moduleName: 'publicRoute', moduleType: 'core'
        }, { timeoutMs: 1000 });
        await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CMS_PUBLIC_RUNTIME_REQUEST, {
          jwt: token, moduleName: 'runtimeManager', moduleType: 'core',
          resource: 'pages', action: 'start', params: { language: 'en' }
        }, { timeoutMs: 1500 });
        // An empty site is ready too: the lookup must succeed, not return a published page.
        lastResult = { ready: true };
      } catch {
        lastResult = { ready: false, code: 'BLOGPOSTER_PUBLIC_RUNTIME_UNAVAILABLE' };
      }
      checkedAt = now();
      return lastResult;
    })().finally(() => { pending = null; });
    return pending;
  };
}

module.exports = { createPublicReadiness };
