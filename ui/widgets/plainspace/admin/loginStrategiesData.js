function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('meltdownEmit unavailable');
    }
    return emit;
}
function toArray(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object' && Array.isArray(value.data)) {
        return value.data;
    }
    return [];
}
export function toStrategies(value) {
    return toArray(value).filter((item) => (Boolean(item) &&
        typeof item === 'object' &&
        typeof item.name === 'string'));
}
export function visibleLoginStrategies(strategies) {
    return strategies.filter(strategy => strategy.name !== 'adminLocal');
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export async function fetchLoginStrategies(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('listLoginStrategies', {
        jwt,
        moduleName: 'auth',
        moduleType: 'core'
    });
    return visibleLoginStrategies(toStrategies(res));
}
export async function setLoginStrategyEnabled(emit, jwt, strategyName, enabled) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('setLoginStrategyEnabled', {
        jwt,
        moduleName: 'auth',
        moduleType: 'core',
        strategyName,
        enabled
    });
}
