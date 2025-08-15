document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { username, password } = e.target;

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
    alert(err.message);
  }
});
