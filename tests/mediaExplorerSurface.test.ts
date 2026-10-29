/**
 * @jest-environment jsdom
 */

import { createMediaExplorerSurface } from '../ui/shared/media/mediaExplorerSurface';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';

function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('mediaExplorerSurface', () => {
  it('shows connected storage in the normal file view and isolates local mutations', async () => {
    const emit = jest.fn(async () => ({ folders: [], files: ['local.png'], currentPath: '', parentPath: '' }));
    const list = jest.fn(async (path: string) => ({ folders: [], files: ['remote.apk'], currentPath: path, parentPath: '',
      details: [{ name: 'remote.apk', size: 10, modifiedAt: '', url: 'https://cdn.example.com/remote.apk' }] }));
    const surface = createMediaExplorerSurface({ mode: 'manage', emit, loadStorageLocations: async () => [{ id: 'cloud', label: 'Release server', list }] });
    document.body.append(surface.element);
    await tick();
    surface.element.querySelector<HTMLButtonElement>('[aria-label="Open storage Release server"]')!.click();
    await tick();
    expect(list).toHaveBeenCalledWith('');
    expect(surface.element.querySelector('.media-item.file')?.textContent).toContain('remote.apk');
    expect(surface.element.querySelector<HTMLButtonElement>('[aria-label="New folder"]')!.disabled).toBe(true);
    expect(surface.element.textContent).not.toContain('local.png');
    surface.element.querySelector<HTMLButtonElement>('[aria-label="Open storage Local server"]')!.click();
    await tick();
    expect(surface.element.textContent).toContain('local.png');
    expect(surface.element.querySelector<HTMLButtonElement>('[aria-label="New folder"]')!.disabled).toBe(false);
  });
  beforeEach(() => {
    document.body.innerHTML = '';
    window.ADMIN_TOKEN = 'admin-token';
    window.CSRF_TOKEN = 'csrf-token';
    window.alert = jest.fn();
    window.prompt = jest.fn(() => '');
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    expect(surface.getCurrentPath()).toBe('');
    surface.element.querySelector<HTMLButtonElement>('[aria-label="Open folder"]')!.click();
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
    expect(onSelectFile).not.toHaveBeenCalled();
    surface.element.querySelector<HTMLButtonElement>('[aria-label="Use selected file"]')!.click();
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

  it.each(['public', 'private'])('public URL image selection never creates shares (%s)', async initialPath => {
    const onSelectFile = jest.fn();
    const emit = jest.fn(async (_event, payload) => payload.action === 'listLocalFolder'
      ? { folders: [], files: ['hero.png'], parentPath: '', currentPath: initialPath } : {});
    const surface = createMediaExplorerSurface({ mode: 'picker', emit, initialPath, publicUrlOnly: true, onSelectFile });
    document.body.append(surface.element); await tick();
    surface.element.querySelector<HTMLButtonElement>('.media-item.file .media-item__main')!.click();
    surface.element.querySelector<HTMLButtonElement>('[aria-label="Use selected file"]')!.click(); await tick();
    expect(emit.mock.calls.some(([, payload]) => payload.resource === 'shares')).toBe(false);
    if (initialPath === 'public') expect(onSelectFile).toHaveBeenCalledWith({ shareURL: '/media/hero.png', name: 'public/hero.png' });
    else { expect(onSelectFile).not.toHaveBeenCalled(); expect(surface.element.textContent).toContain('MEDIA_PUBLIC_IMAGE_REQUIRED'); }
  });

  it('keeps the newest folder when earlier requests finish late', async () => {
    let oldResult!: (value: unknown) => void;
    const emit = jest.fn((_event, payload) => payload.params.subPath === 'old'
      ? new Promise(resolve => { oldResult = resolve; })
      : Promise.resolve({ folders: [], files: ['new.png'], currentPath: payload.params.subPath, parentPath: '' }));
    const surface = createMediaExplorerSurface({ emit, jwt: 'test' });
    document.body.append(surface.element);
    await tick();
    const old = surface.load('old');
    await surface.load('new');
    oldResult({ files: ['old.png'], folders: [], currentPath: 'old', parentPath: '' });
    await old;
    expect(surface.getCurrentPath()).toBe('new');
    expect(surface.element.textContent).toContain('new.png');
    expect(surface.element.textContent).not.toContain('old.png');
  });

  it('keeps a failed folder read visible through search/view changes and refreshes it', async () => {
    const emit = jest.fn().mockRejectedValue(new Error('offline'));
    const surface = createMediaExplorerSurface({ emit, jwt: 'test' });
    document.body.append(surface.element);
    await tick();
    const search = surface.element.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'image';
    search.dispatchEvent(new Event('input'));
    surface.element.querySelector<HTMLButtonElement>('[aria-label="List view"]')!.click();
    expect(surface.element.textContent).toContain('MEDIA_EXPLORER_LOAD_FAILED');
    expect(surface.element.textContent).not.toContain('No matching media');
    emit.mockResolvedValue({ folders: [], files: ['image.png'], currentPath: '', parentPath: '' });
    surface.element.querySelector<HTMLButtonElement>('[aria-label="Refresh"]')!.click();
    await tick();
    expect(surface.element.textContent).toContain('image.png');
    expect(surface.element.querySelector('[role=alert]')).toBeNull();
  });

  it('prevents repeated mutations while the confirmation and write are pending', async () => {
    let confirm!: (value: boolean) => void;
    jest.spyOn(bpDialog, 'confirm').mockImplementation(() => new Promise(resolve => { confirm = resolve; }));
    const emit = jest.fn().mockResolvedValue({ folders: [], files: ['image.png'], currentPath: '', parentPath: '' });
    const surface = createMediaExplorerSurface({ emit, jwt: 'test' });
    document.body.append(surface.element);
    await tick();
    surface.element.querySelector<HTMLButtonElement>('.media-item.file .media-item__main')!.click();
    const remove = surface.element.querySelector<HTMLButtonElement>('[aria-label="Delete"]')!;
    remove.click();
    remove.click();
    expect(bpDialog.confirm).toHaveBeenCalledTimes(1);
    expect(surface.element.getAttribute('aria-busy')).toBe('true');
    confirm(true);
    await tick();
    expect(emit.mock.calls.filter(([, payload]) => payload.action === 'deleteLocalItem')).toHaveLength(1);
    expect(surface.element.getAttribute('aria-busy')).toBe('false');
  });

  it('keeps Back/Forward separate from the parent-folder action', async () => {
    const emit = jest.fn(async (_event, payload) => ({ folders: ['child'], files: [], currentPath: payload.params.subPath, parentPath: '' }));
    const surface = createMediaExplorerSurface({ emit });
    document.body.append(surface.element);
    const command = (name: string) => surface.element.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
    await tick();
    const enter = async () => {
      surface.element.querySelector<HTMLButtonElement>('.media-item__main')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await tick();
    };
    await enter();
    await enter();
    expect(surface.getCurrentPath()).toBe('child/child');
    command('Up one folder').click(); await tick();
    expect(surface.getCurrentPath()).toBe('child');
    command('Back').click(); await tick();
    expect(surface.getCurrentPath()).toBe('child/child');
    command('Forward').click(); await tick();
    expect(surface.getCurrentPath()).toBe('child');
  });

  it('supports keyboard selection and sorting without creating share links for previews', async () => {
    const emit = jest.fn(async (_event, payload) => ({
      folders: [], files: ['image10.png', 'image2.png'], currentPath: payload.params.subPath, parentPath: '',
      details: [{ name: 'image10.png', size: 100, modifiedAt: '2026-09-05T10:00:00Z' }, { name: 'image2.png', size: 200, modifiedAt: '' }]
    }));
    const surface = createMediaExplorerSurface({ emit, initialPath: 'public' });
    document.body.append(surface.element); await tick();
    const rows = () => surface.element.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(rows()[0].getAttribute('aria-label')).toContain('image2.png');
    rows()[0].focus();
    rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows()[1]);
    expect(rows()[1].getAttribute('aria-selected')).toBe('true');
    expect(surface.element.querySelector<HTMLImageElement>('.media-explorer__preview img')?.getAttribute('src')).toBe('/media/image10.png');
    surface.element.querySelector<HTMLButtonElement>('[aria-label="Sort by size"]')!.click();
    expect(rows()[0].getAttribute('aria-label')).toContain('image10.png');
    expect(emit.mock.calls.every(([, payload]) => payload.action === 'listLocalFolder')).toBe(true);
  });

  it('requires an explicit valid picker selection and keeps unsupported files visible', async () => {
    const onSelectFile = jest.fn();
    const emit = jest.fn().mockResolvedValue({ folders: [], files: ['notes.txt', 'hero.png'], currentPath: '', parentPath: '' });
    const surface = createMediaExplorerSurface({ mode: 'picker', emit, accept: 'image/*', onSelectFile });
    document.body.append(surface.element); await tick();
    surface.element.querySelector<HTMLButtonElement>('[aria-label="notes.txt, TXT file"]')!.click();
    expect(surface.element.querySelector<HTMLButtonElement>('[aria-label="Use selected file"]')!.disabled).toBe(true);
    expect(surface.element.textContent).toContain('Choose a file matching image/*');
    expect(onSelectFile).not.toHaveBeenCalled();
    expect(surface.element.querySelector('[aria-label="Delete"]')).toBeNull();
  });

  it('clears a hidden selection before toolbar actions can operate on it', async () => {
    const emit = jest.fn().mockResolvedValue({ folders: [], files: ['visible.png'], currentPath: '', parentPath: '' });
    const surface = createMediaExplorerSurface({ emit }); document.body.append(surface.element); await tick();
    surface.element.querySelector<HTMLButtonElement>('[role="option"]')!.click();
    const search = surface.element.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'different'; search.dispatchEvent(new Event('input'));
    expect(surface.element.querySelector<HTMLButtonElement>('[aria-label="Delete"]')!.disabled).toBe(true);
    expect(surface.element.querySelector<HTMLElement>('.media-explorer__details')!.hidden).toBe(true);
  });
});
