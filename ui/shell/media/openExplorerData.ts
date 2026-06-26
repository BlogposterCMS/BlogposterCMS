import {
  createMediaShareLink,
  errorMessage,
  listMediaFolder,
  toFolderListing as normalizeFolderListing,
  type FolderListing,
  type ShareLinkResult
} from '../../shared/media/mediaLibraryData.js';

export type { FolderListing, ShareLinkResult };
export { errorMessage };

type OpenExplorerEmitter = Window['meltdownEmit'];

export function toFolderListing(value: unknown): FolderListing {
  return normalizeFolderListing(value);
}

export async function listExplorerFolder(
  emit: OpenExplorerEmitter,
  jwt: string | null | undefined,
  subPath: string
): Promise<FolderListing> {
  return listMediaFolder(emit, jwt, subPath);
}

export async function createExplorerShareLink(
  emit: OpenExplorerEmitter,
  jwt: string | null | undefined,
  filePath: string
): Promise<ShareLinkResult> {
  return createMediaShareLink(emit, jwt, filePath);
}
