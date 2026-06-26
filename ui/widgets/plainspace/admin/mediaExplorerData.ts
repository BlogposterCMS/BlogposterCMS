import {
  createMediaFolder as createSharedMediaFolder,
  createMediaShareLink as createSharedMediaShareLink,
  deleteMediaItem,
  errorMessage,
  listMediaFolder as listSharedMediaFolder,
  mediaItemPath,
  mediaUploadUrl,
  renameMediaItem,
  toFolderListing,
  uploadMediaFile,
  type FolderListing,
  type MediaUploadFetch
} from '../../../shared/media/mediaLibraryData.js';

export type { FolderListing, MediaUploadFetch };
export {
  deleteMediaItem,
  errorMessage,
  mediaItemPath,
  mediaUploadUrl,
  renameMediaItem,
  uploadMediaFile
};

type MediaEmitter = Window['meltdownEmit'];

export function toListing(value: unknown): FolderListing {
  return toFolderListing(value);
}

export async function createMediaFolder(
  emit: MediaEmitter,
  jwt: string | null | undefined,
  currentPath: string,
  newFolderName: string
): Promise<void> {
  return createSharedMediaFolder(emit, jwt, currentPath, newFolderName);
}

export async function listMediaFolder(
  emit: MediaEmitter,
  jwt: string | null | undefined,
  subPath: string
): Promise<FolderListing> {
  return listSharedMediaFolder(emit, jwt, subPath);
}

export async function createMediaShareLink(
  emit: MediaEmitter,
  jwt: string | null | undefined,
  filePath: string
): Promise<string> {
  const result = await createSharedMediaShareLink(emit, jwt, filePath);
  return result.shareURL || '';
}
