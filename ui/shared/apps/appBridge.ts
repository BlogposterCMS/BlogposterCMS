import { startDomAgentSurface, type AgentSurfaceClient } from '../agent/agentSurfaceClient';
import type { MeltdownBatchEvent, MeltdownPayload } from '../api-client/meltdownClient';

export const APP_BRIDGE_REQUEST = 'cms-app-meltdown-request';
export const APP_BRIDGE_BATCH_REQUEST = 'cms-app-meltdown-batch-request';
export const APP_BRIDGE_RESPONSE = 'cms-app-meltdown-response';

const DEFAULT_TIMEOUT = 10000;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: number;
};

type AppBridgeMessage = {
  type?: string;
  appBridge?: boolean;
  appName?: string;
  csrfToken?: string | null;
  adminToken?: string | null;
  agentSurface?: boolean | Record<string, unknown>;
  allowedOrigins?: string[];
  originToken?: string;
  requestId?: string | number;
  ok?: boolean;
  data?: unknown;
  error?: string;
};

type BridgeState = {
  ready: boolean;
  nextRequestId: number;
  parentTargetOrigin: string;
  pending: Map<string | number, PendingRequest>;
  agentSurface: AgentSurfaceClient | null;
};

const state: BridgeState = {
  ready: false,
  nextRequestId: 1,
  parentTargetOrigin: '*',
  pending: new Map(),
  agentSurface: null
};

type AppBridgeWindow = Window & {
  CSRF_TOKEN?: string | null;
  ADMIN_TOKEN?: string | null;
  __BLOGPOSTER_APP_INIT_TOKENS__?: AppBridgeMessage;
};

function bridgeWindow(): AppBridgeWindow {
  return window as AppBridgeWindow;
}

function normalizeOrigin(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === 'null') return null;
  try {
    const url = new URL(raw, window.location.href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function isParentMessage(event: MessageEvent): boolean {
  if (event.source !== window.parent) return false;
  if (state.parentTargetOrigin === '*') return true;
  return normalizeOrigin(event.origin) === state.parentTargetOrigin;
}

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content?.trim() || '';
}

function boolMeta(name: string): boolean {
  const value = metaContent(name).toLowerCase();
  return value === '1' || value === 'true' || value === 'auto' || value === 'dom';
}

function numberMeta(name: string, fallback: number): number {
  const value = Number(metaContent(name));
  return Number.isFinite(value) ? value : fallback;
}

function appNameFromMessage(message: AppBridgeMessage): string {
  return String(
    message.appName ||
    metaContent('app-name') ||
    document.body.dataset.appName ||
    'app'
  ).replace(/[^A-Za-z0-9_.:-]+/g, '-');
}

function shouldStartAgentSurface(): boolean {
  return boolMeta('agent-surface') || document.body.dataset.agentSurface === 'true';
}

function messageAgentSurfaceConfig(message: AppBridgeMessage): Record<string, unknown> {
  const config = message.agentSurface;
  return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
}

function messageWantsAgentSurface(message: AppBridgeMessage): boolean {
  if (message.agentSurface === true) return true;
  if (message.agentSurface && typeof message.agentSurface === 'object' && !Array.isArray(message.agentSurface)) {
    return message.agentSurface.enabled !== false;
  }
  return false;
}

function agentSurfaceRoot(config: Record<string, unknown> = {}): ParentNode {
  const selector = metaContent('agent-surface-root') || String(config.rootSelector || config.root || '');
  if (!selector) return document.body;
  try {
    return document.querySelector(selector) || document.body;
  } catch {
    return document.body;
  }
}

function installFetchCompatibility(): void {
  const nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  if (!nativeFetch || (window as any).__blogposterAppBridgeFetchInstalled) return;
  (window as any).__blogposterAppBridgeFetchInstalled = true;

  window.fetch = function appBridgeFetch(resource: RequestInfo | URL, options: RequestInit = {}) {
    const rawUrl = typeof resource === 'string'
      ? resource
      : resource && typeof resource === 'object' && 'url' in resource
        ? String(resource.url)
        : '';
    if (rawUrl.includes('/apps/designer/origin-public-key.json')) {
      return nativeFetch(resource, {
        ...options,
        credentials: 'omit',
        mode: 'cors'
      });
    }
    return nativeFetch(resource, options);
  };
}

function request(type: string, body: Record<string, unknown>, timeout = DEFAULT_TIMEOUT): Promise<unknown> {
  if (!window.parent || window.parent === window) {
    return Promise.reject(new Error('App bridge parent unavailable'));
  }
  const requestId = state.nextRequestId++;
  const message = {
    type,
    requestId,
    ...body
  };
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      state.pending.delete(requestId);
      reject(new Error('App bridge request timed out'));
    }, timeout || DEFAULT_TIMEOUT);
    state.pending.set(requestId, { resolve, reject, timer });
    window.parent.postMessage(message, state.parentTargetOrigin);
  });
}

