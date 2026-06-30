import { emitRuntimeAdmin } from '../../shared/api-client/runtimeFacade.js';
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('SHELL_PAGE_PICKER_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
function isPageRecord(value) {
    return Boolean(value) &&
        typeof value === 'object' &&
        (typeof value.pageId === 'string' || typeof value.pageId === 'number');
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function toPages(value) {
    const rawPages = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
            ? (value.pages || [])
            : [];
    return rawPages.filter(isPageRecord);
}
export function slugFromPageLookup(value) {
    const data = value && typeof value === 'object'
        ? value.data
        : undefined;
    return typeof data?.slug === 'string' && data.slug ? data.slug : null;
}
export async function fetchPublicPages(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'byLane', {
        lane: 'public'
    });
    return toPages(res);
}
export async function savePageOrder(emit, jwt, pageId, newOrder) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'update', {
        pageId,
        newOrder
    });
}
export async function createPublicPageForPicker(emit, jwt, title, slug) {
    const meltdownEmit = requireEmitter(emit);
    const result = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'create', {
        title,
        slug,
        lane: 'public',
        status: 'published'
    });
    const pageId = result && typeof result === 'object'
        ? result.pageId
        : undefined;
    if (pageId === undefined) {
        throw new Error('SHELL_PAGE_PICKER_PAGE_ID_UNAVAILABLE: Page creation did not return a pageId');
    }
    return pageId;
}
export async function fetchPageSlugById(emit, jwt, pageId) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'get', {
        pageId
    });
    const slug = slugFromPageLookup(res);
    if (!slug) {
        throw new Error('SHELL_PAGE_PICKER_CREATED_SLUG_UNAVAILABLE: Created page slug could not be resolved');
    }
    return slug;
}
