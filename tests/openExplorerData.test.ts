/**
 * @jest-environment jsdom
 */

import {
  createExplorerShareLink,
  errorMessage,
  listExplorerFolder,
  toFolderListing
} from '../ui/shell/media/openExplorerData';

describe('openExplorerData', () => {
  it('normalizes folder listings and error messages', () => {
    expect(toFolderListing({
      folders: ['images', 12],
      files: ['hero.png', null],
      parentPath: 'public',
      currentPath: 'public/images'
    })).toEqual({
      folders: ['images'],
      files: ['hero.png'],
      parentPath: 'public',
      currentPath: 'public/images'
    });
    expect(toFolderListing(null)).toEqual({ folders: [], files: [], parentPath: '', currentPath: '' });
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('bad')).toBe('bad');
  });

  it('lists folders through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue({
      folders: ['images'],
      files: ['hero.png'],
      parentPath: '',
      currentPath: 'public'
    });

    await expect(listExplorerFolder(emit, 'admin-token', 'public')).resolves.toEqual({
      folders: ['images'],
      files: ['hero.png'],
      parentPath: '',
      currentPath: 'public'
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'media',
      action: 'listLocalFolder',
      params: { subPath: 'public' }
    });
  });

  it('creates share links through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue({
      shareURL: '/media/share/abc',
      shortToken: 'abc'
    });

    await expect(createExplorerShareLink(emit, 'admin-token', 'public/hero.png')).resolves.toEqual({
      shareURL: '/media/share/abc',
      shortToken: 'abc'
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'shares',
      action: 'create',
      params: { filePath: 'public/hero.png' }
    });
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(listExplorerFolder(undefined as never, 'admin-token', 'public'))
      .rejects.toThrow('MEDIA_LIBRARY_EMITTER_UNAVAILABLE');
    await expect(createExplorerShareLink(undefined as never, 'admin-token', 'public/hero.png'))
      .rejects.toThrow('MEDIA_LIBRARY_EMITTER_UNAVAILABLE');
  });
});
