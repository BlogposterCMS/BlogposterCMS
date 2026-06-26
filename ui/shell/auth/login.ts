import { presetColors } from '../../shared/controls/colorPicker.js';
import { readLoginCredentials, writeLoginCredentials } from './loginData.js';

const loginForm = document.getElementById('loginForm') as HTMLFormElement | null;
const loginError = document.getElementById('loginError');
const togglePassword = document.getElementById('togglePassword');
const allowWeak = document.querySelector<HTMLMetaElement>('meta[name="allow-weak-creds"]')?.content === 'true';
const devAutologin = document.querySelector<HTMLMetaElement>('meta[name="dev-autologin"]')?.content === 'true';
const devUser = document.querySelector<HTMLMetaElement>('meta[name="dev-user"]')?.content || 'admin';

function messageFromError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function safeRedirectTarget(rawRedirect: string | null): string {
  let redirectTo = rawRedirect || '/admin';
  try {
    const url = new URL(redirectTo, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/admin')) {
      redirectTo = '/admin';
    } else {
      redirectTo = url.pathname + url.search + url.hash;
    }
  } catch (err) {
    redirectTo = '/admin';
  }
  return redirectTo;
}

togglePassword?.addEventListener('click', () => {
  const pwd = document.getElementById('password') as HTMLInputElement | null;
  if (!pwd) return;
  const isText = pwd.type === 'text';
  pwd.type = isText ? 'password' : 'text';
  togglePassword.textContent = isText ? 'Show' : 'Hide';
});

loginForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.currentTarget as HTMLFormElement;
  if (loginError) loginError.textContent = '';

  const params = new URLSearchParams(window.location.search);
  const redirectTo = safeRedirectTarget(params.get('redirectTo'));
  const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '';

  try {
    const credentials = readLoginCredentials(form);
    if (!window.fetchWithTimeout) throw new Error('fetchWithTimeout unavailable');
    const resp = await window.fetchWithTimeout('/admin/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(errText || 'Login failed');
    }

    window.location.assign(redirectTo);
  } catch (err) {
    if (loginError) loginError.textContent = messageFromError(err) || 'Login failed';
  }
});

if (loginForm && devAutologin && allowWeak) {
  const form = loginForm as HTMLFormElement;
  writeLoginCredentials(form, { username: devUser, password: '123' });
  form.dispatchEvent(new Event('submit'));
}

const root = document.documentElement;
let colorIndex = 0;
function cycleAccentColor(): void {
  const color = presetColors[colorIndex % presetColors.length] || '#008080';
  root.style.setProperty('--user-color', color);
  colorIndex += 1;
}

cycleAccentColor();
setInterval(cycleAccentColor, 5000);
