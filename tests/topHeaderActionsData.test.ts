/**
 * @jest-environment jsdom
 */

import {
  buildProjectNameSettingPayload,
  buildMaintenanceSettingPayload,
  disableMaintenanceMode,
  errorMessage,
  fetchMaintenanceMode,
  fetchProjectName,
  parseSettingText,
  parseMaintenanceValue
} from '../ui/shell/dashboard/topHeaderActionsData';

describe('topHeaderActionsData', () => {
  it('builds maintenance setting payloads and parses setting values', () => {
    expect(buildMaintenanceSettingPayload('admin-token')).toEqual({
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'MAINTENANCE_MODE'
    });
    expect(buildMaintenanceSettingPayload('', { value: 'false' })).toEqual({
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'MAINTENANCE_MODE',
      value: 'false'
    });
    expect(parseMaintenanceValue(true)).toBe(true);
    expect(parseMaintenanceValue('TRUE')).toBe(true);
    expect(parseMaintenanceValue({ value: 'false' })).toBe(false);
    expect(parseMaintenanceValue({ value: 1 })).toBe(true);
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('fetches maintenance mode through settingsManager', async () => {
    const emit = jest.fn().mockResolvedValue({ value: 'true' });

    await expect(fetchMaintenanceMode(emit, 'admin-token')).resolves.toBe(true);
    expect(emit).toHaveBeenCalledWith('getSetting', {
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'MAINTENANCE_MODE'
    });
  });

  it('disables maintenance mode through settingsManager', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await disableMaintenanceMode(emit, 'admin-token');

    expect(emit).toHaveBeenCalledWith('setSetting', {
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'MAINTENANCE_MODE',
      value: 'false'
    });
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(fetchMaintenanceMode(undefined as never, 'admin-token'))
      .rejects.toThrow('SHELL_TOP_HEADER_EMITTER_UNAVAILABLE');
    await expect(disableMaintenanceMode(undefined as never, 'admin-token'))
      .rejects.toThrow('SHELL_TOP_HEADER_EMITTER_UNAVAILABLE');
  });

  it('fetches the visible project name from the site title setting', async () => {
    const emit = jest.fn().mockResolvedValue({ value: '  Studio CMS  ' });

    await expect(fetchProjectName(emit, 'admin-token')).resolves.toBe('Studio CMS');
    expect(emit).toHaveBeenCalledWith('getSetting', {
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'SITE_TITLE'
    });
    expect(buildProjectNameSettingPayload('admin-token')).toEqual({
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'SITE_TITLE'
    });
    expect(parseSettingText({ value: '' })).toBe('Blogposter');
    expect(parseSettingText(null)).toBe('Blogposter');
  });
});
