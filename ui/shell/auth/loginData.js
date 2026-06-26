function requireInput(form, name) {
    const field = form.elements.namedItem(name);
    if (!(field instanceof HTMLInputElement)) {
        throw new Error(`SHELL_LOGIN_FIELD_MISSING: ${name}`);
    }
    return field;
}
export function readLoginCredentials(form) {
    const username = requireInput(form, 'username').value;
    const password = requireInput(form, 'password').value;
    return { username, password };
}
export function writeLoginCredentials(form, credentials) {
    requireInput(form, 'username').value = credentials.username;
    requireInput(form, 'password').value = credentials.password;
}
