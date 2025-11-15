/**
 * @jest-environment jsdom
 */

describe('workspace navigation', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <nav id="workspace-nav"></nav>
      <nav id="subpage-nav"></nav>
    `;

    window.history.replaceState({}, '', '/admin//workspace-alpha/settings');

    Object.assign(window, {
      ADMIN_BASE: '/admin//',
      ADMIN_TOKEN: 'token',
      meltdownEmit: jest.fn().mockResolvedValue([
        {
          slug: 'workspace-beta',
          lane: 'admin',
          title: 'Beta',
          meta: { workspace: 'workspace-beta' },
        },
        {
          slug: 'workspace-alpha',
          lane: 'admin',
          title: 'Alpha',
          meta: { workspace: 'workspace-alpha' },
        },
        {
          slug: 'workspace-alpha/settings',
          lane: 'admin',
          title: 'Settings',
        },
      ]),
    });
  });

  afterEach(() => {
    delete (window as Record<string, unknown>).meltdownEmit;
    delete (window as Record<string, unknown>).ADMIN_BASE;
    delete (window as Record<string, unknown>).ADMIN_TOKEN;
  });

  it('normalises admin base and highlights the active workspace', async () => {
    const { initWorkspaceNav } = await import('../public/plainspace/dashboard/workspaces');

    await initWorkspaceNav();

    const activeWorkspaceLink = document.querySelector('#workspace-nav a.active');
    expect(activeWorkspaceLink).not.toBeNull();
    expect(activeWorkspaceLink?.getAttribute('href')).toBe('/admin/workspace-alpha');
    expect(activeWorkspaceLink?.textContent?.trim()).toBe('Alpha');

    const sidebarLink = document.querySelector('#subpage-nav a');
    expect(sidebarLink).not.toBeNull();
    expect(sidebarLink?.getAttribute('href')).toBe('/admin/workspace-alpha/settings');
  });

  it('falls back to the first workspace when visiting /admin without a trailing slash', async () => {
    window.history.replaceState({}, '', '/admin');

    const { initWorkspaceNav } = await import('../public/plainspace/dashboard/workspaces');

    await initWorkspaceNav();

    const activeWorkspaceLink = document.querySelector('#workspace-nav a.active');
    expect(activeWorkspaceLink).not.toBeNull();
    expect(activeWorkspaceLink?.getAttribute('href')).toBe('/admin/workspace-beta');
    expect(activeWorkspaceLink?.textContent?.trim()).toBe('Beta');

    const sidebarLink = document.querySelector('#subpage-nav a');
    expect(sidebarLink).toBeNull();
  });

  it('prefixes asset paths with the admin base when it includes a nested path', async () => {
    window.ADMIN_BASE = '/cms/admin/';
    window.history.replaceState({}, '', '/cms/admin/workspace-alpha/settings');

    const { initWorkspaceNav } = await import('../public/plainspace/dashboard/workspaces');

    await initWorkspaceNav();

    const createIcon = document.querySelector('#workspace-nav button img.icon');
    expect(createIcon?.getAttribute('src')).toBe('/cms/admin/assets/icons/plus.svg');

    const workspaceIcon = document.querySelector('#workspace-nav a img.icon');
    expect(workspaceIcon?.getAttribute('src')).toBe('/cms/admin/assets/icons/file-box.svg');

    const sidebarAddIcon = document.querySelector('.sidebar-add-subpage img.icon');
    expect(sidebarAddIcon?.getAttribute('src')).toBe('/cms/admin/assets/icons/plus.svg');
  });

  it('re-renders the sidebar once the container becomes available', async () => {
    document.getElementById('subpage-nav')?.remove();

    const { initWorkspaceNav } = await import('../public/plainspace/dashboard/workspaces');

    await initWorkspaceNav();

    const sidebar = document.createElement('nav');
    sidebar.id = 'subpage-nav';
    document.body.appendChild(sidebar);

    await initWorkspaceNav();

    const addTile = document.querySelector('#subpage-nav .sidebar-add-subpage');
    expect(addTile).not.toBeNull();
  });
});
