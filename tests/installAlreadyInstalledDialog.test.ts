/**
 * @jest-environment jsdom
 */

function renderInstallShell(): void {
  document.head.innerHTML = `
    <meta name="csrf-token" content="csrf-token">
    <meta name="allow-weak-creds" content="">
    <meta name="dev-autologin" content="">
    <meta name="dev-user" content="admin">
  `;
  document.body.innerHTML = `
    <ul class="install-steps">
      <li class="active"></li>
      <li></li>
      <li></li>
      <li></li>
    </ul>
    <div id="step-welcome" class="step active"></div>
    <button id="startSetup" type="button"></button>
    <form id="adminForm" class="step">
      <input id="username" name="username">
      <input id="password" name="password" type="password">
      <input id="confirmPassword" name="confirmPassword" type="password">
      <input id="email" name="email" type="email">
      <div id="pwStrength"></div>
    </form>
    <form id="siteForm" class="step">
      <input id="projectName" name="projectName">
    </form>
    <input id="favoriteColor" name="favoriteColor" type="hidden" value="#008080">
    <div id="colorPickerContainer"></div>
    <button id="skipSite" type="button"></button>
    <button id="backToAdmin" type="button"></button>
    <div id="step-finish" class="step"></div>
  `;
}

async function flushShellTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => window.setTimeout(resolve, 0));
}

function textResponse(text: string, init: ResponseInit = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? 'OK',
    text: async () => text
  } as unknown as Response;
}

describe('install shell already-installed dialog', () => {
  afterEach(() => {
    delete window.fetchWithTimeout;
    delete window.blogposterApi;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('opens a dashboard CTA modal for stale already-installed submissions', async () => {
    const mockAlert = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    renderInstallShell();
    window.blogposterApi = {
      emit: jest.fn(async (_eventName, payload) => (
        payload?.key === 'FIRST_INSTALL_DONE' ? 'false' : 'public-token'
      ))
    };
    window.fetchWithTimeout = jest.fn().mockResolvedValue(textResponse('Already installed', {
      status: 403,
      statusText: 'Forbidden'
    }));

    await import('../ui/shell/install/install');
    document.getElementById('skipSite')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushShellTasks();

    expect(window.fetchWithTimeout).toHaveBeenCalledWith('/install', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' })
    }));
    expect(document.querySelector('.bp-dialog__title')?.textContent)
      .toBe('Installation already complete');
    expect(document.querySelector('.bp-dialog__message')?.textContent)
      .toContain('already has an administrator');
    expect(document.querySelector('[data-action="dashboard"]')?.textContent)
      .toBe('Go to Dashboard');
    expect(mockAlert).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>('[data-action="stay"]')?.click();
  });
});
