/** @jest-environment jsdom */
import { renderSettingsSurface } from '../ui/widgets/plainspace/admin/settings/settingsPanels';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';
import { confirmWorkspaceNavigation } from '../ui/shared/navigation/workspaceChanges';

// UI Kit controls are unrelated to settings persistence and load independently.
jest.mock('../ui/widgets/plainspace/admin/settings/uiKitGallery', () => ({ renderUiKitGallery: jest.fn() }));

jest.mock('../ui/shared/dialogs/bpDialog', () => ({ bpDialog: {
  confirm: jest.fn().mockResolvedValue(false), alert: jest.fn().mockResolvedValue(undefined)
} }));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Settings workspace save and recovery', () => {
  let host: HTMLElement;
  let emit: jest.Mock;
  const button = (text: string) => [...host.querySelectorAll('button')].find(item => item.textContent === text)!;
  beforeEach(() => {
    jest.clearAllMocks();
    host = document.createElement('main');
    document.body.replaceChildren(host);
    window.ADMIN_TOKEN = 'test';
    emit = jest.fn(async () => '');
    window.meltdownEmit = emit;
  });
  afterEach(() => document.body.replaceChildren());

  it('opens General from the Settings entry instead of an empty customizable dashboard', async () => {
    expect(await renderSettingsSurface(host, { slug: 'settings' })).toBe(true);
    expect(host.textContent).toContain('General Settings');
    expect(button('Save general settings')).toBeTruthy();
  });

  it('retains other-tab drafts after saving one settings section', async () => {
    await renderSettingsSurface(host, { slug: 'settings/design' });

    const fields = [host.querySelector<HTMLInputElement>('[aria-label="Favicon URL"]')!, host.querySelector<HTMLInputElement>('input[type="password"]')!];
    fields[0].value = '/favicon.png';
    fields[1].value = 'pending typography';
    fields[0].dispatchEvent(new Event('input', { bubbles: true }));
    button('Save changes').click();
    await settle();
    expect(host.textContent).toContain('Branding saved.');
    expect(await confirmWorkspaceNavigation()).toBe(false);
    fields[1].value = '';
    expect(await confirmWorkspaceNavigation()).toBe(true);
  });

  it('serializes saves and keeps a failed draft available for retry', async () => {
    await renderSettingsSurface(host, { slug: 'settings/seo' });
    host.querySelector('input')!.value = 'Changed';
    let reject!: (error: Error) => void;
    emit.mockImplementation((_event, payload) => payload.resource === 'agentSurface'
      ? Promise.resolve([])
      : new Promise((_, fail) => { reject = fail; }));
    emit.mockClear();
    button('Save SEO settings').click();
    button('Save SEO settings').click();
    // SEO defaults have one authoritative write, including double-click protection.
    expect(emit).toHaveBeenCalledTimes(1);
    expect(await confirmWorkspaceNavigation()).toBe(false);
    expect(bpDialog.alert).toHaveBeenCalled();
    reject(new Error('offline'));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('SETTINGS_SAVE_FAILED: offline');
    expect(host.querySelector('input')!.value).toBe('Changed');
    expect(await confirmWorkspaceNavigation()).toBe(false);
    emit.mockResolvedValue({ ok: true });
    button('Save SEO settings').click();
    await settle();
    expect(await confirmWorkspaceNavigation()).toBe(true);
  });

  it('retries a failed initial load without rendering a false empty form', async () => {
    emit.mockRejectedValue(new Error('offline'));
    await renderSettingsSurface(host, { slug: 'settings/general' });
    expect(host.querySelector('input')).toBeNull();
    expect(host.textContent).toContain('SETTINGS_LOAD_FAILED: offline');
    // Privacy is a structured setting; site identity remains plain text.
    emit.mockImplementation(async (_event, payload) => payload.params?.key === 'WEBSITE_ANALYTICS_CONFIG' ? '' : 'Site name');
    button('Retry').click();
    await settle();
    expect(host.querySelector('input')?.value).toBe('Site name');
    expect(host.textContent).not.toContain('SETTINGS_LOAD_FAILED');
  });
});
