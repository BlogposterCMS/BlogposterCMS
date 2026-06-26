/**
 * @jest-environment jsdom
 */

import {
  fetchUserColor,
  isValidHex,
  uiColorFromUserDetails,
  userIdFromTokenResult
} from '../ui/shell/theme/userColorData';

describe('userColorData', () => {
  it('normalizes token and user color payloads', () => {
    expect(isValidHex('#AABBcc')).toBe(true);
    expect(isValidHex('blue')).toBe(false);
    expect(userIdFromTokenResult({ userId: 42 })).toBe(42);
    expect(userIdFromTokenResult({})).toBeNull();
    expect(uiColorFromUserDetails({ data: { ui_color: '#112233' } })).toBe('#112233');
    expect(uiColorFromUserDetails({ ui_color: '#445566' })).toBe('#445566');
    expect(uiColorFromUserDetails({ ui_color: 'bad' })).toBeNull();
  });

  it('fetches user color through auth and userManagement contracts', async () => {
    const emit = jest.fn(async eventName => {
      if (eventName === 'validateToken') return { userId: 'user-1' };
      if (eventName === 'getUserDetailsById') return { data: { ui_color: '#123456' } };
      return undefined;
    });

    await expect(fetchUserColor(emit, 'admin-token')).resolves.toBe('#123456');
    expect(emit).toHaveBeenCalledWith('validateToken', {
      moduleName: 'auth',
      moduleType: 'core',
      jwt: 'admin-token',
      tokenToValidate: 'admin-token'
    });
    expect(emit).toHaveBeenCalledWith('getUserDetailsById', {
      moduleName: 'userManagement',
      moduleType: 'core',
      userId: 'user-1',
      jwt: 'admin-token'
    });
  });

  it('returns null for missing tokens or user ids', async () => {
    const emit = jest.fn().mockResolvedValue({});

    await expect(fetchUserColor(emit, '')).resolves.toBeNull();
    await expect(fetchUserColor(emit, 'admin-token')).resolves.toBeNull();
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(fetchUserColor(undefined as never, 'admin-token'))
      .rejects.toThrow('SHELL_USER_COLOR_EMITTER_UNAVAILABLE');
  });
});
