export interface LoginCredentials {
  username: string;
  password: string;
}

function requireInput(form: HTMLFormElement, name: string): HTMLInputElement {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) {
    throw new Error(`SHELL_LOGIN_FIELD_MISSING: ${name}`);
  }
  return field;
}

export function readLoginCredentials(form: HTMLFormElement): LoginCredentials {
  const username = requireInput(form, 'username').value;
  const password = requireInput(form, 'password').value;
  return { username, password };
}

export function writeLoginCredentials(form: HTMLFormElement, credentials: LoginCredentials): void {
  requireInput(form, 'username').value = credentials.username;
  requireInput(form, 'password').value = credentials.password;
}
