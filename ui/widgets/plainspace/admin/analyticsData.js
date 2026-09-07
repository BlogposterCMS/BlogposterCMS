import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';
export async function fetchAnalytics(days) {
    if (!window.meltdownEmit)
        throw new Error('ANALYTICS_EMITTER_UNAVAILABLE');
    const result = await emitRuntimeAdmin(window.meltdownEmit, window.ADMIN_TOKEN, 'analytics', 'summary', { days });
    if (result?.version !== 1 || !result.tables || !Array.isArray(result.timeline) || !result.health)
        throw new Error('ANALYTICS_RESULT_INVALID');
    return result;
}
