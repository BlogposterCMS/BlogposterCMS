import { emitRuntimeAdmin, runtimeAdminPayload } from '../../../shared/api-client/runtimeFacade.js';
export const loginStrategyScopes = ['admin', 'public', 'both'];
// Keep strategy setting keys and settings facade payloads out of the DOM widget.
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_LOGIN_STRATEGY_EDIT_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function asSetting(value, fallback = '') {
    return value == null ? fallback : String(value);
}
export function normalizeScope(value) {
    const candidate = String(value);
    return loginStrategyScopes.includes(candidate)
        ? candidate
        : 'admin';
}
export function strategySettingKey(strategy, suffix) {
    return `${strategy.toUpperCase()}_${suffix}`;
}
export function buildLoginStrategySettingPayloads(jwt, strategy, settings) {
    return [
        runtimeAdminPayload(jwt, 'settings', 'set', {
            key: strategySettingKey(strategy, 'CLIENT_ID'),
            value: settings.clientId
        }),
        runtimeAdminPayload(jwt, 'settings', 'set', {
            key: strategySettingKey(strategy, 'CLIENT_SECRET'),
            value: settings.clientSecret
        }),
        runtimeAdminPayload(jwt, 'settings', 'set', {
            key: strategySettingKey(strategy, 'SCOPE'),
            value: settings.scope
        })
    ];
}
export async function fetchLoginStrategySettings(emit, jwt, strategy) {
    const meltdownEmit = requireEmitter(emit);
    const [clientId, clientSecret, scope] = await Promise.all([
        emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: strategySettingKey(strategy, 'CLIENT_ID') }),
        emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: strategySettingKey(strategy, 'CLIENT_SECRET') }),
        emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: strategySettingKey(strategy, 'SCOPE') })
    ]);
    return {
        clientId: asSetting(clientId),
        clientSecret: asSetting(clientSecret),
        scope: normalizeScope(scope)
    };
}
export async function saveLoginStrategySettings(emit, jwt, strategy, settings) {
    const meltdownEmit = requireEmitter(emit);
    for (const payload of buildLoginStrategySettingPayloads(jwt, strategy, settings)) {
        await meltdownEmit('cmsAdminApiRequest', payload);
    }
}
