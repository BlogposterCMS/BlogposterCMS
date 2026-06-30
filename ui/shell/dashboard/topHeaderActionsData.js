import { emitRuntimeAdmin, runtimeAdminPayload } from '../../shared/api-client/runtimeFacade.js';
// SettingsManager payloads stay in this data helper so the header UI only
// coordinates controls and visible state.
const MAINTENANCE_SETTING = {
    resource: 'settings',
    action: 'get',
    key: 'MAINTENANCE_MODE'
};
const PROJECT_NAME_SETTING = {
    resource: 'settings',
    action: 'get',
    key: 'SITE_TITLE'
};
export const PROJECT_NAME_FALLBACK = 'Blogposter';
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('SHELL_TOP_HEADER_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function buildMaintenanceSettingPayload(jwt, extra = {}) {
    return buildSettingPayload(MAINTENANCE_SETTING, jwt, extra);
}
export function buildProjectNameSettingPayload(jwt, extra = {}) {
    return buildSettingPayload(PROJECT_NAME_SETTING, jwt, extra);
}
function buildSettingPayload(setting, jwt, extra = {}) {
    return runtimeAdminPayload(jwt, setting.resource, String(extra.value === undefined ? 'get' : 'set'), { key: setting.key, ...extra });
}
export function parseMaintenanceValue(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
    }
    if (value && typeof value === 'object' && 'value' in value) {
        const raw = value.value;
        return typeof raw === 'string' ? raw.toLowerCase() === 'true' : Boolean(raw);
    }
    return false;
}
export function parseSettingText(value, fallback = PROJECT_NAME_FALLBACK) {
    const raw = value && typeof value === 'object' && 'value' in value
        ? value.value
        : value;
    const text = typeof raw === 'string'
        ? raw.trim()
        : raw == null
            ? ''
            : String(raw).trim();
    return text || fallback;
}
export async function fetchMaintenanceMode(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const value = await emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: 'MAINTENANCE_MODE' });
    return parseMaintenanceValue(value);
}
export async function fetchProjectName(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const value = await emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: 'SITE_TITLE' });
    return parseSettingText(value);
}
export async function disableMaintenanceMode(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'set', { key: 'MAINTENANCE_MODE', value: 'false' });
}
