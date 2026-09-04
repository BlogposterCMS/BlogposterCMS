/**
 * @jest-environment jsdom
 */

jest.mock('../ui/widgets/plainspace/admin/settings/updateCenterData.js', () => ({
  approvedAccessDescriptors: jest.fn(),
  fetchUpdateCenterRows: jest.fn(),
  inspectUpdateCenterRow: jest.fn(),
  installUpdateCenterRow: jest.fn(),
  updateCenterRowLabel: jest.fn(),
  updateInspectionLabel: jest.fn(),
  updateInstallVersion: jest.fn()
}));

import { renderSettingsSurface } from '../ui/widgets/plainspace/admin/settings/settingsPanels';

describe('settings panels shared UI kit', () => {
  beforeEach(() => {
    (window as Window & { ADMIN_TOKEN?: string }).ADMIN_TOKEN = 'test-admin-token';
    window.meltdownEmit = jest.fn();
  });

  it('renders general settings with structured fields, actions, and a live status', async () => {
    const host = document.createElement('div');

    const rendered = await renderSettingsSurface(host, { slug: 'settings/general' });

    expect(rendered).toBe(true);
    expect(host.querySelectorAll('.form-field')).toHaveLength(2);
    expect(host.querySelector('.form-actions .button.primary')).not.toBeNull();
    expect(host.querySelector('.form-status[role="status"]')).not.toBeNull();

    const titleInput = host.querySelector<HTMLInputElement>('input[type="text"]');
    expect(host.querySelector(`label[for="${titleInput?.id}"]`)?.textContent).toBe('Site Title');
  });

  it('renders the UI Kit as a dedicated Settings surface', async () => {
    const host = document.createElement('div');

    const rendered = await renderSettingsSurface(host, { slug: 'settings/ui-kit' });

    expect(rendered).toBe(true);
    expect(host.querySelector('[data-ui-kit-gallery="true"]')).not.toBeNull();
    expect(host.querySelector('[data-ui-kit-section="overlays"]')).not.toBeNull();
  });
});
