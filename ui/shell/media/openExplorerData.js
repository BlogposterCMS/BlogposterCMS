import { createMediaShareLink, errorMessage, listMediaFolder, toFolderListing as normalizeFolderListing } from '../../shared/media/mediaLibraryData.js';
export { errorMessage };
export function toFolderListing(value) {
    return normalizeFolderListing(value);
}
export async function listExplorerFolder(emit, jwt, subPath) {
    return listMediaFolder(emit, jwt, subPath);
}
export async function createExplorerShareLink(emit, jwt, filePath) {
    return createMediaShareLink(emit, jwt, filePath);
}
