/**
 * @jest-environment jsdom
 */

import {
  asSetting,
  errorMessage,
  fetchSystemSettings,
  pickFaviconUrl,
  setSystemSetting,
  toPages
} from '../ui/widgets/plainspace/admin/systemSettingsData';

describe('systemSettingsData', () => {
  it('normalizes settings and page payloads', () => {
    expect(asSetting(null)).toBe('');
    expect(asSetting(42)).toBe('42');
    expect(toPages({
      data: [
        { id: 'home', lane: 'public', title: 'Home' },
        null,
        'bad'
      ]
    })).toEqual([{ id: 'home', lane: 'public', title: 'Home' }]);
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('fetches and normalizes the system settings state', async () => {
    const values = new Map<string, unknown>([
      ['SITE_TITLE', 'Blogposter'],
      ['SITE_DESC', 'Fast CMS'],
      ['MAINTENANCE_MODE', true],
      ['MAINTENANCE_PAGE_ID', 7],
      ['FAVICON_URL', '/favicon.png'],
      ['GOOGLE_FONTS_API_KEY', '  AIza-key  ']
    ]);
    const emit = jest.fn(async (eventName: string, payload: Record<string, unknown>) => {
      if (eventName === 'getAllPages') {
        return {
          data: [
            { id: 7, lane: 'public', title: 'Maintenance' },
            { id: 8, lane: 'admin', title: 'Admin' }
          ]
        };
      }
      return values.get(String(payload.key));
    });

    await expect(fetchSystemSettings(emit, 'admin-token')).resolves.toEqual({
      siteTitle: 'Blogposter',
      siteDescription: 'Fast CMS',
      maintenanceMode: true,
      maintenancePageId: '7',
      maintenancePage: { id: 7, lane: 'public', title: 'Maintenance' },
      faviconUrl: '/favicon.png',
      pages: [
        { id: 7, lane: 'public', title: 'Maintenance' },
        { id: 8, lane: 'admin', title: 'Admin' }
      ],
      googleFontsApiKey: 'AIza-key'
    });
    expect(emit).toHaveBeenCalledWith('getSetting', {
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'SITE_TITLE'
    });
    expect(emit).toHaveBeenCalledWith('getAllPages', {
      jwt: 'admin-token',
      moduleName: 'pagesManager',
      moduleType: 'core'
    });
  });

  it('saves settings through the settings manager', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await setSystemSetting(emit, 'admin-token', 'SITE_TITLE', 'New title');

    expect(emit).toHaveBeenCalledWith('setSetting', {
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'SITE_TITLE',
      value: 'New title'
    });
  });

  it('returns selected favicon URLs and ignores cancelled picker results', async () => {
    const emit = jest
      .fn()
      .mockResolvedValueOnce({ shareURL: '/media/favicon.ico' })
      .mockResolvedValueOnce({ shareURL: '/media/ignored.ico', cancelled: true });

    await expect(pickFaviconUrl(emit, 'admin-token')).resolves.toBe('/media/favicon.ico');
    await expect(pickFaviconUrl(emit, 'admin-token')).resolves.toBeNull();
    expect(emit).toHaveBeenCalledWith('openMediaExplorer', { jwt: 'admin-token' });
  });
});
