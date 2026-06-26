export const loginStrategyScopes = ['admin', 'public', 'both'];
const SETTINGS_MODULE = {
    moduleName: 'settingsManager',
    moduleType: 'core'
};
// Keep strategy setting keys and settingsManager payloads out of the DOM widget.
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
        {
            jwt,
            ...SETTINGS_MODULE,
            key: strategySettingKey(strategy, 'CLIENT_ID'),
            value: settings.clientId
        },
        {
            jwt,
            ...SETTINGS_MODULE,
            key: strategySettingKey(strategy, 'CLIENT_SECRET'),
            value: settings.clientSecret
        },
        {
            jwt,
            ...SETTINGS_MODULE,
            key: strategySettingKey(strategy, 'SCOPE'),
            value: settings.scope
        }
    ];
}
export async function fetchLoginStrategySettings(emit, jwt, strategy) {
    const meltdownEmit = requireEmitter(emit);
    const [clientId, clientSecret, scope] = await Promise.all([
        meltdownEmit('getSetting', {
            jwt,
            ...SETTINGS_MODULE,
            key: strategySettingKey(strategy, 'CLIENT_ID')
        }),
        meltdownEmit('getSetting', {
            jwt,
            ...SETTINGS_MODULE,
            key: strategySettingKey(strategy, 'CLIENT_SECRET')
        }),
        meltdownEmit('getSetting', {
            jwt,
            ...SETTINGS_MODULE,
            key: strategySettingKey(strategy, 'SCOPE')
        })
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
        await meltdownEmit('setSetting', payload);
    }
}
