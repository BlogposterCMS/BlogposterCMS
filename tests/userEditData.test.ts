/**
 * @jest-environment jsdom
 */

import {
  buildUserProfilePayload,
  deleteUserRecord,
  errorMessage,
  fetchPermissions,
  fetchRoles,
  fetchUserAccess,
  fetchUserDetails,
  toPermissions,
  toRoles,
  toUserAccess,
  updateUserAccess,
  toUser,
  updateUserProfile,
  userValue
} from '../ui/widgets/plainspace/admin/userEditData';

const fullValues = {
  username: ' ada ',
  email: ' ada@example.test ',
  first_name: ' Ada ',
  last_name: ' Lovelace ',
  display_name: ' Countess ',
  phone: ' 123 ',
  company: ' Notes ',
  website: ' https://example.test ',
  avatar_url: ' /avatar.png ',
  bio: ' keeps\nspacing ',
  uiColor: '#123456',
  password: ' secret '
};

describe('userEditData', () => {
  it('normalizes user payloads and field values', () => {
    expect(toUser({ data: { id: '1', username: 'ada' } })).toEqual({ id: '1', username: 'ada' });
    expect(toUser({ id: '2', email: 'grace@example.test' })).toEqual({ id: '2', email: 'grace@example.test' });
    expect(toUser(null)).toBeNull();
    expect(toRoles({ data: [{ id: 'role-1', role_name: 'Editors' }, null] }))
      .toEqual([{ id: 'role-1', role_name: 'Editors' }]);
    expect(toPermissions([{ permission_key: 'pages.read' }, null]))
      .toEqual([{ permission_key: 'pages.read' }]);
    expect(toUserAccess({ data: { roleIds: ['role-1'], directPermissions: { pages: { read: true } } } }))
      .toEqual({ roleIds: ['role-1'], directPermissions: { pages: { read: true } } });
    expect(userValue({ username: 'ada' }, 'username')).toBe('ada');
    expect(userValue({ username: undefined }, 'username')).toBe('');
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('builds the update payload with trimmed profile fields and unchanged bio text', () => {
    expect(buildUserProfilePayload('admin-token', 'user-1', fullValues)).toEqual({
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core',
      userId: 'user-1',
      newUsername: 'ada',
      newEmail: 'ada@example.test',
      newFirstName: 'Ada',
      newLastName: 'Lovelace',
      newDisplayName: 'Countess',
      newPhone: '123',
      newCompany: 'Notes',
      newWebsite: 'https://example.test',
      newAvatarUrl: '/avatar.png',
      newBio: ' keeps\nspacing ',
      newUiColor: '#123456',
      newPassword: 'secret'
    });

    expect(buildUserProfilePayload('admin-token', 'user-1', {
      ...fullValues,
      password: '   '
    })).not.toHaveProperty('newPassword');
  });

  it('fetches, updates, and deletes user profiles through explicit events', async () => {
    const emit = jest.fn(async eventName => (
      eventName === 'getUserDetailsById'
        ? { data: { id: 'user-1', username: 'ada' } }
        : eventName === 'getAllRoles'
          ? [{ id: 'role-1', role_name: 'Editors' }]
          : eventName === 'getAllPermissions'
            ? [{ permission_key: 'pages.read' }]
            : eventName === 'getUserAccess'
              ? { roleIds: ['role-1'], directPermissions: { pages: { read: true } } }
        : undefined
    ));

    await expect(fetchUserDetails(emit, 'admin-token', 'user-1')).resolves.toEqual({
      id: 'user-1',
      username: 'ada'
    });
    await expect(fetchRoles(emit, 'admin-token')).resolves.toEqual([{ id: 'role-1', role_name: 'Editors' }]);
    await expect(fetchPermissions(emit, 'admin-token')).resolves.toEqual([{ permission_key: 'pages.read' }]);
    await expect(fetchUserAccess(emit, 'admin-token', 'user-1')).resolves.toEqual({
      roleIds: ['role-1'],
      directPermissions: { pages: { read: true } }
    });
    await updateUserProfile(emit, 'admin-token', 'user-1', fullValues);
    await updateUserAccess(emit, 'admin-token', 'user-1', {
      roleIds: ['role-1'],
      directPermissions: { pages: { read: true } }
    });
    await deleteUserRecord(emit, 'admin-token', 'user-1');

    expect(emit).toHaveBeenCalledWith('getUserDetailsById', {
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core',
      userId: 'user-1'
    });
    expect(emit).toHaveBeenCalledWith('updateUserProfile', expect.objectContaining({
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core',
      userId: 'user-1',
      newUsername: 'ada',
      newPassword: 'secret'
    }));
    expect(emit).toHaveBeenCalledWith('setUserAccess', {
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core',
      userId: 'user-1',
      roleIds: ['role-1'],
      directPermissions: { pages: { read: true } }
    });
    expect(emit).toHaveBeenCalledWith('deleteUser', {
      jwt: 'admin-token',
      moduleName: 'userManagement',
      moduleType: 'core',
      userId: 'user-1'
    });
  });
});