function installBridgeApi(): void {
  if (state.ready) return;
  state.ready = true;

  const bridgeEmit = function<T = unknown>(
    eventName: string,
    payload: MeltdownPayload = {},
    timeout = DEFAULT_TIMEOUT
  ): Promise<T> {
    return request(APP_BRIDGE_REQUEST, { eventName, payload }, timeout) as Promise<T>;
  };

  const bridgeEmitBatch = function<T = unknown>(
    events: MeltdownBatchEvent[] = [],
    _jwt: string | null = null,
    timeout = DEFAULT_TIMEOUT
  ): Promise<T[]> {
    return request(APP_BRIDGE_BATCH_REQUEST, { events }, timeout) as Promise<T[]>;
  };

  window.meltdownEmit = bridgeEmit;
  window.meltdownEmitBatch = bridgeEmitBatch;

  if (window.blogposterApi && typeof window.blogposterApi === 'object') {
    window.blogposterApi.emit = bridgeEmit;
    window.blogposterApi.emitBatch = bridgeEmitBatch;
  }
}

function maybeStartAgentSurface(message: AppBridgeMessage): void {
  if ((!shouldStartAgentSurface() && !messageWantsAgentSurface(message)) || state.agentSurface) return;
  const config = messageAgentSurfaceConfig(message);
  const appName = appNameFromMessage(message);
  const surfaceId = metaContent('agent-surface-id') || document.body.dataset.agentSurfaceId || String(config.surfaceId || `${appName}.main`);
  const title = metaContent('agent-surface-title') || String(config.title || '') || document.title || appName;
  state.agentSurface = startDomAgentSurface({
    appName,
    surfaceId,
    title,
    surfaceType: metaContent('agent-surface-type') || String(config.surfaceType || 'app-surface'),
    root: agentSurfaceRoot(config),
    snapshotIntervalMs: numberMeta('agent-snapshot-interval', Number(config.snapshotIntervalMs || 4000)),
    pollIntervalMs: numberMeta('agent-poll-interval', Number(config.pollIntervalMs || 1600))
  });
  window.blogposterAgent = {
    ...(window.blogposterAgent || {}),
    appBridgeSurface: state.agentSurface
  };
}

function rememberInitTokens(message: AppBridgeMessage): void {
  const win = bridgeWindow();
  // Designer chunks may finish loading after the parent sent its init message.
  // Keep the validated parent payload available for late app bootstraps.
  win.__BLOGPOSTER_APP_INIT_TOKENS__ = { ...message };
  if (Object.prototype.hasOwnProperty.call(message, 'csrfToken')) {
    win.CSRF_TOKEN = typeof message.csrfToken === 'string' ? message.csrfToken : null;
  }
  if (Object.prototype.hasOwnProperty.call(message, 'adminToken')) {
    win.ADMIN_TOKEN = typeof message.adminToken === 'string' ? message.adminToken : null;
  } else if (typeof win.ADMIN_TOKEN === 'undefined') {
    win.ADMIN_TOKEN = null;
  }
}

function handleInitMessage(message: AppBridgeMessage, event: MessageEvent): void {
  const origin = normalizeOrigin(event.origin);
  if (origin) state.parentTargetOrigin = origin;
  rememberInitTokens(message);
  installBridgeApi();
  maybeStartAgentSurface(message);
}

function handleResponseMessage(message: AppBridgeMessage): void {
  const entry = state.pending.get(message.requestId || '');
  if (!entry) return;
  state.pending.delete(message.requestId || '');
  window.clearTimeout(entry.timer);
  if (message.ok) {
    entry.resolve(message.data);
  } else {
    entry.reject(new Error(message.error || 'App bridge request failed'));
  }
}

export function installAppBridge(): void {
  installFetchCompatibility();

  window.addEventListener('message', (event) => {
    if (!isParentMessage(event)) return;
    const message = (event.data || {}) as AppBridgeMessage;
    if (message.type === 'init-tokens' && message.appBridge) {
      handleInitMessage(message, event);
      return;
    }

    if (message.type === APP_BRIDGE_RESPONSE) {
      handleResponseMessage(message);
    }
  });
}

export function _resetAppBridgeForTests(): void {
  const win = bridgeWindow();
  state.ready = false;
  state.nextRequestId = 1;
  state.parentTargetOrigin = '*';
  state.pending.forEach(entry => window.clearTimeout(entry.timer));
  state.pending.clear();
  state.agentSurface?.stop();
  state.agentSurface = null;
  delete win.__BLOGPOSTER_APP_INIT_TOKENS__;
}
