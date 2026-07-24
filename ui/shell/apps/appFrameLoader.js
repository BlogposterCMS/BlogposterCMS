import { APP_BRIDGE_BATCH_REQUEST, APP_BRIDGE_REQUEST, APP_BRIDGE_RESPONSE, dispatchAppLifecycleMessage, dispatchAppRuntimeBatch, dispatchAppRuntimeRequest } from './appFrameLoaderData.js';
const csrfMeta = document.querySelector('meta[name="csrf-token"]');
const adminMeta = document.querySelector('meta[name="admin-token"]');
const appMeta = document.querySelector('meta[name="app-name"]');
const agentSurfaceMeta = document.querySelector('meta[name="app-agent-surface"]');
window.CSRF_TOKEN = csrfMeta ? csrfMeta.content : null;
window.ADMIN_TOKEN = adminMeta ? adminMeta.content : null;
const appName = appMeta ? appMeta.content : '';
const frame = document.getElementById('app-frame');
// Module scripts can attach after a very fast same-host iframe has already
// fired load, so retry the bootstrap token message briefly after registration.
const INIT_TOKEN_RETRY_DELAYS_MS = [0, 150, 750, 1500, 3000, 6000];
const APP_PREFERENCE_EVENT_GET = 'appPreference.get';
const APP_PREFERENCE_EVENT_SET = 'appPreference.set';
const APP_PREFERENCE_STORAGE_PREFIX = 'blogposter.appPreference.v1';
const APP_PREFERENCE_KEY_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/i;
const APP_PREFERENCE_MAX_JSON_LENGTH = 4096;
function normalizeOrigin(value) {
    if (!value)
        return null;
    const raw = String(value).trim();
    if (!raw || raw.toLowerCase() === 'null')
        return null;
    try {
        const url = new URL(raw, window.location.href);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return url.origin;
        }
        console.warn('[AppFrame] Ignoring unsupported origin protocol', raw);
        return null;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[AppFrame] Ignoring invalid origin value', value, message);
        return null;
    }
}
function parseOrigins(value) {
    return String(value || '')
        .split(',')
        .map(part => normalizeOrigin(part.trim()))
        .filter((origin) => Boolean(origin));
}
function isOpaqueOrigin(origin) {
    return String(origin || '').trim().toLowerCase() === 'null';
}
function isTrustedMessageOrigin(origin, allowedOrigins) {
    return allowedOrigins.includes(origin) || isOpaqueOrigin(origin);
}
function getFramePostTarget(frameOrigin) {
    const sandboxAttr = frame?.getAttribute('sandbox') || '';
    return sandboxAttr && !sandboxAttr.includes('allow-same-origin')
        ? '*'
        : frameOrigin;
}
function parseAgentSurfaceConfig(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return null;
    const lower = raw.toLowerCase();
    if (lower === '1' || lower === 'true' || lower === 'auto' || lower === 'dom')
        return true;
    if (lower === '0' || lower === 'false' || lower === 'off')
        return false;
    try {
        const parsed = JSON.parse(raw);
        if (parsed === true || parsed === false)
            return parsed;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            return parsed;
    }
    catch {
        console.warn('[AppFrame] Ignoring invalid app-agent-surface metadata');
    }
    return null;
}
function postFrameMessage(message, targetOrigin) {
    if (!frame?.contentWindow)
        return;
    frame.contentWindow.postMessage(message, targetOrigin);
}
function normalizeThemeMode(value) {
    return value === 'light' || value === 'dark' ? value : 'system';
}
function appPreferencePayload(payload) {
    return payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : {};
}
function appPreferenceStorageKey(keyValue) {
    const key = String(keyValue || '').trim();
    if (!APP_PREFERENCE_KEY_PATTERN.test(key)) {
        throw new Error('SHELL_APP_PREFERENCE_KEY_INVALID: preference key must be 1-64 safe characters');
    }
    if (!APP_PREFERENCE_KEY_PATTERN.test(appName)) {
        throw new Error('SHELL_APP_PREFERENCE_APP_INVALID: app name cannot own browser preferences');
    }
    // Each app receives a private namespace. Sandboxed children never receive
    // raw localStorage access and cannot read or overwrite another app's values.
    return `${APP_PREFERENCE_STORAGE_PREFIX}.${appName}.${key}`;
}
function readAppPreference(payload) {
    const options = appPreferencePayload(payload);
    const storageKey = appPreferenceStorageKey(options.key);
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw === null)
            return { found: false, value: null };
        return { found: true, value: JSON.parse(raw) };
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`SHELL_APP_PREFERENCE_READ_FAILED: ${detail}`);
    }
}
function writeAppPreference(payload) {
    const options = appPreferencePayload(payload);
    const storageKey = appPreferenceStorageKey(options.key);
    let serialized = '';
    try {
        serialized = JSON.stringify(options.value);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`SHELL_APP_PREFERENCE_VALUE_INVALID: ${detail}`);
    }
    if (!serialized || serialized.length > APP_PREFERENCE_MAX_JSON_LENGTH) {
        throw new Error(`SHELL_APP_PREFERENCE_VALUE_INVALID: value exceeds ${APP_PREFERENCE_MAX_JSON_LENGTH} bytes`);
    }
    try {
        window.localStorage.setItem(storageKey, serialized);
        return { stored: true };
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`SHELL_APP_PREFERENCE_WRITE_FAILED: ${detail}`);
    }
}
async function runParentLocalEvent(eventName, payload) {
    if (eventName === APP_PREFERENCE_EVENT_GET) {
        return readAppPreference(payload);
    }
    if (eventName === APP_PREFERENCE_EVENT_SET) {
        return writeAppPreference(payload);
    }
    if ((eventName === 'openExplorer' || eventName === 'openMediaExplorer') &&
        typeof window._openMediaExplorer === 'function') {
        const options = payload && typeof payload === 'object'
            ? payload
            : {};
        return window._openMediaExplorer({
            ...options,
            jwt: window.ADMIN_TOKEN
        });
    }
    return undefined;
}
async function dispatchAppBridgeRequest(msg) {
    const eventName = String(msg.eventName || '').trim();
    const localResult = await runParentLocalEvent(eventName, msg.payload);
    if (typeof localResult !== 'undefined') {
        return localResult;
    }
    return dispatchAppRuntimeRequest(window.meltdownEmit, window.ADMIN_TOKEN, appName, eventName, msg.payload);
}
async function dispatchAppBridgeBatch(msg) {
    return dispatchAppRuntimeBatch(window.meltdownEmit, window.ADMIN_TOKEN, appName, msg.events);
}
async function handleBridgeMessage(msg, responseTarget) {
    if (msg.type !== APP_BRIDGE_REQUEST && msg.type !== APP_BRIDGE_BATCH_REQUEST) {
        return false;
    }
    const requestId = msg.requestId;
    try {
        const data = msg.type === APP_BRIDGE_BATCH_REQUEST
            ? await dispatchAppBridgeBatch(msg)
            : await dispatchAppBridgeRequest(msg);
        postFrameMessage({ type: APP_BRIDGE_RESPONSE, requestId, ok: true, data }, responseTarget);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        postFrameMessage({ type: APP_BRIDGE_RESPONSE, requestId, ok: false, error: message }, responseTarget);
    }
    return true;
}
export function initAppFrameLoader() {
    if (!frame)
        return;
    const originToken = frame.dataset.originToken || '';
    const metaOrigins = parseOrigins(document.querySelector('meta[name="app-frame-allowed-origins"]')?.content);
    const dataOrigins = parseOrigins(frame.dataset.allowedOrigins);
    const allowedOrigins = Array.from(new Set([...metaOrigins, ...dataOrigins]));
    if (!allowedOrigins.length) {
        allowedOrigins.push(window.location.origin);
    }
    const frameOrigin = normalizeOrigin(frame.getAttribute('src')) || window.location.origin;
    const framePostTarget = getFramePostTarget(frameOrigin);
    const agentSurfaceConfig = parseAgentSurfaceConfig(agentSurfaceMeta?.content || frame.dataset.agentSurface);
    const buildInitMessage = () => {
        const initMessage = {
            type: 'init-tokens',
            csrfToken: window.CSRF_TOKEN,
            adminToken: null,
            appBridge: true,
            appName,
            themeMode: normalizeThemeMode(document.documentElement.dataset.themeMode),
            allowedOrigins
        };
        if (agentSurfaceConfig !== null) {
            initMessage.agentSurface = agentSurfaceConfig;
        }
        if (originToken) {
            initMessage.originToken = originToken;
        }
        return initMessage;
    };
    const sendInitTokens = () => {
        if (!frame.contentWindow) {
            console.warn('[AppFrame] SHELL_APP_FRAME_INIT_TARGET_MISSING: app frame contentWindow is unavailable');
            return;
        }
        frame.contentWindow.postMessage(buildInitMessage(), framePostTarget);
    };
    frame.addEventListener('load', sendInitTokens);
    INIT_TOKEN_RETRY_DELAYS_MS.forEach(delayMs => {
        window.setTimeout(sendInitTokens, delayMs);
    });
    window.addEventListener('message', async (ev) => {
        if (!frame.contentWindow || ev.source !== frame.contentWindow)
            return;
        if (!isTrustedMessageOrigin(ev.origin, allowedOrigins))
            return;
        const msg = (ev.data || {});
        const responseTarget = isOpaqueOrigin(ev.origin) ? '*' : ev.origin;
        if (await handleBridgeMessage(msg, responseTarget))
            return;
        if (!msg.type || !window.meltdownEmit)
            return;
        dispatchAppLifecycleMessage(window.meltdownEmit, window.ADMIN_TOKEN, appName, msg.type, msg.data)
            .catch(e => console.warn('[AppFrame] dispatch failed', e));
    });
}
initAppFrameLoader();
