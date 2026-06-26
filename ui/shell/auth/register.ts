import { resolveShellPublicClient } from '../data/publicMeltdownClient.js';
import {
  fetchRegistrationAvailability,
  registerPublicUser,
  type RegistrationRole
} from './registerData.js';

function messageFromError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const registerForm = document.getElementById('registerForm') as HTMLFormElement | null;
let firstInstallDone = false;
let registrationAllowed = true;
let registrationRole: RegistrationRole = 'admin';

async function checkRegistrationAvailability(): Promise<void> {
  try {
    const availability = await fetchRegistrationAvailability(resolveShellPublicClient(window));
    firstInstallDone = availability.firstInstallDone;
    registrationAllowed = availability.registrationAllowed;
    registrationRole = availability.registrationRole;

    if (!registrationAllowed) {
      alert('Public registration is disabled. Please use the login page.');
      window.location.href = '/login';
    }
  } catch (err) {
    console.error('[register] registration availability check failed', err);
  }
}

void checkRegistrationAvailability();

if (registerForm) {
  registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!registrationAllowed) {
      alert('Registration is currently disabled.');
      window.location.href = '/login';
      return;
    }

    const formData = new FormData(registerForm);
    const username = String(formData.get('username') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    if (!username || !password) {
      alert('Both username & password are required.');
      return;
    }

    try {
      await registerPublicUser(resolveShellPublicClient(window), {
        username,
        password,
        role: registrationRole
      });

      alert('Registration successful! Please log in now.');
      window.location.href = '/login';
    } catch (err) {
      console.error(err);
      alert('Registration failed: ' + messageFromError(err));
    }
  });
}
