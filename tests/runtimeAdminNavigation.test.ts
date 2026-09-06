/**
 * @jest-environment jsdom
 */

import { bindAdminContentNavigation } from '../ui/runtime/main/runtimeAdminNavigation';
import { registerWorkspaceChanges } from '../ui/shared/navigation/workspaceChanges';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';

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

  it('guards links inside widget shadow roots before changing the URL or editor', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<a href="/admin/content/pages">Pages</a>';
    const unregister = registerWorkspaceChanges(host, { isDirty: () => true });
    const confirm = jest.spyOn(bpDialog, 'confirm').mockResolvedValue(false);
    const render = jest.fn().mockResolvedValue(undefined);
    const unbind = bindAdminContentNavigation({ render });
    const click = () => shadow.querySelector('a')!.dispatchEvent(new MouseEvent('click', {
      bubbles: true, composed: true, cancelable: true, button: 0
    }));
    click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(window.location.pathname).toBe('/admin/dashboard');
    expect(render).not.toHaveBeenCalled();
    confirm.mockResolvedValue(true);
    click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(window.location.pathname).toBe('/admin/content/pages');
    expect(render).toHaveBeenCalledTimes(1);
    unregister();
    unbind();
  });

  it('collects draft guards across separately loaded shell and widget module instances', async () => {
    let registerFromWidget: typeof registerWorkspaceChanges;
    jest.isolateModules(() => {
      registerFromWidget = require('../ui/shared/navigation/workspaceChanges').registerWorkspaceChanges;
    });
    const host = document.createElement('div');
    host.innerHTML = '<a href="/admin/settings">Settings</a>';
    document.body.append(host);
    const unregister = registerFromWidget!(host, { isDirty: () => true });
    jest.spyOn(bpDialog, 'confirm').mockResolvedValue(false);
    const render = jest.fn();
    const unbind = bindAdminContentNavigation({ render });
    host.querySelector('a')!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(render).not.toHaveBeenCalled();
    expect(bpDialog.confirm).toHaveBeenCalled();
    unregister();
    unbind();
  });

  it('restores known history after declining Back without rendering or losing the draft', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    window.history.replaceState({ bpAdminContentNavigation: 2 }, '', '/admin/content/pages');
    const unregister = registerWorkspaceChanges(host, { isDirty: () => true });
    jest.spyOn(bpDialog, 'confirm').mockResolvedValue(false);
    const go = jest.spyOn(window.history, 'go').mockImplementation(() => undefined);
    const render = jest.fn().mockResolvedValue(undefined);
    const unbind = bindAdminContentNavigation({ render });
    window.history.replaceState({ bpAdminContentNavigation: 1 }, '', '/admin/content/menu');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(go).toHaveBeenCalledWith(1);
    expect(render).not.toHaveBeenCalled();
    window.history.replaceState({ bpAdminContentNavigation: 2 }, '', '/admin/content/pages');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(render).not.toHaveBeenCalled();
    unregister();
    unbind();
  });
});
