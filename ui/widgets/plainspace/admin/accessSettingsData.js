import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('meltdownEmit unavailable');
    }
    return emit;
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function asBooleanSetting(value) {
    return String(value).toLowerCase() === 'true';
}
function agentAccessEndpoint(path, basePath = '/admin/api/agent-access') {
    return `${basePath.replace(/\/+$/g, '')}${path.startsWith('/') ? path : `/${path}`}`;
}
function fetchImplFromOptions(options = {}) {
    if (options.fetchImpl)
        return options.fetchImpl;
    if (typeof window.fetchWithTimeout === 'function')
        return window.fetchWithTimeout;
    return fetch.bind(globalThis);
}
async function parseAgentAccessResponse(response) {
    let payload;
    try {
        payload = await response.json();
    }
    catch {
        throw new Error('AGENT_ACCESS_INVALID_RESPONSE');
    }
    if (!response.ok || payload.error) {
        throw new Error(payload.code ? `${payload.code}: ${payload.error}` : payload.error || 'AGENT_ACCESS_REQUEST_FAILED');
    }
    return payload.data;
}
async function requestAgentAccess(path, init, options = {}) {
    const headers = {
        ...init.headers
    };
    if (options.csrfToken)
        headers['X-CSRF-Token'] = options.csrfToken;
    if (options.adminToken)
        headers.Authorization = `Bearer ${options.adminToken}`;
    const response = await fetchImplFromOptions(options)(agentAccessEndpoint(path, options.basePath), {
        credentials: 'same-origin',
        ...init,
        headers
    });
    return parseAgentAccessResponse(response);
}
export async function fetchAccessSettings(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const [allowRegistrationRaw, firstInstallRaw] = await Promise.all([
        emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: 'ALLOW_REGISTRATION' }),
        emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: 'FIRST_INSTALL_DONE' })
    ]);
    return {
        allowRegistration: asBooleanSetting(allowRegistrationRaw),
        firstInstallDone: asBooleanSetting(firstInstallRaw)
    };
}
export async function setAllowRegistration(emit, jwt, allowed) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'set', {
        key: 'ALLOW_REGISTRATION',
        value: allowed ? 'true' : 'false'
    });
}
export async function listAgentAccessCodes(options = {}) {
    return requestAgentAccess('/codes', { method: 'GET' }, options);
}
export async function createAgentAccessCode(payload, options = {}) {
    return requestAgentAccess('/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }, options);
}
export async function revokeAgentAccessCode(codeId, options = {}) {
    return requestAgentAccess(`/codes/${encodeURIComponent(codeId)}`, {
        method: 'DELETE'
    }, options);
}
