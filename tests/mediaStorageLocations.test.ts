/** @jest-environment jsdom */
import { listMediaStorageLocations, storageFolder } from '../ui/shared/media/mediaStorageLocations';

test('connected drives request their own folder and retain direct download URLs', async () => {
  const request = jest.fn(async (url: string) => ({ ok: true, json: async () => url.includes('/files?')
    ? { currentPath: 'releases', parentPath: '', folders: [], files: ['app.apk'], details: [{ name: 'app.apk', url: 'https://cdn.example/app.apk' }] }
    : { connections: [{ connectionId: 'local', provider: 'local' }, { connectionId: 'cloud-2', provider: 's3', name: 'Releases' }] }
  })) as unknown as typeof fetch;
  const emit = jest.fn(async () => []);
  const locations = await listMediaStorageLocations(request, emit);
  expect(locations.map(item => item.label)).toEqual(['Releases']);
  const folder = await locations[0]!.list('releases');
  expect(request).toHaveBeenLastCalledWith('/admin/api/media/storage/files?connectionId=cloud-2&path=releases', expect.any(Object));
  expect(folder.details?.[0]?.url).toBe('https://cdn.example/app.apk');
});

test('catalog-only external files preserve folder hierarchy', () => {
  const files = [{ key: 'downloads/v2/app.apk', size: 42, modifiedAt: '', url: 'https://cdn.example/app.apk' }];
  expect(storageFolder(files, '').folders).toEqual(['downloads']);
  expect(storageFolder(files, 'downloads/v2').files).toEqual(['app.apk']);
  expect(storageFolder(files, 'download').files).toEqual([]);
});
