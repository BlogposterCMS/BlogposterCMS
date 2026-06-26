/**
 * @jest-environment jsdom
 */

import {
  errorMessage,
  fetchFontProviders,
  fetchFontProvidersState,
  fetchGoogleFontsKey,
  refreshFontProviderCatalog,
  saveGoogleFontsKey,
  setFontProviderEnabled,
  toProviders
} from '../ui/widgets/plainspace/admin/fontsListData';

describe('fontsListData', () => {
  it('normalizes provider payloads and error messages', () => {
    expect(toProviders({
      data: [
        { name: 'googleFonts', description: 'Google Fonts', isEnabled: true },
        { name: 42 },
        null
      ]
    })).toEqual([{ name: 'googleFonts', description: 'Google Fonts', isEnabled: true }]);
    expect(toProviders([{ name: 'localFonts' }])).toEqual([{ name: 'localFonts' }]);
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('fetches providers and the Google Fonts key', async () => {
    const emit = jest.fn(async eventName => (
      eventName === 'listFontProviders'
        ? { data: [{ name: 'googleFonts', isEnabled: false }] }
        : '  AIza-key  '
    ));

    await expect(fetchFontProviders(emit, 'admin-token')).resolves.toEqual([
      { name: 'googleFonts', isEnabled: false }
    ]);
    await expect(fetchGoogleFontsKey(emit, 'admin-token')).resolves.toBe('AIza-key');
    expect(emit).toHaveBeenCalledWith('listFontProviders', {
      jwt: 'admin-token',
      moduleName: 'fontsManager',
      moduleType: 'core'
    });
    expect(emit).toHaveBeenCalledWith('getSetting', {
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'GOOGLE_FONTS_API_KEY'
    });
  });

  it('returns an empty Google Fonts key when the setting cannot be read', async () => {
    const emit = jest.fn().mockRejectedValue(new Error('missing'));

    await expect(fetchGoogleFontsKey(emit, 'admin-token')).resolves.toBe('');
  });

  it('fetches the full font provider state', async () => {
    const emit = jest.fn(async eventName => (
      eventName === 'listFontProviders'
        ? { data: [{ name: 'localFonts', isEnabled: true }] }
        : 'key'
    ));

    await expect(fetchFontProvidersState(emit, 'admin-token')).resolves.toEqual({
      providers: [{ name: 'localFonts', isEnabled: true }],
      googleFontsKey: 'key'
    });
  });

  it('toggles providers and saves the Google Fonts key', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await setFontProviderEnabled(emit, 'admin-token', 'googleFonts', true);
    await expect(saveGoogleFontsKey(emit, 'admin-token', '  next-key  ')).resolves.toBe('next-key');

    expect(emit).toHaveBeenCalledWith('setFontProviderEnabled', {
      jwt: 'admin-token',
      moduleName: 'fontsManager',
      moduleType: 'core',
      providerName: 'googleFonts',
      enabled: true
    });
    expect(emit).toHaveBeenCalledWith('setSetting', {
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'GOOGLE_FONTS_API_KEY',
      value: 'next-key'
    });
  });

  it('refreshes enabled providers by cycling them and disabled providers by enabling them', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await refreshFontProviderCatalog(emit, 'admin-token', 'googleFonts', true);
    await refreshFontProviderCatalog(emit, 'admin-token', 'localFonts', false);

    expect(emit).toHaveBeenNthCalledWith(1, 'setFontProviderEnabled', {
      jwt: 'admin-token',
      moduleName: 'fontsManager',
      moduleType: 'core',
      providerName: 'googleFonts',
      enabled: false
    });
    expect(emit).toHaveBeenNthCalledWith(2, 'setFontProviderEnabled', {
      jwt: 'admin-token',
      moduleName: 'fontsManager',
      moduleType: 'core',
      providerName: 'googleFonts',
      enabled: true
    });
    expect(emit).toHaveBeenNthCalledWith(3, 'setFontProviderEnabled', {
      jwt: 'admin-token',
      moduleName: 'fontsManager',
      moduleType: 'core',
      providerName: 'localFonts',
      enabled: true
    });
  });
});
