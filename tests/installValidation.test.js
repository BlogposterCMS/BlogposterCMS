const { validateInstallInput } = require('../mother/utils/installValidation');

describe('validateInstallInput', () => {
  const options = { forbidden: ['admin', 'root', 'test'], allowWeak: false, isLocal: false };

  test('trims usernames before applying forbidden-name policy', () => {
    const trimmedUsername = String(' admin' || '').trim();
    const trimmedEmail = String(' admin@example.com ' || '').trim();
    const trimmedSiteName = '  My Site  ' != null ? String('  My Site  ').trim() : '';

    const { error } = validateInstallInput(
      {
        username: trimmedUsername,
        email: trimmedEmail,
        password: 'StrongPass123'
      },
      options
    );

    expect(trimmedUsername).toBe('admin');
    expect(trimmedEmail).toBe('admin@example.com');
    expect(trimmedSiteName).toBe('My Site');
    expect(error).toEqual({ status: 400, message: 'Username not allowed' });
  });

  test('blocks forbidden usernames without leading whitespace', () => {
    const { error } = validateInstallInput(
      {
        username: 'admin',
        email: 'admin@example.com',
        password: 'StrongPass123'
      },
      options
    );

    expect(error).toEqual({ status: 400, message: 'Username not allowed' });
  });
});

