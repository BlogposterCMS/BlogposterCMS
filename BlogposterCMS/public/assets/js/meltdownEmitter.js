// public/assets/js/meltdownEmitter.js
import { debounce } from './utils/debounce.js';

export function fetchWithTimeout(resource, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const opts = { ...options, signal: controller.signal };
  return fetch(resource, opts).finally(() => clearTimeout(id));
}

window.fetchWithTimeout = fetchWithTimeout;

  async function meltdownEmitRaw(eventName, payload = {}, timeout = 10000) {
    if (
      (eventName === 'openExplorer' || eventName === 'openMediaExplorer') &&
      window._openMediaExplorer
    ) {
      return window._openMediaExplorer(payload);
    }
    const headers = {
      'Content-Type': 'application/json'
    };

    if (payload.jwt) {
      headers['X-Public-Token'] = payload.jwt;
      delete payload.jwt;
    } else if (window.PUBLIC_TOKEN) {
      headers['X-Public-Token'] = window.PUBLIC_TOKEN;
    }

    if (window.CSRF_TOKEN) {
      headers['X-CSRF-Token'] = window.CSRF_TOKEN;
    }

    // Advanced debug: log outgoing request
    if (window.DEBUG_MELTDOWN) {
      console.debug('[MELTDOWN][OUT]', {
        url: '/api/meltdown',
        method: 'POST',
        headers,
        body: { eventName, payload }
      });
    }

    const resp = await fetchWithTimeout('/api/meltdown', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ eventName, payload })
    }, timeout);

    let json;
    let rawText;
    try {
      rawText = await resp.clone().text();
      json = JSON.parse(rawText);
    } catch(e) {
      console.error('[MELTDOWN][IN] invalid JSON', resp.status, rawText);
      throw e;
    }

    // Advanced debug: log incoming response
    if (window.DEBUG_MELTDOWN) {
      console.debug('[MELTDOWN][IN]', {
        status: resp.status,
        statusText: resp.statusText,
        headers: Object.fromEntries(resp.headers.entries()),
        raw: rawText,
        json
      });
    }

    if (!resp.ok || json.error) {
      throw new Error(json.error || resp.statusText);
    }

    return json.data;
  }

const _queue = [];

function flushQueue() {
    const batch = _queue.splice(0, _queue.length);
    if (batch.length === 0) return;

    if (batch.length === 1) {
      const { eventName, payload, timeout, resolve, reject } = batch[0];
      meltdownEmitRaw(eventName, payload, timeout).then(resolve).catch(reject);
      return;
    }

    const events = batch.map(item => ({ eventName: item.eventName, payload: item.payload }));
    const timeout = batch[0].timeout;
    window.meltdownEmitBatch(events, null, timeout)
      .then(results => {
        results.forEach((res, idx) => batch[idx].resolve(res));
      })
      .catch(err => {
        batch.forEach(item => item.reject(err));
      });
}

const scheduleFlush = debounce(flushQueue, 50);

window.meltdownEmit = function(eventName, payload = {}, timeout = 10000) {
  return new Promise((resolve, reject) => {
    _queue.push({ eventName, payload, timeout, resolve, reject });
    scheduleFlush();
  });
};

  // Batch multiple meltdown events in one request
  window.meltdownEmitBatch = async function(events = [], jwt = null, timeout = 10000) {
    if (!Array.isArray(events) || events.length === 0) return [];

    const headers = {
      'Content-Type': 'application/json'
    };

    const token = jwt || window.PUBLIC_TOKEN;
    if (token) headers['X-Public-Token'] = token;
    if (window.CSRF_TOKEN) headers['X-CSRF-Token'] = window.CSRF_TOKEN;

    if (window.DEBUG_MELTDOWN) {
      console.debug('[MELTDOWN][OUT][BATCH]', {
        url: '/api/meltdown/batch',
        method: 'POST',
        headers,
        body: { events }
      });
    }

    const resp = await fetchWithTimeout('/api/meltdown/batch', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ events })
    }, timeout);

    let json;
    let rawText;
    try {
      rawText = await resp.clone().text();
      json = JSON.parse(rawText);
    } catch (e) {
      console.error('[MELTDOWN][IN][BATCH] invalid JSON', resp.status, rawText);
      throw e;
    }

    if (window.DEBUG_MELTDOWN) {
      console.debug('[MELTDOWN][IN][BATCH]', {
        status: resp.status,
        statusText: resp.statusText,
        headers: Object.fromEntries(resp.headers.entries()),
        raw: rawText,
        json
      });
    }

    if (!resp.ok || json.error) {
      throw new Error(json.error || resp.statusText);
    }

  return json.results;
};

