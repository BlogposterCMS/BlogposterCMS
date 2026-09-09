export interface FolderListing {
  folders: string[];
  files: string[];
  parentPath: string;
  currentPath: string;
  details?: Array<{ name: string; size: number | null; modifiedAt: string; url?: string }>;
}

export interface ShareLinkResult {
  shareURL?: string;
  shortToken?: string;
}

export type MediaUploadFetch = (
  resource: RequestInfo | URL,
  options?: RequestInit
) => Promise<Response>;

type MediaEmitter = Window['meltdownEmit'];

const RUNTIME_MANAGER_MODULE = {
  moduleName: 'runtimeManager',
  moduleType: 'core'
} as const;

function requireEmitter(emit: MediaEmitter): NonNullable<MediaEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('MEDIA_LIBRARY_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

function objectParams(value: Record<string, unknown> = {}): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function unwrapRuntimeFacadeData<T = unknown>(value: unknown): T {
  if (
    value &&
    typeof value === 'object' &&
    'resource' in value &&
    'action' in value &&
    'data' in value
  ) {
    return (value as { data?: T }).data as T;
  }
  return value as T;
}

async function emitRuntimeAdmin<T = unknown>(
  emit: NonNullable<MediaEmitter>,
  jwt: string | null | undefined,
  resource: string,
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const result = await emit('cmsAdminApiRequest', {
    jwt,
    ...RUNTIME_MANAGER_MODULE,
    resource,
    action,
    params: objectParams(params)
  });
  return unwrapRuntimeFacadeData<T>(result);
}

function requireUploadFetch(uploadFetch?: MediaUploadFetch): MediaUploadFetch {
  if (typeof uploadFetch === 'function') return uploadFetch;
  if (typeof fetch === 'function') {
    return (resource, options) => fetch(resource, options);
  }
  throw new Error('MEDIA_LIBRARY_FETCH_UNAVAILABLE: fetchWithTimeout unavailable');
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toFolderListing(value: unknown): FolderListing {
  const candidate = value && typeof value === 'object'
    ? value as {
      folders?: unknown;
      files?: unknown;
      parentPath?: unknown;
      currentPath?: unknown;
      details?: unknown;
    }
    : {};

  return {
    folders: toStringArray(candidate.folders),
    files: toStringArray(candidate.files),
    parentPath: typeof candidate.parentPath === 'string' ? candidate.parentPath : '',
    currentPath: typeof candidate.currentPath === 'string' ? candidate.currentPath : '',
    ...(Array.isArray(candidate.details) ? { details: candidate.details.filter(item =>
      item && typeof item === 'object' && typeof item.name === 'string'
    ).map(item => ({
      name: item.name,
      size: typeof item.size === 'number' && Number.isFinite(item.size) && item.size >= 0 ? item.size : null,
      modifiedAt: typeof item.modifiedAt === 'string' ? item.modifiedAt : '',
      ...(typeof item.url === 'string' ? { url: item.url } : {})
    })) } : {})
  };
}

export function mediaItemPath(path: string, name: string): string {
  return path ? `${path}/${name}` : name;
}

export function mediaUploadUrl(currentPath: string): string {
  return `/admin/api/upload?subPath=${encodeURIComponent(currentPath)}`;
}

export async function uploadMediaFile(
  uploadFetch: MediaUploadFetch | undefined,
  csrfToken: string | null | undefined,
  currentPath: string,
  file: File
): Promise<void> {
  const request = requireUploadFetch(uploadFetch);
  const form = new FormData();
  form.append('file', file);
  const resp = await request(mediaUploadUrl(currentPath), {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken || '' },
    body: form,
    credentials: 'same-origin'
  });
  const json = await resp.json().catch(() => ({})) as { error?: string };
  if (!resp.ok || json.error) {
    throw new Error(json.error || resp.statusText || 'MEDIA_LIBRARY_UPLOAD_FAILED');
  }
}

export async function createMediaFolder(
  emit: MediaEmitter,
  jwt: string | null | undefined,
  currentPath: string,
  newFolderName: string
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'media', 'createLocalFolder', {
    currentPath,
    newFolderName
  });
}

export async function listMediaFolder(
  emit: MediaEmitter,
  jwt: string | null | undefined,
  subPath: string
): Promise<FolderListing> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'media', 'listLocalFolder', { subPath });
  return toFolderListing(res);
}

/** Read the bounded download catalog through the same authenticated media facade. */
export async function listMediaDownloads(
  emit: MediaEmitter,
  jwt: string | null | undefined
): Promise<Record<string, unknown>[]> {
  const result = await emitRuntimeAdmin(requireEmitter(emit), jwt, 'media', 'list', {
    category: 'download', status: 'active', visibility: 'public', limit: 50
  });
  return Array.isArray(result) ? result : [];
}

/** Page the existing media catalog; do not silently hide files after the first page. */
export async function listMediaCatalog(emit: MediaEmitter, jwt?: string | null): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 10000; offset += 200) {
    const page = await emitRuntimeAdmin<unknown>(requireEmitter(emit), jwt, 'media', 'list', {
      status: 'active', visibility: 'public', limit: 200, offset
    });
    if (!Array.isArray(page)) throw new Error('MEDIA_EXPLORER_CATALOG_INVALID');
    rows.push(...page);
    if (page.length < 200) return rows;
  }
  throw new Error('MEDIA_EXPLORER_CATALOG_LIMIT: Narrow the media catalog before browsing storage.');
}

export async function renameMediaItem(
  emit: MediaEmitter,
  jwt: string | null | undefined,
  currentPath: string,
  oldName: string,
  newName: string
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'media', 'renameLocalItem', {
    currentPath,
    oldName,
    newName
  });
}

export async function deleteMediaItem(
  emit: MediaEmitter,
  jwt: string | null | undefined,
  currentPath: string,
  itemName: string
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'media', 'deleteLocalItem', {
    currentPath,
    itemName
  });
}

export async function createMediaShareLink(
  emit: MediaEmitter,
  jwt: string | null | undefined,
  filePath: string
): Promise<ShareLinkResult> {
  const meltdownEmit = requireEmitter(emit);
  const result = await emitRuntimeAdmin(meltdownEmit, jwt, 'shares', 'create', { filePath });
  return result && typeof result === 'object'
    ? result as ShareLinkResult
    : {};
}
