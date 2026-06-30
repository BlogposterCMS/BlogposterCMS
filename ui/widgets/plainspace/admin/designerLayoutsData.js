import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_DESIGNER_LAYOUTS_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function toDesigns(value) {
    if (value &&
        typeof value === 'object' &&
        Array.isArray(value.designs)) {
        return value.designs.filter((item) => (Boolean(item) && typeof item === 'object'));
    }
    return [];
}
export function designUrl(design) {
    return design.id
        ? `/admin/studio/design/${encodeURIComponent(String(design.id))}`
        : '/admin/studio/design';
}
export function designUpdatedAt(design) {
    return design.updated_at || design.created_at;
}
export function sortDesignsByRecent(designs) {
    return designs.slice().sort((a, b) => {
        const tsA = new Date(designUpdatedAt(a) || 0).getTime();
        const tsB = new Date(designUpdatedAt(b) || 0).getTime();
        return tsB - tsA;
    });
}
export async function fetchDesignerLayouts(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'designer', 'list');
    return toDesigns(res);
}
