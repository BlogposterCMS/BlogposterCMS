const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const togglePassword = document.getElementById('togglePassword');
const allowWeak = document.querySelector('meta[name="allow-weak-creds"]')?.content === 'true';
const devAutologin = document.querySelector('meta[name="dev-autologin"]')?.content === 'true';
const devUser = document.querySelector('meta[name="dev-user"]')?.content || 'admin';

togglePassword.addEventListener('click', () => {
  const pwd = document.getElementById('password');
  const isText = pwd.type === 'text';
  pwd.type = isText ? 'password' : 'text';
  togglePassword.textContent = isText ? 'Show' : 'Hide';
});

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const { username, password } = e.target;
  loginError.textContent = '';

  const params = new URLSearchParams(window.location.search);
  let redirectTo = params.get('redirectTo') || '/admin';
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

  const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]').content;

  try {
    const resp = await window.fetchWithTimeout('/admin/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN
      },
      body: JSON.stringify({
        username: username.value,
        password: password.value
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(errText || 'Login failed');
    }

    window.location.assign(redirectTo);
  } catch (err) {
    loginError.textContent = err.message || 'Login failed';
  }
});

if (devAutologin && allowWeak) {
  loginForm.username.value = devUser;
  loginForm.password.value = '123';
  loginForm.dispatchEvent(new Event('submit'));
}
