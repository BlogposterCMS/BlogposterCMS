import { startDomAgentSurface } from '../agent/agentSurfaceClient';
export const APP_BRIDGE_REQUEST = 'cms-app-runtime-request';
export const APP_BRIDGE_BATCH_REQUEST = 'cms-app-runtime-batch-request';
export const APP_BRIDGE_RESPONSE = 'cms-app-runtime-response';
const DEFAULT_TIMEOUT = 10000;
const state = {
    ready: false,
    nextRequestId: 1,
    parentTargetOrigin: '*',
    pending: new Map(),
    agentSurface: null
};
function bridgeWindow() {
    return window;
}
function normalizeOrigin(value) {
    if (!value)
        return null;
    const raw = String(value).trim();
    if (!raw || raw.toLowerCase() === 'null')
        return null;
    try {
        const url = new URL(raw, window.location.href);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
    }
    catch {
        return null;
    }
}
function isParentMessage(event) {
    if (event.source !== window.parent)
        return false;
    if (state.parentTargetOrigin === '*')
        return true;
    return normalizeOrigin(event.origin) === state.parentTargetOrigin;
}
function metaContent(name) {
    return document.querySelector(`meta[name="${name}"]`)?.content?.trim() || '';
}
function boolMeta(name) {
    const value = metaContent(name).toLowerCase();
    return value === '1' || value === 'true' || value === 'auto' || value === 'dom';
}
function numberMeta(name, fallback) {
    const value = Number(metaContent(name));
    return Number.isFinite(value) ? value : fallback;
}
function appNameFromMessage(message) {
    return String(message.appName ||
        metaContent('app-name') ||
        document.body.dataset.appName ||
        'app').replace(/[^A-Za-z0-9_.:-]+/g, '-');
}
function shouldStartAgentSurface() {
    return boolMeta('agent-surface') || document.body.dataset.agentSurface === 'true';
}
function messageAgentSurfaceConfig(message) {
    const config = message.agentSurface;
    return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
}
function messageWantsAgentSurface(message) {
    if (message.agentSurface === true)
        return true;
    if (message.agentSurface && typeof message.agentSurface === 'object' && !Array.isArray(message.agentSurface)) {
        return message.agentSurface.enabled !== false;
    }
    return false;
}
function agentSurfaceRoot(config = {}) {
    const selector = metaContent('agent-surface-root') || String(config.rootSelector || config.root || '');
    if (!selector)
        return document.body;
    try {
        return document.querySelector(selector) || document.body;
    }
    catch {
        return document.body;
    }
}
function installFetchCompatibility() {
    const nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
    if (!nativeFetch || window.__blogposterAppBridgeFetchInstalled)
        return;
    window.__blogposterAppBridgeFetchInstalled = true;
    window.fetch = function appBridgeFetch(resource, options = {}) {
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
function request(type, body, timeout = DEFAULT_TIMEOUT) {
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
function installBridgeApi() {
    if (state.ready)
        return;
    state.ready = true;
    const bridgeEmit = function (eventName, payload = {}, timeout = DEFAULT_TIMEOUT) {
        return request(APP_BRIDGE_REQUEST, { eventName, payload }, timeout);
    };
    const bridgeEmitBatch = function (events = [], _jwt = null, timeout = DEFAULT_TIMEOUT) {
        return request(APP_BRIDGE_BATCH_REQUEST, { events }, timeout);
    };
    window.meltdownEmit = bridgeEmit;
    window.meltdownEmitBatch = bridgeEmitBatch;
    if (window.blogposterApi && typeof window.blogposterApi === 'object') {
        window.blogposterApi.emit = bridgeEmit;
        window.blogposterApi.emitBatch = bridgeEmitBatch;
    }
}
function maybeStartAgentSurface(message) {
    if ((!shouldStartAgentSurface() && !messageWantsAgentSurface(message)) || state.agentSurface)
        return;
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
function rememberInitTokens(message) {
    const win = bridgeWindow();
    // Designer chunks may finish loading after the parent sent its init message.
    // Keep the validated parent payload available for late app bootstraps.
    win.__BLOGPOSTER_APP_INIT_TOKENS__ = { ...message };
    if (Object.prototype.hasOwnProperty.call(message, 'csrfToken')) {
        win.CSRF_TOKEN = typeof message.csrfToken === 'string' ? message.csrfToken : null;
    }
    if (Object.prototype.hasOwnProperty.call(message, 'adminToken')) {
        win.ADMIN_TOKEN = typeof message.adminToken === 'string' ? message.adminToken : null;
    }
    else if (typeof win.ADMIN_TOKEN === 'undefined') {
        win.ADMIN_TOKEN = null;
    }
}
function handleInitMessage(message, event) {
    const origin = normalizeOrigin(event.origin);
    if (origin)
        state.parentTargetOrigin = origin;
    rememberInitTokens(message);
    installBridgeApi();
    maybeStartAgentSurface(message);
}
function handleResponseMessage(message) {
    const entry = state.pending.get(message.requestId || '');
    if (!entry)
        return;
    state.pending.delete(message.requestId || '');
    window.clearTimeout(entry.timer);
    if (message.ok) {
        entry.resolve(message.data);
    }
    else {
        entry.reject(new Error(message.error || 'App bridge request failed'));
    }
}
export function installAppBridge() {
    installFetchCompatibility();
    window.addEventListener('message', (event) => {
        if (!isParentMessage(event))
            return;
        const message = (event.data || {});
        if (message.type === 'init-tokens' && message.appBridge) {
            handleInitMessage(message, event);
            return;
        }
        if (message.type === APP_BRIDGE_RESPONSE) {
            handleResponseMessage(message);
        }
    });
}
export function _resetAppBridgeForTests() {
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
