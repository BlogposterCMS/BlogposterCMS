/**
 * @jest-environment jsdom
 */

import {
  createMediaFolder,
  createMediaShareLink,
  deleteMediaItem,
  errorMessage,
  listMediaFolder,
  mediaItemPath,
  mediaUploadUrl,
  renameMediaItem,
  toListing,
  uploadMediaFile
} from '../ui/widgets/plainspace/admin/mediaExplorerData';

describe('mediaExplorerData', () => {
  it('normalizes folder listings and formats paths', () => {
    expect(toListing({
      folders: ['images', 42, 'docs'],
      files: ['logo.png', null],
      parentPath: 'uploads',
      currentPath: 'uploads/images'
    })).toEqual({
      folders: ['images', 'docs'],
      files: ['logo.png'],
      parentPath: 'uploads',
      currentPath: 'uploads/images'
    });
    expect(toListing(null)).toEqual({ folders: [], files: [], parentPath: '', currentPath: '' });
    expect(mediaItemPath('', 'logo.png')).toBe('logo.png');
    expect(mediaItemPath('uploads', 'logo.png')).toBe('uploads/logo.png');
    expect(mediaUploadUrl('nested folder')).toBe('/admin/api/upload?subPath=nested%20folder');
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('lists media folders through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue({
      folders: ['images'],
      files: ['logo.png'],
      parentPath: '',
      currentPath: 'uploads'
    });

    await expect(listMediaFolder(emit, 'admin-token', 'uploads')).resolves.toEqual({
      folders: ['images'],
      files: ['logo.png'],
      parentPath: '',
      currentPath: 'uploads'
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'media',
      action: 'listLocalFolder',
      params: { subPath: 'uploads' }
    });
  });

  it('creates media folders and share links through the runtime admin facade', async () => {
    const emit = jest.fn(async (_eventName, payload) => (
      `${payload.resource}.${payload.action}` === 'shares.create'
        ? { shareURL: 'https://share.example/logo.png' }
        : undefined
    ));

    await createMediaFolder(emit, 'admin-token', 'uploads', 'images');
    await expect(createMediaShareLink(emit, 'admin-token', 'uploads/logo.png'))
      .resolves.toBe('https://share.example/logo.png');

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'media',
      action: 'createLocalFolder',
      params: {
        currentPath: 'uploads',
        newFolderName: 'images'
      }
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'shares',
      action: 'create',
      params: { filePath: 'uploads/logo.png' }
    });
  });

  it('renames and deletes media items through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await renameMediaItem(emit, 'admin-token', 'uploads', 'old.png', 'new.png');
    await deleteMediaItem(emit, 'admin-token', 'uploads', 'new.png');

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'media',
      action: 'renameLocalItem',
      params: {
        currentPath: 'uploads',
        oldName: 'old.png',
        newName: 'new.png'
      }
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'media',
      action: 'deleteLocalItem',
      params: {
        currentPath: 'uploads',
        itemName: 'new.png'
      }
    });
  });

  it('uploads files through the admin media upload endpoint', async () => {
    const uploadFetch = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: jest.fn().mockResolvedValue({})
    });
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    await uploadMediaFile(uploadFetch, 'csrf-token', 'uploads', file);

    expect(uploadFetch).toHaveBeenCalledWith('/admin/api/upload?subPath=uploads', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'csrf-token' },
      body: expect.any(FormData),
      credentials: 'same-origin'
    });
  });

  it('surfaces upload errors from the response body', async () => {
    const uploadFetch = jest.fn().mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      json: jest.fn().mockResolvedValue({ error: 'file too large' })
    });
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    await expect(uploadMediaFile(uploadFetch, null, '', file))
      .rejects.toThrow('file too large');
  });

  it('fails with a shared searchable error code when the emitter is missing', async () => {
    await expect(listMediaFolder(undefined as never, 'admin-token', 'uploads'))
      .rejects.toThrow('MEDIA_LIBRARY_EMITTER_UNAVAILABLE');
  });
});
