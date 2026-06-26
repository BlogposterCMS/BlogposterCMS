/**
 * @jest-environment jsdom
 */

import {
  createRoleRecord,
  createUserRecord,
  deleteRoleRecord,
  errorMessage,
  fetchRoles,
  fetchUsers,
  permissionsPromptDefault,
  toRoles,
  toUsers,
  updateRoleRecord
} from '../ui/widgets/plainspace/admin/usersListData';

describe('usersListData', () => {
  it('normalizes user and role payloads and formats prompt defaults', () => {
    expect(toUsers({
      data: [
        { id: '1', username: 'ada' },
        null,
        'bad'
      ]
    })).toEqual([{ id: '1', username: 'ada' }]);
    expect(toUsers([{ id: '2', email: 'grace@example.test' }]))
      .toEqual([{ id: '2', email: 'grace@example.test' }]);
    expect(toRoles({
      data: [
        { id: 'admin', role_name: 'Admin' },
        false
      ]
    })).toEqual([{ id: 'admin', role_name: 'Admin' }]);
    expect(permissionsPromptDefault('{"pages":true}')).toBe('{"pages":true}');
    expect(permissionsPromptDefault({ pages: true })).toBe('{"pages":true}');
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('fetches users and roles through the user-management module', async () => {
    const emit = jest.fn(async eventName => (
      eventName === 'getAllUsers'
        ? { data: [{ id: '1', username: 'ada' }] }
        : [{ id: 'admin', role_name: 'Admin' }]
    ));

    await expect(fetchUsers(emit, 'admin-token')).resolves.toEqual([{ id: '1', username: 'ada' }]);
    await expect(fetchRoles(emit, 'admin-token')).resolves.toEqual([{ id: 'admin', role_name: 'Admin' }]);
    expect(emit).toHaveBeenCalledWith('getAllUsers', {
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

  it('creates users and permission groups through explicit events', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await createUserRecord(emit, 'admin-token', {
      username: 'ada',
      password: 'secret',
      email: 'ada@example.test'
    });
    await createRoleRecord(emit, 'admin-token', {
      roleName: 'Editors',
      permissions: { pages: true }
    });

    expect(emit).toHaveBeenCalledWith('createUser', {
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core',
      username: 'ada',
      password: 'secret',
      email: 'ada@example.test'
    });
    expect(emit).toHaveBeenCalledWith('createRole', {
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core',
      roleName: 'Editors',
      permissions: { pages: true }
    });
  });

  it('updates and deletes permission groups through explicit events', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const role = { id: 'role-1', role_name: 'Editors' };

    await updateRoleRecord(emit, 'admin-token', role, {
      roleName: 'Senior Editors',
      description: 'Can edit content',
      permissions: { pages: true }
    });
    await deleteRoleRecord(emit, 'admin-token', role);

    expect(emit).toHaveBeenCalledWith('updateRole', {
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core',
      roleId: 'role-1',
      newRoleName: 'Senior Editors',
      newDescription: 'Can edit content',
      newPermissions: { pages: true }
    });
    expect(emit).toHaveBeenCalledWith('deleteRole', {
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core',
      roleId: 'role-1'
    });
  });
});
