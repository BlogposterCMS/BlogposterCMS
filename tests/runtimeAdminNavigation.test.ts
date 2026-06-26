/**
 * @jest-environment jsdom
 */

import { bindAdminContentNavigation } from '../ui/runtime/main/runtimeAdminNavigation';

function flushNavigation(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

describe('runtimeAdminNavigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/admin/dashboard');
    delete window.ADMIN_BASE;
    delete window.DEBUG_RENDERER;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('intercepts same-origin admin links and renders content without a full reload', async () => {
    document.body.innerHTML = `
      <a id="settings-link" href="/admin/settings">Settings</a>
      <a id="external-link" href="https://example.com/">External</a>
    `;
    window.DEBUG_RENDERER = true;
    const render = jest.fn().mockResolvedValue(undefined);
    const events: string[] = [];
    [
      'admin-content-navigated',
      'main-header-loaded',
      'sidebar-loaded'
    ].forEach(eventName => {
      document.addEventListener(eventName, () => events.push(eventName));
    });

    const unbind = bindAdminContentNavigation({ render });
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });

    document.getElementById('settings-link')?.dispatchEvent(clickEvent);
    await flushNavigation();

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(window.location.pathname).toBe('/admin/settings');
    expect(render).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/admin/settings',
      adminBase: '/admin',
      debug: true,
      url: expect.any(URL)
    }));
    expect(events).toEqual([
      'admin-content-navigated',
      'main-header-loaded',
      'sidebar-loaded'
    ]);

    render.mockClear();
    const externalEvent = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    document.getElementById('external-link')?.dispatchEvent(externalEvent);

    expect(externalEvent.defaultPrevented).toBe(false);
    expect(render).not.toHaveBeenCalled();
    unbind();
  });

  it('renders nested admin base paths on browser history navigation', async () => {
    window.ADMIN_BASE = '/cms/admin/';
    window.history.replaceState({}, '', '/cms/admin/dashboard');
    const render = jest.fn().mockResolvedValue(undefined);
    const unbind = bindAdminContentNavigation({ render });

    window.history.pushState({}, '', '/cms/admin/workspace-alpha/settings');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flushNavigation();

    expect(render).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/cms/admin/workspace-alpha/settings',
      adminBase: '/cms/admin'
    }));

    unbind();
  });
});
