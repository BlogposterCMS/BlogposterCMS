/**
 * @jest-environment jsdom
 */

import {
  createPermissionRecord,
  fetchPermissions,
  fetchPermissionsState,
  toPermissions
} from '../ui/widgets/plainspace/admin/permissionsData';

describe('permissionsData', () => {
  it('normalizes permission payloads', () => {
    expect(toPermissions({
      data: [
        { permission_key: 'pages.edit', description: 'Edit pages' },
        null,
        'bad'
      ]
    })).toEqual([{ permission_key: 'pages.edit', description: 'Edit pages' }]);
    expect(toPermissions([{ permission_key: 'media.upload' }]))
      .toEqual([{ permission_key: 'media.upload' }]);
  });

  it('fetches permissions through the user-management module', async () => {
    const emit = jest.fn().mockResolvedValue({
      data: [{ permission_key: 'pages.edit' }]
    });

    await expect(fetchPermissions(emit, 'admin-token')).resolves.toEqual([{ permission_key: 'pages.edit' }]);
    expect(emit).toHaveBeenCalledWith('getAllPermissions', {
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core'
    });
  });

  it('fetches permissions and roles as a single state object', async () => {
    const emit = jest.fn(async eventName => (
      eventName === 'getAllPermissions'
        ? { data: [{ permission_key: 'pages.edit' }] }
        : { data: [{ id: 'admin', role_name: 'Admin' }] }
    ));

    await expect(fetchPermissionsState(emit, 'admin-token')).resolves.toEqual({
      permissions: [{ permission_key: 'pages.edit' }],
      roles: [{ id: 'admin', role_name: 'Admin' }]
    });
    expect(emit).toHaveBeenCalledWith('getAllPermissions', {
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core'
    });
    expect(emit).toHaveBeenCalledWith('getAllRoles', {
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core'
    });
  });

  it('creates permissions through an explicit user-management event', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await createPermissionRecord(emit, 'admin-token', {
      permissionKey: 'pages.publish',
      description: 'Publish pages'
    });

    expect(emit).toHaveBeenCalledWith('createPermission', {
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core',
      permissionKey: 'pages.publish',
      description: 'Publish pages'
    });
  });
});
