import { listMediaCatalog, toFolderListing, type FolderListing, type MediaUploadFetch } from './mediaLibraryData.js';

export interface MediaStorageLocation {
  id: string;
  label: string;
  list: (path: string) => Promise<FolderListing>;
}

type CatalogFile = { key: string; size: number | null; modifiedAt: string; url: string };

/** Project catalog object keys into folders without creating another persistence owner. */
export function storageFolder(files: CatalogFile[], currentPath: string): FolderListing {
  const prefix = currentPath ? `${currentPath}/` : '';
  const folders = new Set<string>();
  const details: NonNullable<FolderListing['details']> = [];
  for (const file of files) {
    if (!file.key.startsWith(prefix)) continue;
    const relative = file.key.slice(prefix.length);
    const slash = relative.indexOf('/');
    if (slash !== -1) folders.add(relative.slice(0, slash));
    else if (relative) details.push({ name: relative, size: file.size, modifiedAt: file.modifiedAt, url: file.url });
  }
  return { currentPath, parentPath: currentPath.split('/').slice(0, -1).join('/'), folders: [...folders], files: details.map(file => file.name), details };
}

/** Only sanitized settings and catalog metadata enter the Explorer; credentials never do. */
export async function listMediaStorageLocations(request: MediaUploadFetch, emit: Window['meltdownEmit'], jwt?: string | null): Promise<MediaStorageLocation[]> {
  const response = await request('/admin/api/media/storage', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('MEDIA_EXPLORER_STORAGE_CONFIG_FAILED');
  const config = await response.json();
  if (config.error) throw new Error(config.error);
  const connections: Array<{ provider: string; connectionId: string; name: string; publicBaseUrl?: string }> = Array.isArray(config.connections) ? config.connections : [];
  const locations: MediaStorageLocation[] = connections.filter(connection => connection.provider !== 'local').map(connection => ({
    id: connection.connectionId, label: connection.name,
    list: async (path: string) => {
      const response = await request(`/admin/api/media/storage/files?connectionId=${encodeURIComponent(connection.connectionId)}&path=${encodeURIComponent(path)}`, { credentials: 'same-origin' });
      const listing = await response.json();
      if (!response.ok || listing.error) throw new Error(listing.error || 'MEDIA_EXPLORER_STORAGE_LIST_FAILED');
      return toFolderListing(listing);
    }
  }));
  const groups = new Map<string, { label: string; files: CatalogFile[] }>();
  for (const record of await listMediaCatalog(emit, jwt)) {
    const meta = record.meta && typeof record.meta === 'object' ? record.meta as Record<string, any> : {};
    const storage = meta.storage || {};
    const provider = String(storage.provider || 'remote');
    const rawKey = String(storage.objectKey || record.storagePath || record.storage_path || '');
    if (provider === 'local' || rawKey.startsWith('public/')) continue;
    let url: URL;
    try { url = new URL(String(record.url || '')); } catch { continue; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
    // Connected objects are listed by their adapter. Keep older external catalog links visible as well.
    if (connections.some(connection => connection.provider !== 'local' && (
      connection.connectionId === storage.connectionId ||
      (connection.publicBaseUrl && url.href.startsWith(`${connection.publicBaseUrl}/`))))) continue;
    const id = `external:${provider}:${storage.bucket || url.origin}`;
    if (!groups.has(id)) groups.set(id, { label: `External files — ${storage.bucket || url.hostname}`, files: [] });
    const key = rawKey || String(record.fileName || record.file_name || url.pathname.split('/').pop() || '');
    if (!key || key.split('/').some(part => !part || part === '.' || part === '..' || /[\\\u0000]/.test(part))) continue;
    groups.get(id)!.files.push({ key, url: url.href, size: Number(record.sizeBytes ?? record.size_bytes) || null,
      modifiedAt: String(record.updatedAt || record.updated_at || record.created_at || '') });
  }
  return [...locations, ...[...groups].map(([id, group]) => ({ id, label: group.label, list: async (path: string) => storageFolder(group.files, path) }))];
}
