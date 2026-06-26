import {
  createMeltdownClient,
  createWindowTokenProvider,
  fetchWithTimeout as sharedFetchWithTimeout
} from '@ui/shared/api-client/meltdownClient';

const tokenProvider = createWindowTokenProvider(window);
const client = createMeltdownClient({
  tokenProvider,
  debug: () => Boolean(window.DEBUG_MELTDOWN),
  customEventHandler(eventName, payload) {
    if (
      (eventName === 'openExplorer' || eventName === 'openMediaExplorer') &&
      window._openMediaExplorer
    ) {
      return window._openMediaExplorer(payload);
    }
    return undefined;
  }
});

window.fetchWithTimeout = function fetchWithTimeout(resource, options = {}, timeout = 10000) {
  return sharedFetchWithTimeout(fetch.bind(window), resource, options, timeout);
};

window.blogposterApi = client;
window.meltdownEmit = client.emit;
window.meltdownEmitBatch = client.emitBatch;
