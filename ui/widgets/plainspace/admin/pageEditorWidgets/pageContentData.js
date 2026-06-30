import { emitRuntimeAdmin, runtimeAdminPayload } from '../../../../shared/api-client/runtimeFacade.js';
export const HTML_FOLDER = 'page-content';
export const HTML_SUBPATH = `public/${HTML_FOLDER}`;
export const HTML_WEB_BASE = `/media/${HTML_FOLDER}`;
// Keep cross-module event names, media paths, and page update payloads out of the DOM widget.
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_PAGE_CONTENT_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function toPage(value) {
    return value && typeof value === 'object' ? value : null;
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function toDesigns(value) {
    if (value &&
        typeof value === 'object' &&
        Array.isArray(value.designs)) {
        return value.designs.filter((item) => (Boolean(item) && typeof item === 'object'));
    }
    return [];
}
export function toFiles(value) {
    if (value &&
        typeof value === 'object' &&
        Array.isArray(value.files)) {
        return value.files.filter((item) => typeof item === 'string');
    }
    return [];
}
export function isHtmlFileName(fileName) {
    return /\.html?$/i.test(fileName);
}
export function toBuilderApps(value) {
    if (value &&
        typeof value === 'object' &&
        Array.isArray(value.apps)) {
        return value.apps.filter((item) => (Boolean(item) &&
            typeof item === 'object' &&
            typeof item.name === 'string'));
    }
    return [];
}
export function visibleDesigns(value) {
    return toDesigns(value).filter(template => !template.is_draft);
}
export function htmlFileUrl(name) {
    return `${HTML_WEB_BASE}/${encodeURIComponent(name)}`;
}
export function buildPageContentCommonPayload(_jwt, page) {
    return {
        pageId: page.id,
        slug: page.slug,
        status: page.status,
        seo_image: page.seo_image || '',
        parent_id: page.parent_id,
        is_content: page.is_content,
        lane: page.lane,
        language: page.language,
        title: page.title
    };
}
export function buildPageContentUpdatePayload(jwt, page, values) {
    return runtimeAdminPayload(jwt, 'pages', 'update', {
        ...buildPageContentCommonPayload(jwt, page),
        translations: [{
                language: page.language,
                title: page.title,
                html: values.html,
                css: page.css || ''
            }],
        meta: values.meta
    });
}
export function clearPageContentCache(pageDataLoader, page) {
    pageDataLoader?.clear?.('cmsAdminApiRequest', {
        moduleName: 'runtimeManager',
        moduleType: 'core',
        resource: 'pages',
        action: 'get',
        params: { pageId: page.id }
    });
}
export function detachDesignMeta(page) {
    const newMeta = { ...(page.meta || {}) };
    delete newMeta.designId;
    delete newMeta.designTitle;
    delete newMeta.designThumbnail;
    delete newMeta.layoutTemplate;
    delete newMeta.htmlFileName;
    return newMeta;
}
export function attachDesignMeta(page, template) {
    const newMeta = {
        ...(page.meta || {}),
        designId: template.id,
        designTitle: template.title,
        designThumbnail: template.thumbnail
    };
    delete newMeta.htmlFileName;
    delete newMeta.layoutTemplate;
    return newMeta;
}
export function detachHtmlMeta(page) {
    const newMeta = { ...(page.meta || {}) };
    delete newMeta.htmlFileName;
    return newMeta;
}
export function attachHtmlMeta(page, htmlFileName) {
    const newMeta = { ...(page.meta || {}), htmlFileName };
    delete newMeta.layoutTemplate;
    delete newMeta.designId;
    delete newMeta.designTitle;
    delete newMeta.designThumbnail;
    return newMeta;
}
export async function fetchBuilderApps(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'apps', 'builderList');
    return toBuilderApps(res);
}
export async function fetchPublishedDesigns(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'designer', 'list');
    return visibleDesigns(res);
}
export async function ensureHtmlContentFolder(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    try {
        await emitRuntimeAdmin(meltdownEmit, jwt, 'media', 'createLocalFolder', {
            currentPath: 'public',
            newFolderName: HTML_FOLDER
        });
    }
    catch {
        // The folder is shared across pages and usually already exists.
    }
}
export async function listHtmlFiles(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    await ensureHtmlContentFolder(meltdownEmit, jwt);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'media', 'listLocalFolder', { subPath: HTML_SUBPATH });
    return toFiles(res).filter(isHtmlFileName);
}
export async function fetchHtmlFile(fetchImpl, name) {
    const res = await fetchImpl(htmlFileUrl(name));
    return res.text();
}
export async function uploadHtmlFile(emit, jwt, fileName, html) {
    const meltdownEmit = requireEmitter(emit);
    await ensureHtmlContentFolder(meltdownEmit, jwt);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'media', 'uploadToFolder', {
        subPath: HTML_SUBPATH,
        fileName,
        fileData: btoa(unescape(encodeURIComponent(html))),
        mimeType: 'text/html'
    });
    return res && typeof res === 'object' && typeof res.fileName === 'string'
        ? res.fileName
        : fileName;
}
export async function savePageContent(emit, jwt, page, values) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('cmsAdminApiRequest', buildPageContentUpdatePayload(jwt, page, values));
}
