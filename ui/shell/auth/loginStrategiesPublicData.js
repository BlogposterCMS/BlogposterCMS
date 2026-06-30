import { emitRuntimePublic } from '../../shared/api-client/runtimeFacade.js';
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('SHELL_LOGIN_STRATEGIES_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
function isLoginStrategy(value) {
    return Boolean(value) && typeof value === 'object';
}
export function strategyList(value) {
    const raw = Array.isArray(value)
        ? value
        : value && typeof value === 'object' && Array.isArray(value.data)
            ? value.data || []
            : [];
    return raw.filter(isLoginStrategy);
}
export function publicStrategies(value) {
    return strategyList(value).filter(strategy => strategy.name !== 'adminLocal' && (strategy.scope === 'public' || strategy.scope === 'global'));
}
export async function issueLoginPublicToken(emit) {
    const meltdownEmit = requireEmitter(emit);
    return meltdownEmit('issuePublicToken', {
        purpose: 'login',
        moduleName: 'auth'
    });
}
export async function fetchPublicLoginStrategies(emit) {
    const meltdownEmit = requireEmitter(emit);
    const loginJwt = await issueLoginPublicToken(meltdownEmit);
    const response = await emitRuntimePublic(meltdownEmit, loginJwt, 'auth', 'activeLoginStrategies');
    return publicStrategies(response);
}
