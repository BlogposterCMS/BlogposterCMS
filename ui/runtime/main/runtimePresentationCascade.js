import { fetchRuntimePageById } from './runtimePageData.js';
const MAX_PRESENTATION_PARENT_DEPTH = 16;
function plainMeta(page = {}) {
    return page.meta && typeof page.meta === 'object' && !Array.isArray(page.meta)
        ? page.meta
        : {};
}
function scalarValue(value) {
    return typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : '';
}
function isExplicitFalse(value) {
    if (value === false)
        return true;
    return ['0', 'false', 'no', 'off'].includes(String(value || '').trim().toLowerCase());
}
function parentIdFor(page = {}) {
    return page.parentId ?? page.parent_id ?? null;
}
function sourceFromPage(page, sourcePage, inherited, depth) {
    const meta = plainMeta(sourcePage);
    const designId = sourcePage.designId ?? sourcePage.design_id ?? meta.designId ?? meta.design_id;
    if (scalarValue(designId)) {
        return { page, sourcePage, inherited, depth, designId };
    }
    const layoutTemplate = scalarValue(meta.layoutTemplate ?? meta.layout_template);
    if (layoutTemplate) {
        return { page, sourcePage, inherited, depth, layoutTemplate };
    }
    return null;
}
export function inheritsRuntimePresentation(page = {}) {
    const meta = plainMeta(page);
    return !(isExplicitFalse(meta.inheritParentDesign) ||
        isExplicitFalse(meta.inheritPresentation) ||
        isExplicitFalse(meta.inheritDesign));
}
export async function resolveRuntimePresentationCascade(page, emit, lane, maxDepth = MAX_PRESENTATION_PARENT_DEPTH) {
    const local = sourceFromPage(page, page, false, 0);
    if (local || !inheritsRuntimePresentation(page))
        return local;
    const seen = new Set();
    if (page.id !== null && typeof page.id !== 'undefined')
        seen.add(String(page.id));
    let parentId = parentIdFor(page);
    for (let depth = 1; parentId && depth <= maxDepth; depth += 1) {
        const parentKey = String(parentId);
        if (seen.has(parentKey)) {
            console.warn('[Renderer] RUNTIME_PRESENTATION_CASCADE_CYCLE', parentKey);
            return null;
        }
        seen.add(parentKey);
        let parentPage = null;
        try {
            parentPage = await fetchRuntimePageById(emit, parentId, lane);
        }
        catch (err) {
            console.warn('[Renderer] RUNTIME_PRESENTATION_CASCADE_LOOKUP_FAILED', parentId, err);
            return null;
        }
        if (!parentPage)
            return null;
        const inherited = sourceFromPage(page, parentPage, true, depth);
        if (inherited)
            return inherited;
        if (!inheritsRuntimePresentation(parentPage))
            return null;
        parentId = parentIdFor(parentPage);
    }
    return null;
}
