//public/assets/js/register.js
// A tiny emitter: wraps /api/meltdown calls
async function meltdownEmit(eventName, payload = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (payload.jwt) {
    headers['X-Public-Token'] = payload.jwt;
  }

  const resp = await window.fetchWithTimeout('/api/meltdown', {
    method: 'POST',
    headers,
    body: JSON.stringify({ eventName, payload })
  });
  const json = await resp.json();
  if (!resp.ok || json.error) {
    throw new Error(json.error || resp.statusText);
  }
  return json.data;
}

const registerForm = document.getElementById('registerForm');
let firstInstallDone = false;
let registrationAllowed = true;
let registrationRole = 'admin';

// Redirect to login if the install is finished and public registration is disabled
(async () => {
  try {
    const pubTok = await meltdownEmit('issuePublicToken', {
      purpose: 'firstInstallCheck',
      moduleName: 'auth'
    });
    const installStatus = await meltdownEmit('getPublicSetting', {
      jwt: pubTok,
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'FIRST_INSTALL_DONE'
    });
    firstInstallDone = installStatus === 'true';

    if (firstInstallDone) {
      const regToggle = await meltdownEmit('getPublicSetting', {
        jwt: pubTok,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key: 'ALLOW_REGISTRATION'
      });
      registrationAllowed = String(regToggle).toLowerCase() === 'true';
      registrationRole = 'standard';
    }

    if (!registrationAllowed) {
      alert('Public registration is disabled. Please use the login page.');
      window.location.href = '/login';
    }
  } catch (err) {
    console.error('[register] FIRST_INSTALL/ALLOW_REGISTRATION check failed', err);
  }
})();

if (registerForm) {
  registerForm.addEventListener('submit', async e => {
      e.preventDefault();
      if (!registrationAllowed) {
        alert('Registration is currently disabled.');
        window.location.href = '/login';
        return;
      }

      const form = e.target;
      const username = form.username.value.trim();
      const password = form.password.value;
      if (!username || !password) {
        return alert('Both username & password are required.');
      }
  
      try {
        // 1) get a fresh token for registration
        const pubJwt = await meltdownEmit('issuePublicToken', {
          purpose: 'registration',
          moduleName: 'auth'
        });

        // 2) create the admin user via the public registration event
        await meltdownEmit('publicRegister', {
          jwt: pubJwt,
          moduleName: 'userManagement',
          moduleType: 'core',
          username,
          password,
          role: registrationRole
        });

        alert('Registration successful! Please log in now.');
        window.location.href = '/login';
      } catch (err) {
        console.error(err);
        alert('Registration failed: ' + err.message);
      }
    });
}