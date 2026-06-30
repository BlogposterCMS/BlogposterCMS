/**
 * @jest-environment jsdom
 */

import {
  asSetting,
  boolToString,
  errorMessage,
  fetchDesignSettings,
  fetchGeneralSettings,
  fetchSecuritySettings,
  fetchSeoSettings,
  pickMediaShareUrl,
  publicPages,
  saveAllowRegistration,
  saveGeneralSettings,
  saveMaintenanceSettings,
  saveSeoSettings,
  stringToBool,
  toPages
} from '../ui/widgets/plainspace/admin/settings/settingsPanelsData';

describe('settingsPanelsData', () => {
  it('normalizes settings, booleans, errors, and page lists', () => {
    expect(asSetting(null)).toBe('');
    expect(asSetting(42)).toBe('42');
    expect(boolToString(true)).toBe('true');
    expect(boolToString(false)).toBe('false');
    expect(stringToBool('true')).toBe(true);
    expect(stringToBool('false')).toBe(false);
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
    expect(toPages({ data: [{ id: 1, lane: 'public' }, null, 'bad'] }))
      .toEqual([{ id: 1, lane: 'public' }]);
    expect(publicPages([{ id: 1, lane: 'public' }, { id: 2, lane: 'admin' }]))
      .toEqual([{ id: 1, lane: 'public' }]);
  });

  it('fetches general, design, and SEO settings through the runtime admin facade', async () => {
    const settings: Record<string, string> = {
      SITE_TITLE: 'Blogposter',
      SITE_DESC: 'CMS',
      FAVICON_URL: '/favicon.ico',
      GOOGLE_FONTS_API_KEY: 'font-key',
      SEO_META_DESCRIPTION: 'Meta',
      SEO_TITLE_TEMPLATE: '%title%',
      SEO_INDEXING_ENABLED: ''
    };
    const emit = jest.fn(async (_eventName, payload) => settings[payload.params.key] ?? '');

    await expect(fetchGeneralSettings(emit, 'admin-token')).resolves.toEqual({
      siteTitle: 'Blogposter',
      siteDescription: 'CMS'
    });
    await expect(fetchDesignSettings(emit, 'admin-token')).resolves.toEqual({
      faviconUrl: '/favicon.ico',
      googleFontsApiKey: 'font-key'
    });
    await expect(fetchSeoSettings(emit, 'admin-token')).resolves.toEqual({
      metaDescription: 'Meta',
      titleTemplate: '%title%',
      indexingEnabled: true
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'get',
      params: { key: 'SITE_TITLE' }
    }));
  });

  it('fetches security settings with public maintenance pages', async () => {
    const settings: Record<string, string> = {
      ALLOW_REGISTRATION: 'true',
      FIRST_INSTALL_DONE: 'true',
      MAINTENANCE_MODE: 'false',
      MAINTENANCE_PAGE_ID: 'home'
    };
    const emit = jest.fn(async (_eventName, payload) => {
      if (payload.resource === 'pages' && payload.action === 'list') {
        return { data: [{ id: 'home', lane: 'public' }, { id: 'admin', lane: 'admin' }] };
      }
      return settings[payload.params.key] ?? '';
    });

    await expect(fetchSecuritySettings(emit, 'admin-token')).resolves.toEqual({
      allowRegistration: true,
      firstInstallDone: true,
      maintenanceMode: false,
      maintenancePageId: 'home',
      publicPages: [{ id: 'home', lane: 'public' }]
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'list',
      params: {}
    });
  });

  it('saves grouped settings through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await saveGeneralSettings(emit, 'admin-token', {
      siteTitle: 'New title',
      siteDescription: 'New desc'
    });
    await saveSeoSettings(emit, 'admin-token', {
      metaDescription: 'Meta',
      titleTemplate: '%title%',
      indexingEnabled: false
    });
    await saveAllowRegistration(emit, 'admin-token', true);
    await saveMaintenanceSettings(emit, 'admin-token', true, 'maintenance');

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'set',
      params: {
        key: 'SITE_TITLE',
        value: 'New title'
      }
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'set',
      params: {
        key: 'SEO_INDEXING_ENABLED',
        value: 'false'
      }
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'set',
      params: {
        key: 'MAINTENANCE_PAGE_ID',
        value: 'maintenance'
      }
    });
  });

  it('picks a media share URL when the media explorer returns one', async () => {
    const emit = jest.fn().mockResolvedValue({ shareURL: '/media/favicon.ico' });

    await expect(pickMediaShareUrl(emit, 'admin-token')).resolves.toBe('/media/favicon.ico');
    expect(emit).toHaveBeenCalledWith('openMediaExplorer', { jwt: 'admin-token' });

    emit.mockResolvedValueOnce({ cancelled: true, shareURL: '/media/nope.ico' });
    await expect(pickMediaShareUrl(emit, 'admin-token')).resolves.toBeNull();
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(fetchGeneralSettings(undefined as never, 'admin-token'))
      .rejects.toThrow('PLAINSPACE_SETTINGS_PANELS_EMITTER_UNAVAILABLE');
  });
});
