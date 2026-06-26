const MEDIA_MODULE = {
    moduleName: 'mediaManager',
    moduleType: 'core'
};
const SHARE_MODULE = {
    moduleName: 'shareManager',
    moduleType: 'core'
};
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('MEDIA_LIBRARY_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
function requireUploadFetch(uploadFetch) {
    if (typeof uploadFetch === 'function')
        return uploadFetch;
    if (typeof fetch === 'function') {
        return (resource, options) => fetch(resource, options);
    }
    throw new Error('MEDIA_LIBRARY_FETCH_UNAVAILABLE: fetchWithTimeout unavailable');
}
function toStringArray(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === 'string')
        : [];
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function toFolderListing(value) {
    const candidate = value && typeof value === 'object'
        ? value
        : {};
    return {
        folders: toStringArray(candidate.folders),
        files: toStringArray(candidate.files),
        parentPath: typeof candidate.parentPath === 'string' ? candidate.parentPath : '',
        currentPath: typeof candidate.currentPath === 'string' ? candidate.currentPath : ''
    };
}
export function mediaItemPath(path, name) {
    return path ? `${path}/${name}` : name;
}
export function mediaUploadUrl(currentPath) {
    return `/admin/api/upload?subPath=${encodeURIComponent(currentPath)}`;
}
export async function uploadMediaFile(uploadFetch, csrfToken, currentPath, file) {
    const request = requireUploadFetch(uploadFetch);
    const form = new FormData();
    form.append('file', file);
    const resp = await request(mediaUploadUrl(currentPath), {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken || '' },
        body: form,
        credentials: 'same-origin'
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || json.error) {
        throw new Error(json.error || resp.statusText || 'MEDIA_LIBRARY_UPLOAD_FAILED');
    }
}
export async function createMediaFolder(emit, jwt, currentPath, newFolderName) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('createLocalFolder', {
        jwt,
        ...MEDIA_MODULE,
        currentPath,
        newFolderName
    });
}
export async function listMediaFolder(emit, jwt, subPath) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('listLocalFolder', {
        jwt,
        ...MEDIA_MODULE,
        subPath
    });
    return toFolderListing(res);
}
export async function renameMediaItem(emit, jwt, currentPath, oldName, newName) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('renameLocalItem', {
        jwt,
        ...MEDIA_MODULE,
        currentPath,
        oldName,
        newName
    });
}
export async function deleteMediaItem(emit, jwt, currentPath, itemName) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('deleteLocalItem', {
        jwt,
        ...MEDIA_MODULE,
        currentPath,
        itemName
    });
}
export async function createMediaShareLink(emit, jwt, filePath) {
    const meltdownEmit = requireEmitter(emit);
    const result = await meltdownEmit('createShareLink', {
        jwt,
        ...SHARE_MODULE,
        filePath
    });
    return result && typeof result === 'object'
        ? result
        : {};
}
