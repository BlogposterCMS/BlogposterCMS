import { emitRuntimeAdmin } from '../../../../shared/api-client/runtimeFacade.js';
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_CONTENT_SUMMARY_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
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
export function toPages(value) {
    const items = Array.isArray(value)
        ? value
        : value && typeof value === 'object' && Array.isArray(value.data)
            ? value.data
            : [];
    return items.filter((item) => Boolean(item) && typeof item === 'object');
}
export function uploadedContentPages(value) {
    return toPages(value).filter(page => (page.is_content &&
        !page.meta?.layoutTemplate &&
        page.lane === 'public'));
}
export function decodeAdminId(jwt, decodeBase64 = typeof globalThis.atob === 'function'
    ? globalThis.atob.bind(globalThis)
    : undefined) {
    if (!jwt || typeof jwt !== 'string')
        return null;
    if (!decodeBase64)
        return null;
    const parts = jwt.split('.');
    const payload = parts[1];
    if (!payload)
        return null;
    try {
        const json = JSON.parse(decodeBase64(payload));
        return json.userId || json.sub || json.id || json.user?.id || null;
    }
    catch {
        return null;
    }
}
export function buildDefaultDesignTitle(timestamp, locale) {
    const titleStamp = timestamp.toLocaleString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    return `New Design ${titleStamp}`;
}
export function buildDraftDesignRecord(ownerId, title) {
    return {
        id: null,
        title,
        description: '',
        thumbnail: '',
        ownerId: ownerId || '',
        bgColor: '',
        bgMediaId: '',
        bgMediaUrl: '',
        version: 0,
        isLayout: false,
        isGlobal: false,
        isDraft: true
    };
}
export function designIdFromResult(value) {
    if (!value || typeof value !== 'object')
        return null;
    const result = value;
    return typeof result.id === 'string' || typeof result.id === 'number'
        ? result.id
        : typeof result.designId === 'string' || typeof result.designId === 'number'
            ? result.designId
            : null;
}
export async function fetchContentDesigns(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'designer', 'list');
    return toDesigns(res);
}
export async function fetchUploadedContentPages(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'list');
    return uploadedContentPages(res);
}
export async function createDraftDesign(emit, jwt, ownerId, timestamp = new Date()) {
    const meltdownEmit = requireEmitter(emit);
    const title = buildDefaultDesignTitle(timestamp);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'designer', 'save', {
        design: buildDraftDesignRecord(ownerId, title),
        widgets: [],
        layout: null
    }, 20000);
    return designIdFromResult(res);
}
