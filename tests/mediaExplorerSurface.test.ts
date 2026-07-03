/**
 * @jest-environment jsdom
 */

import { createMediaExplorerSurface } from '../ui/shared/media/mediaExplorerSurface';

function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('mediaExplorerSurface', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.ADMIN_TOKEN = 'admin-token';
    window.CSRF_TOKEN = 'csrf-token';
    window.alert = jest.fn();
    window.prompt = jest.fn(() => '');
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    delete window.ADMIN_TOKEN;
    delete window.CSRF_TOKEN;
    delete window.meltdownEmit;
  });

  it('renders a full media management surface and navigates folders', async () => {
    const emit = jest.fn(async (eventName, payload) => {
      const route = `${payload.resource}.${payload.action}`;
      if (eventName === 'cmsAdminApiRequest' && route === 'media.listLocalFolder' && payload.params.subPath === '') {
        return { folders: ['images'], files: ['logo.png'], parentPath: '', currentPath: '' };
      }
      if (eventName === 'cmsAdminApiRequest' && route === 'media.listLocalFolder' && payload.params.subPath === 'images') {
        return { folders: [], files: ['hero.png'], parentPath: '', currentPath: 'images' };
      }
      return {};
    });

    const surface = createMediaExplorerSurface({ mode: 'manage', emit, jwt: 'admin-token' });
    document.body.appendChild(surface.element);
    await tick();

    expect(surface.element.querySelector('.media-explorer__toolbar')).toBeTruthy();
    expect(surface.element.textContent).toContain('logo.png');
    expect(surface.element.textContent).toContain('images');

    surface.element.querySelector<HTMLButtonElement>('.media-item.folder .media-item__main')?.click();
    await tick();

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'media',
      action: 'listLocalFolder',
      params: { subPath: 'images' }
    }));
    expect(surface.element.textContent).toContain('hero.png');
  });

  it('uses picker mode to return a shared file selection', async () => {
    const onSelectFile = jest.fn();
    const emit = jest.fn(async (eventName, payload) => {
      const route = `${payload.resource}.${payload.action}`;
      if (eventName === 'cmsAdminApiRequest' && route === 'media.listLocalFolder') {
        return { folders: [], files: ['hero.png'], parentPath: '', currentPath: 'public' };
      }
      if (eventName === 'cmsAdminApiRequest' && route === 'shares.create') {
        return { shareURL: '/media/share/abc', shortToken: 'abc' };
      }
      return {};
    });

    const surface = createMediaExplorerSurface({
      mode: 'picker',
      emit,
      jwt: 'admin-token',
      initialPath: 'public',
      onSelectFile
    });
    document.body.appendChild(surface.element);
    await tick();

    surface.element.querySelector<HTMLButtonElement>('.media-item.file .media-item__main')?.click();
    await tick();

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'shares',
      action: 'create',
      params: { filePath: 'public/hero.png' }
    }));
    expect(onSelectFile).toHaveBeenCalledWith({
      shareURL: '/media/share/abc',
      shortToken: 'abc',
      name: 'public/hero.png'
    });
  });
});
