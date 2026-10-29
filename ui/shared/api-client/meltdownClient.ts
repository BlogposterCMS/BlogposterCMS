import { isConcurrentAdminRead, isReusableRuntimeRead } from './runtimeReadPolicy.js';

export type MeltdownPayload = Record<string, unknown>;

export interface MeltdownBatchEvent {
  eventName: string;
  payload?: MeltdownPayload;
}

export interface MeltdownClient {
  emit<T = unknown>(eventName: string, payload?: MeltdownPayload, timeout?: number): Promise<T>;
  emitBatch<T = unknown>(events: MeltdownBatchEvent[], jwt?: string | null, timeout?: number): Promise<T[]>;
}

export interface TokenProvider {
  getPublicToken(): string | null;
  getCsrfToken(): string | null;
}

export interface MeltdownClientOptions {
  endpoint?: string;
  batchEndpoint?: string;
  throttleDelay?: number;
  tokenProvider?: TokenProvider;
  fetchImpl?: typeof fetch;
  debug?: () => boolean;
  customEventHandler?: (eventName: string, payload: MeltdownPayload) => unknown;
}

interface QueueItem {
  eventName: string;
  payload: MeltdownPayload;
  timeout: number;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

const DEFAULT_TIMEOUT = 10000;
// Awaiting each response already serializes commands. A fixed idle gap adds
// latency to every admin page without providing an ordering guarantee.
const DEFAULT_THROTTLE_DELAY = 0;

function withoutJwt(payload: MeltdownPayload = {}) {
  const { jwt, ...bodyPayload } = payload;
  return {
    jwt: typeof jwt === 'string' ? jwt : null,
    bodyPayload
  };
}

async function parseJsonResponse(resp: Response, label: string, debug: boolean) {
  let rawText = '';
  let json: { error?: string; data?: unknown; results?: unknown[] };

  try {
    rawText = await resp.clone().text();
    json = JSON.parse(rawText);
  } catch (err) {
    console.error(`${label} invalid JSON`, resp.status, rawText);
    throw err;
  }

  if (debug) {
    console.debug(label, {
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

  return json;
}

export function createWindowTokenProvider(win: Window): TokenProvider {
  const tokenWindow = win as Window & {
    PUBLIC_TOKEN?: string | null;
    CSRF_TOKEN?: string | null;
  };

  return {
    getPublicToken() {
      return tokenWindow.PUBLIC_TOKEN || null;
    },
    getCsrfToken() {
      return tokenWindow.CSRF_TOKEN || null;
    }
  };
}

export function fetchWithTimeout(
  fetchImpl: typeof fetch,
  resource: RequestInfo | URL,
  options: RequestInit = {},
  timeout = DEFAULT_TIMEOUT
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const opts = { ...options, signal: controller.signal };
  return fetchImpl(resource, opts).finally(() => clearTimeout(id));
}

export function createMeltdownClient(options: MeltdownClientOptions = {}): MeltdownClient {
  const endpoint = options.endpoint || '/api/meltdown';
  const batchEndpoint = options.batchEndpoint || '/api/meltdown/batch';
  const throttleDelay = options.throttleDelay ?? DEFAULT_THROTTLE_DELAY;
  const fetchImpl = options.fetchImpl || fetch.bind(globalThis);
  const debug = options.debug || (() => false);
  const tokenProvider = options.tokenProvider || {
    getPublicToken: () => null,
    getCsrfToken: () => null
  };

  const requestQueue: QueueItem[] = [];
  const publicQueue: QueueItem[] = [];
  let publicActive = 0;
  let commandActive = false;
  let adminReadsActive = 0;
  const readCache = new Map<string, { expires: number; value: Promise<unknown> }>();

  function invalidateReads() { readCache.clear(); }

  // Only the read-only public facade bypasses ordered command delivery.
  // Bound concurrency so background fonts cannot serialize page discovery.
  function processPublicQueue() {
    while (publicActive < 4 && publicQueue.length > 0) {
      const item = publicQueue.shift()!;
      publicActive += 1;
      send(item.eventName, item.payload, item.timeout)
        .then(item.resolve, item.reject)
        .finally(() => {
          publicActive -= 1;
          processPublicQueue();
        });
    }
  }

  async function send(eventName: string, payload: MeltdownPayload = {}, timeout = DEFAULT_TIMEOUT) {
    const { jwt, bodyPayload } = withoutJwt(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const token = jwt || tokenProvider.getPublicToken();
    const csrfToken = tokenProvider.getCsrfToken();
    if (token) headers['X-Public-Token'] = token;
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    if (debug()) {
      console.debug('[MELTDOWN][OUT]', {
        url: endpoint,
        method: 'POST',
        headers,
        body: { eventName, payload: bodyPayload }
      });
    }

    const resp = await fetchWithTimeout(fetchImpl, endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ eventName, payload: bodyPayload })
    }, timeout);

    const json = await parseJsonResponse(resp, '[MELTDOWN][IN]', debug());
    return json.data;
  }

  function processQueue() {
    if (commandActive) return;
    while (requestQueue.length && adminReadsActive < 4) {
      const next = requestQueue[0]!;
      const concurrent = throttleDelay <= 0 && isConcurrentAdminRead(next.eventName, next.payload);
      // A command is a fence: finish earlier reads, then the command, before
      // starting later reads. Reads never jump over a queued save/delete.
      if (!concurrent && adminReadsActive > 0) return;
      const item = requestQueue.shift()!;
      if (concurrent) adminReadsActive += 1;
      else commandActive = true;
      send(item.eventName, item.payload, item.timeout)
        .then(item.resolve, item.reject)
        .finally(() => {
          const continueQueue = () => {
            if (concurrent) adminReadsActive -= 1;
            else commandActive = false;
            processQueue();
          };
          if (throttleDelay > 0) setTimeout(continueQueue, throttleDelay);
          else continueQueue();
        });
      if (!concurrent) return;
    }
  }

  return {
    emit<T = unknown>(eventName: string, payload: MeltdownPayload = {}, timeout = DEFAULT_TIMEOUT): Promise<T> {
      const reusable = isReusableRuntimeRead(eventName, payload);
      const key = reusable ? JSON.stringify([
        eventName, payload, tokenProvider.getPublicToken(), tokenProvider.getCsrfToken(), timeout
      ]) : '';
      const cached = readCache.get(key);
      if (cached && cached.expires > Date.now()) {
        return cached.value.then(value => structuredClone(value)) as Promise<T>;
      }
      if (eventName !== 'cmsPublicRuntimeRequest' && !isConcurrentAdminRead(eventName, payload)) invalidateReads();
      const pending = new Promise<unknown>((resolve, reject) => {
        // Local dialogs can issue their own backend requests while awaiting a
        // selection. Holding the transport queue for the dialog would deadlock.
        try {
          const localResult = options.customEventHandler?.(eventName, payload);
          if (typeof localResult !== 'undefined') { resolve(localResult); return; }
        } catch (error) { reject(error); return; }
        if (eventName === 'cmsPublicRuntimeRequest') {
          publicQueue.push({ eventName, payload, timeout, resolve, reject });
          processPublicQueue();
          return;
        }
        requestQueue.push({ eventName, payload, timeout, resolve, reject });
        processQueue();
      });
      if (!reusable) return pending as Promise<T>;
      if (readCache.size >= 64) readCache.delete(readCache.keys().next().value!);
      const entry = { expires: Date.now() + 30_000, value: pending };
      readCache.set(key, entry);
      // Remove failures without deleting a newer request after invalidation.
      void pending.catch(() => { if (readCache.get(key) === entry) readCache.delete(key); });
      return pending.then(value => structuredClone(value)) as Promise<T>;
    },

    async emitBatch<T = unknown>(
      events: MeltdownBatchEvent[] = [],
      jwt: string | null = null,
      timeout = DEFAULT_TIMEOUT
    ): Promise<T[]> {
      if (!Array.isArray(events) || events.length === 0) return [];
      invalidateReads();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      const token = jwt || tokenProvider.getPublicToken();
      const csrfToken = tokenProvider.getCsrfToken();
      if (token) headers['X-Public-Token'] = token;
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

      if (debug()) {
        console.debug('[MELTDOWN][OUT][BATCH]', {
          url: batchEndpoint,
          method: 'POST',
          headers,
          body: { events }
        });
      }

      const resp = await fetchWithTimeout(fetchImpl, batchEndpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ events })
      }, timeout).finally(invalidateReads);

      const json = await parseJsonResponse(resp, '[MELTDOWN][IN][BATCH]', debug());
      return (Array.isArray(json.results) ? json.results : []) as T[];
    }
  };
}
