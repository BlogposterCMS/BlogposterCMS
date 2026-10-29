/** @jest-environment jsdom */
import { bpDialog } from '../ui/shared/dialogs/bpDialog';
import { render as renderUser } from '../ui/widgets/plainspace/admin/userEditWidget';
import { render as renderProvider } from '../ui/widgets/plainspace/admin/loginStrategyEditWidget';
import { confirmWorkspaceNavigation } from '../ui/shared/navigation/workspaceChanges';
import * as userData from '../ui/widgets/plainspace/admin/userEditData';
import * as providerData from '../ui/widgets/plainspace/admin/loginStrategyEditData';

jest.mock('../ui/widgets/plainspace/admin/userEditData', () => ({
  ...jest.requireActual('../ui/widgets/plainspace/admin/userEditData'),
  fetchUserDetails: jest.fn().mockResolvedValue({ id: 12, username: 'editor' }),
  fetchRoles: jest.fn().mockResolvedValue([]), fetchPermissions: jest.fn().mockResolvedValue([]),
  fetchUserAccess: jest.fn().mockResolvedValue({ roleIds: [], directPermissions: {} }),
  updateUserProfile: jest.fn().mockResolvedValue(undefined), updateUserAccess: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../ui/widgets/plainspace/admin/loginStrategyEditData', () => ({
  ...jest.requireActual('../ui/widgets/plainspace/admin/loginStrategyEditData'),
  fetchLoginStrategySettings: jest.fn().mockResolvedValue({ clientId: 'existing', clientSecret: 'secret', scope: 'admin' }),
  saveLoginStrategySettings: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../ui/shared/dialogs/bpDialog', () => ({ bpDialog: {
  open: jest.fn(), confirm: jest.fn().mockResolvedValue(false), alert: jest.fn().mockResolvedValue(undefined)
} }));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
describe('account editor workflows', () => {
  let host: HTMLElement;
  beforeEach(() => {
    jest.clearAllMocks(); host = document.createElement('main'); document.body.replaceChildren(host);
    window.ADMIN_TOKEN = 'test'; window.PAGE_ID = 999;
    window.meltdownEmit = jest.fn().mockResolvedValue([]);
    window.history.replaceState({}, '', '/admin/settings/login/edit?strategy=github');
  });
  afterEach(() => document.body.replaceChildren());
  const button = (text: string) => [...host.querySelectorAll('button')].find(button => button.textContent === text)!;

  it('loads the selected account instead of treating the CMS page id as a user id', async () => {
    await renderUser(host, { userId: '12' });
    expect(userData.fetchUserDetails).toHaveBeenCalledWith(window.meltdownEmit, 'test', '12');
    expect(button('Save user')).toBeTruthy();
  });
  it('fails closed if existing account permissions cannot be read', async () => {
    (userData.fetchUserAccess as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await renderUser(host, { userId: '12' });
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('SETTINGS_USER_LOAD_FAILED');
    expect(userData.updateUserAccess).not.toHaveBeenCalled();
  });
  it('opens accent selection outside the form and discards the color draft without a write', async () => {
    await renderUser(host, { userId: '12' });
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Choose account accent"]')!;
    trigger.click();
    const panel = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Account accent"]')!;
    expect(panel).not.toBeNull(); expect(host.contains(panel)).toBe(false);
    panel.querySelector<HTMLButtonElement>('[aria-label="Select #FF0000"]')!.click();
    expect(trigger.style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(userData.updateUserProfile).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    button('Discard changes').click();
    expect(trigger.style.backgroundColor).toBe('rgb(23, 23, 23)');
    trigger.click();
    expect(document.querySelector('.bp-popover:not(.is-leaving) [aria-label="Select #171717"]')?.getAttribute('aria-pressed')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  it('keeps a user draft when saving fails and discards it without a write', async () => {
    await renderUser(host, { userId: '12' });
    const input = host.querySelector<HTMLInputElement>('input')!;
    const saved = input.value; input.value = 'Changed';
    (userData.updateUserProfile as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    button('Save user').click(); button('Save user').click(); await settle();
    expect(userData.updateUserProfile).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('Changed');
    expect(await confirmWorkspaceNavigation()).toBe(false);
    button('Discard changes').click();
    expect(input.value).toBe(saved); expect(await confirmWorkspaceNavigation()).toBe(true);
  });
  it('stages modal rights until Save user and restores them on Discard changes', async () => {
    (userData.fetchPermissions as jest.Mock).mockResolvedValueOnce([{ key: 'pages.read' }]);
    await renderUser(host, { userId: '12' });
    expect(host.querySelector('[data-permission-key]')).toBeNull();
    (bpDialog.open as jest.Mock).mockImplementation(async ({ body }) => {
      const choice = body.querySelector('input[type="checkbox"]');
      choice.checked = true; choice.dispatchEvent(new Event('change'));
      return { action: 'apply' };
    });
    button('Edit advanced rights').click(); await settle();
    expect(host.textContent).toContain('1 direct rights selected');
    expect(userData.updateUserAccess).not.toHaveBeenCalled();
    expect(await confirmWorkspaceNavigation()).toBe(false);
    button('Discard changes').click();
    expect(host.textContent).toContain('0 direct rights selected');
    expect(await confirmWorkspaceNavigation()).toBe(true);
    button('Edit advanced rights').click(); await settle();
    button('Save user').click(); await settle();
    expect(userData.updateUserAccess).toHaveBeenCalledWith(window.meltdownEmit, 'test', 12,
      { roleIds: [], directPermissions: { pages: { read: true } } });
    expect(await confirmWorkspaceNavigation()).toBe(true);
  });
  it('does not replace a failed provider read with editable empty credentials', async () => {
    (providerData.fetchLoginStrategySettings as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await renderProvider(host);
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('SETTINGS_SIGN_IN_LOAD_FAILED');
    button('Retry').click(); await settle();
    expect(host.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe('secret');
    expect(providerData.saveLoginStrategySettings).not.toHaveBeenCalled();
  });
});
