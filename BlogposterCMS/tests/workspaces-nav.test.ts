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
});
