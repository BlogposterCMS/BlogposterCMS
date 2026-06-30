/**
 * @jest-environment jsdom
 */

import {
  fetchRecentNotifications,
  notificationItems
} from '../ui/shell/notifications/notificationHubData';

describe('notificationHubData', () => {
  it('normalizes notification arrays', () => {
    expect(notificationItems([{ message: 'Hi' }, null, 'bad'])).toEqual([{ message: 'Hi' }]);
    expect(notificationItems({ data: [] })).toEqual([]);
  });

  it('fetches recent notifications through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue([{ message: 'One' }]);

    await expect(fetchRecentNotifications(emit, 'admin-token')).resolves.toEqual([{ message: 'One' }]);
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'notifications',
      action: 'recent',
      params: { limit: 5 }
    });
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(fetchRecentNotifications(undefined as never, 'admin-token'))
      .rejects.toThrow('SHELL_NOTIFICATION_HUB_EMITTER_UNAVAILABLE');
  });
});
