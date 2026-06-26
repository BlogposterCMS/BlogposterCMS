import { createMediaFolder as createSharedMediaFolder, createMediaShareLink as createSharedMediaShareLink, deleteMediaItem, errorMessage, listMediaFolder as listSharedMediaFolder, mediaItemPath, mediaUploadUrl, renameMediaItem, toFolderListing, uploadMediaFile } from '../../../shared/media/mediaLibraryData.js';
export { deleteMediaItem, errorMessage, mediaItemPath, mediaUploadUrl, renameMediaItem, uploadMediaFile };
export function toListing(value) {
    return toFolderListing(value);
}
export async function createMediaFolder(emit, jwt, currentPath, newFolderName) {
    return createSharedMediaFolder(emit, jwt, currentPath, newFolderName);
}
export async function listMediaFolder(emit, jwt, subPath) {
    return listSharedMediaFolder(emit, jwt, subPath);
}
export async function createMediaShareLink(emit, jwt, filePath) {
    const result = await createSharedMediaShareLink(emit, jwt, filePath);
    return result.shareURL || '';
}
