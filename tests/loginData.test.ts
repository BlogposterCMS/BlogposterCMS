/**
 * @jest-environment jsdom
 */

import {
  readLoginCredentials,
  writeLoginCredentials
} from '../ui/shell/auth/loginData';

function loginForm(html = `
  <form id="loginForm">
    <input id="username" name="username">
    <input id="password" name="password" type="password">
  </form>
`) {
  document.body.innerHTML = html;
  const form = document.getElementById('loginForm');
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('test setup failed');
  }
  return form;
}

describe('loginData', () => {
  it('reads login fields through form.elements instead of direct form properties', () => {
    const form = loginForm();
    (form.elements.namedItem('username') as HTMLInputElement).value = 'admin';
    (form.elements.namedItem('password') as HTMLInputElement).value = 'secret';

    expect((form as HTMLFormElement & { username?: HTMLInputElement }).username).toBeUndefined();
    expect(readLoginCredentials(form)).toEqual({
      username: 'admin',
      password: 'secret'
    });
  });

  it('writes dev autologin credentials through the same stable field lookup', () => {
    const form = loginForm();

    writeLoginCredentials(form, { username: 'dev-admin', password: '123' });

    expect((form.elements.namedItem('username') as HTMLInputElement).value).toBe('dev-admin');
    expect((form.elements.namedItem('password') as HTMLInputElement).value).toBe('123');
  });

  it('fails with a searchable error code when a required field is missing', () => {
    const form = loginForm('<form id="loginForm"><input name="username"></form>');

    expect(() => readLoginCredentials(form)).toThrow('SHELL_LOGIN_FIELD_MISSING: password');
  });
});
