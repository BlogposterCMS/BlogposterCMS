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
const DEFAULT_THROTTLE_DELAY = 100;

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
  let busy = false;

  async function send(eventName: string, payload: MeltdownPayload = {}, timeout = DEFAULT_TIMEOUT) {
    const customResult = options.customEventHandler?.(eventName, payload);
    if (typeof customResult !== 'undefined') {
      return customResult;
    }

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
    if (busy || requestQueue.length === 0) return;
    busy = true;

    const item = requestQueue.shift();
    if (!item) {
      busy = false;
      return;
    }

    send(item.eventName, item.payload, item.timeout)
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        setTimeout(() => {
          busy = false;
          processQueue();
        }, throttleDelay);
      });
  }

  return {
    emit<T = unknown>(eventName: string, payload: MeltdownPayload = {}, timeout = DEFAULT_TIMEOUT): Promise<T> {
      return new Promise<unknown>((resolve, reject) => {
        requestQueue.push({ eventName, payload, timeout, resolve, reject });
        processQueue();
      }) as Promise<T>;
    },

    async emitBatch<T = unknown>(
      events: MeltdownBatchEvent[] = [],
      jwt: string | null = null,
      timeout = DEFAULT_TIMEOUT
    ): Promise<T[]> {
      if (!Array.isArray(events) || events.length === 0) return [];

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
      }, timeout);

      const json = await parseJsonResponse(resp, '[MELTDOWN][IN][BATCH]', debug());
      return (Array.isArray(json.results) ? json.results : []) as T[];
    }
  };
}
