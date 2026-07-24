import { emitRuntimeAdmin } from '/ui/shared/api-client/runtimeFacade.js';
let transport = null;
let snapshot = {
    version: 1,
    lastAppliedId: '',
    presets: []
};
let status = 'idle';
let lastErrorCode = '';
const listeners = new Set();
function normalizedId(value) {
    return String(value || '').trim().toLowerCase();
}
function normalizeSitePreset(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const source = value;
    const id = normalizedId(source.id);
    const name = String(source.name || '').trim();
    if (!id || !name)
        return null;
    return source;
}
export function normalizeSitePresetsSnapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { version: 1, lastAppliedId: '', presets: [] };
    }
    const source = value;
    const presets = Array.isArray(source.presets)
        ? source.presets.map(normalizeSitePreset).filter((preset) => Boolean(preset))
        : [];
    const lastAppliedId = normalizedId(source.lastAppliedId);
    return {
        version: 1,
        lastAppliedId: presets.some(preset => preset.id === lastAppliedId) ? lastAppliedId : '',
        presets
    };
}
function errorCode(error) {
    const explicit = error && typeof error === 'object' && 'code' in error
        ? String(error.code || '')
        : '';
    if (explicit)
        return explicit;
    const match = String(error instanceof Error ? error.message : error || '').match(/(SITE_PRESETS_[A-Z_]+)/);
    return match?.[1] || 'SITE_PRESETS_REQUEST_FAILED';
}
function publish(value) {
    snapshot = normalizeSitePresetsSnapshot(value);
    status = 'ready';
    lastErrorCode = '';
    listeners.forEach(listener => listener(getSitePresetsSnapshot()));
    document.dispatchEvent(new CustomEvent('bp:site-presets-changed', {
        detail: getSitePresetsSnapshot()
    }));
    return getSitePresetsSnapshot();
}
function requireTransport() {
    if (!transport) {
        throw new Error('SITE_PRESETS_CLIENT_NOT_CONFIGURED: Configure the Site Presets client first.');
    }
    return transport;
}
export function configureSitePresetsClient(next) {
    if (!next || typeof next.emit !== 'function') {
        throw new Error('SITE_PRESETS_EMITTER_UNAVAILABLE: A meltdown emitter is required.');
    }
    transport = next;
}
export function getSitePresetsSnapshot() {
    return {
        version: snapshot.version,
        lastAppliedId: snapshot.lastAppliedId,
        // Site Preset payloads are strictly JSON data, so this also supports
        // browser/test environments that do not expose structuredClone yet.
        presets: snapshot.presets.map(preset => JSON.parse(JSON.stringify(preset)))
    };
}
export function subscribeSitePresets(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function sitePresetsAgentState() {
    return {
        status,
        version: snapshot.version,
        presetCount: snapshot.presets.length,
        lastAppliedId: snapshot.lastAppliedId || null,
        presets: snapshot.presets.map(preset => ({
            id: preset.id,
            name: preset.name,
            source: preset.source,
            colorScheme: preset.colorScheme?.name || null,
            fontPackage: preset.fontPackage?.name || null,
            pageDemos: (preset.pageDemos || []).map(demo => ({ id: demo.id, name: demo.name }))
        })),
        errorCode: lastErrorCode || null
    };
}
export async function refreshSitePresets() {
    const current = requireTransport();
    status = 'loading';
    try {
        const result = await emitRuntimeAdmin(current.emit, current.token, 'sitePresets', 'list');
        return publish(result);
    }
    catch (error) {
        status = 'error';
        lastErrorCode = errorCode(error);
        throw error;
    }
}
async function mutate(action, params) {
    const current = requireTransport();
    try {
        const result = await emitRuntimeAdmin(current.emit, current.token, 'sitePresets', action, params);
        if (result.library)
            publish(result.library);
        return result;
    }
    catch (error) {
        status = 'error';
        lastErrorCode = errorCode(error);
        throw error;
    }
}
export async function createSitePreset(preset) {
    const result = await mutate('create', { preset });
    return result.preset || null;
}
export async function deleteSitePreset(id) {
    const result = await mutate('delete', { id });
    return result.preset || null;
}
export async function applySitePreset(id) {
    const current = requireTransport();
    try {
        const result = await emitRuntimeAdmin(current.emit, current.token, 'sitePresets', 'apply', { id });
        await refreshSitePresets();
        return result;
    }
    catch (error) {
        status = 'error';
        lastErrorCode = errorCode(error);
        throw error;
    }
}
