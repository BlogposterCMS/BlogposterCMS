/** @jest-environment jsdom */
import { renderSettingsSurface } from '../ui/widgets/plainspace/admin/settings/settingsPanels';
import { render as renderModules } from '../ui/widgets/plainspace/admin/modulesListWidget';
import { render as renderUsers } from '../ui/widgets/plainspace/admin/usersListWidget';
import { render as renderAccess } from '../ui/widgets/plainspace/admin/accessSettingsWidget';
import { createTabSystem } from '../ui/shared/navigation/tabs';
import { confirmWorkspaceNavigation } from '../ui/shared/navigation/workspaceChanges';
import * as moduleData from '../ui/widgets/plainspace/admin/modulesListData';
import * as accessData from '../ui/widgets/plainspace/admin/accessSettingsData';

jest.mock('../ui/widgets/plainspace/admin/modulesListData', () => ({
  ...jest.requireActual('../ui/widgets/plainspace/admin/modulesListData'),
  fetchModuleLists: jest.fn().mockResolvedValue({
    installed: [{ module_name: 'example', module_info: { moduleName: 'example' } }],
    system: [{ module_name: 'pagesManager', module_info: { moduleName: 'pagesManager' } }]
  }),
  fetchPendingModuleAccessRequests: jest.fn().mockResolvedValue([]),
  fetchModuleUpdateStatuses: jest.fn().mockResolvedValue([])
}));
jest.mock('../ui/widgets/plainspace/admin/usersListData', () => ({
  ...jest.requireActual('../ui/widgets/plainspace/admin/usersListData'),
  fetchUsers: jest.fn().mockResolvedValue([{ id: 1, username: 'editor' }]),
  fetchRoles: jest.fn().mockResolvedValue([{ id: 2, role_name: 'Editors' }]),
  fetchPermissions: jest.fn().mockResolvedValue([])
}));
jest.mock('../ui/widgets/plainspace/admin/accessSettingsData', () => ({
  ...jest.requireActual('../ui/widgets/plainspace/admin/accessSettingsData'),
  fetchAccessSettings: jest.fn().mockResolvedValue({ allowRegistration: false, firstInstallDone: true }),
  listAgentAccessCodes: jest.fn().mockResolvedValue([]),
  setAllowRegistration: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../ui/shared/dialogs/bpDialog', () => ({ bpDialog: {
  confirm: jest.fn().mockResolvedValue(false), alert: jest.fn().mockResolvedValue(undefined)
} }));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('fixed Settings pages', () => {
  let host: HTMLElement;
  beforeEach(() => {
    jest.clearAllMocks();
    host = document.createElement('main');
    document.body.replaceChildren(host);
    window.ADMIN_TOKEN = 'test'; window.meltdownEmit = jest.fn().mockResolvedValue('');
  });
  afterEach(() => document.body.replaceChildren());

  it.each(['settings', 'settings/general', 'settings/design', 'settings/seo', 'settings/security', 'settings/ui-kit'])
  ('uses the fixed workspace on existing %s pages with old dashboard metadata', async slug => {
    await renderSettingsSurface(host, { slug, meta: { dashboardLayout: 'custom' } });
    expect(host.dataset.dashboardLayout).toBe('fixed');
    expect(host.querySelectorAll(':scope > .settings-surface')).toHaveLength(1);
    expect(host.querySelector('#adminGrid')).toBeNull();
  });

  it('does not claim unrelated Settings detail or dashboard routes', async () => {
    host.dataset.dashboardLayout = 'custom';
    expect(await renderSettingsSurface(host, { slug: 'home' })).toBe(false);
    expect(await renderSettingsSurface(host, { slug: 'settings/custom-tool/edit/1' })).toBe(false);
    expect(host.dataset.dashboardLayout).toBe('custom');
  });

  it('keeps the same full-page boundary while a load fails and retries', async () => {
    (window.meltdownEmit as jest.Mock).mockRejectedValue(new Error('offline'));
    await renderSettingsSurface(host, { slug: 'settings/general' });
    expect(host.dataset.dashboardLayout).toBe('fixed');
    expect(host.querySelector('.settings-surface [role="alert"]')?.textContent).toContain('SETTINGS_LOAD_FAILED');
    (window.meltdownEmit as jest.Mock).mockResolvedValue('');
    host.querySelector<HTMLButtonElement>('button')!.click(); await settle();
    expect(host.querySelectorAll(':scope > .settings-surface')).toHaveLength(1);
    expect(host.querySelector('input')).not.toBeNull();
  });

  it('discards one form without losing a draft in another tab', async () => {
    await renderSettingsSurface(host, { slug: 'settings/design' });
    const fields = [host.querySelector<HTMLInputElement>('input')!, host.querySelector<HTMLInputElement>('input[type="password"]')!];
    fields[0].value = '/new.png'; fields[1].value = 'pending key';
    fields.forEach(field => field.dispatchEvent(new Event('input', { bubbles: true })));
    const discard = [...host.querySelectorAll('button')].find(button => button.textContent === 'Discard changes')!;
    discard.click();
    expect(fields[0].value).toBe(''); expect(fields[1].value).toBe('pending key');
    expect(await confirmWorkspaceNavigation()).toBe(false);
    expect(fields[1].type).toBe('password');
  });

  it('shares a single module tab row and preserves selections on keyboard navigation', async () => {
    const nav = document.createElement('nav'); document.body.prepend(nav);
    await renderModules(host, { tabsHost: nav });
    const tabs = [...nav.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map(tab => tab.textContent)).toEqual(['Installed', 'System']);
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('.module-detail-panel h3')?.textContent).toBe('pagesManager');
    tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(host.querySelector('.module-detail-panel h3')?.textContent).toBe('example');
    expect(moduleData.fetchModuleLists).toHaveBeenCalledTimes(1);
  });

  it('integrates people and permission groups into one Settings tablist', async () => {
    const nav = document.createElement('nav'); document.body.prepend(nav);
    const tabs = createTabSystem(host, nav, { variant: 'underline' });
    await renderUsers(host, { tabs });
    tabs.addTab('Sign-in methods');
    expect([...nav.querySelectorAll('button')].map(button => button.textContent)).toEqual(['Users', 'Permission groups', 'Sign-in methods']);
    expect(host.querySelector('.user-list-card')).toBeNull();
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/admin/settings/users/edit/1');
    expect(host.querySelector<HTMLButtonElement>('.button.primary')?.textContent).toBe('Add user');
  });

  it('keeps module categories separate from the account and sign-in workflow', async () => {
    await renderSettingsSurface(host, { slug: 'settings/modules' });
    expect([...host.querySelectorAll('[role="tab"]')].map(tab => tab.textContent)).toEqual(['Installed', 'System']);
    await renderSettingsSurface(host, { slug: 'settings/users-access' });
    expect([...host.querySelectorAll('[role="tab"]')].map(tab => tab.textContent)).toEqual(['Users', 'Permission groups', 'Sign-in methods', 'Registration & agents']);
    expect(host.querySelectorAll('[role="tablist"]')).toHaveLength(1);
    await renderSettingsSurface(host, { slug: 'settings/security' });
    expect(host.querySelector('input[name="allowRegistration"]')).toBeNull();
    expect(host.textContent).toContain('Site availability');
  });

  it('rebuilds the complete module tablist on retry without orphaned tabs', async () => {
    (moduleData.fetchModuleLists as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await renderSettingsSurface(host, { slug: 'settings/modules' });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('SETTINGS_LOAD_FAILED');
    host.querySelector<HTMLButtonElement>('button')!.click(); await settle();
    expect([...host.querySelectorAll('[role="tab"]')].map(tab => tab.textContent)).toEqual(['Installed', 'System']);
    expect(host.querySelectorAll('[role="tabpanel"]')).toHaveLength(2);
  });

  it('retains failed registration drafts, prevents duplicate saves and offers retry', async () => {
    await renderAccess(host);
    const toggle = host.querySelector<HTMLInputElement>('#access-allow-registration')!;
    toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(accessData.setAllowRegistration).not.toHaveBeenCalled();
    let reject!: (error: Error) => void;
    (accessData.setAllowRegistration as jest.Mock).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const save = [...host.querySelectorAll('button')].find(button => button.textContent === 'Save registration settings')!;
    save.click(); save.click();
    expect(accessData.setAllowRegistration).toHaveBeenCalledTimes(1);
    reject(new Error('offline')); await settle();
    expect(toggle.checked).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('SETTINGS_REGISTRATION_SAVE_FAILED');
    save.click(); await settle();
    expect(await confirmWorkspaceNavigation()).toBe(true);
  });
});
