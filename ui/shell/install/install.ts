import { createColorPicker } from '../../shared/controls/colorPicker.js';
import { bpDialog } from '../../shared/dialogs/bpDialog.js';
import { resolveShellPublicClient } from '../data/publicMeltdownClient.js';
import { applyThemeMode, setAccentVariables } from '../theme/userColor.js';
import {
  fetchFirstInstallState,
  isAlreadyInstalledSubmitError,
  submitInstallRequest,
  type InstallData
} from './installData.js';

interface AdminFormControls extends HTMLFormControlsCollection {
  username: HTMLInputElement;
  password: HTMLInputElement;
  confirmPassword: HTMLInputElement;
  email: HTMLInputElement;
}

interface AdminFormElement extends HTMLFormElement {
  elements: AdminFormControls;
  username: HTMLInputElement;
  password: HTMLInputElement;
  confirmPassword: HTMLInputElement;
  email: HTMLInputElement;
}

interface SiteFormControls extends HTMLFormControlsCollection {
  projectName: HTMLInputElement;
}

interface SiteFormElement extends HTMLFormElement {
  elements: SiteFormControls;
  projectName: HTMLInputElement;
}

const DASHBOARD_ENTRY_URL = '/login?redirectTo=%2Fadmin%2Fhome';

function messageFromError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function showAlreadyInstalledDialog(): Promise<void> {
  const result = await bpDialog.open({
    kind: 'modal',
    title: 'Installation already complete',
    message: 'This BlogposterCMS instance already has an administrator. Open the dashboard to continue.',
    actions: [
      { id: 'stay', label: 'Stay here', variant: 'ghost' },
      { id: 'dashboard', label: 'Go to Dashboard', variant: 'primary', autofocus: true }
    ]
  });

  if (result.action === 'dashboard') {
    window.location.href = DASHBOARD_ENTRY_URL;
  }
}

async function redirectIfAlreadyInstalled(): Promise<void> {
  try {
    const { firstInstallDone } = await fetchFirstInstallState(resolveShellPublicClient(window));
    if (firstInstallDone) {
      window.location.href = DASHBOARD_ENTRY_URL;
    }
  } catch (err) {
    console.error('[install] install status check failed', err);
  }
}

void redirectIfAlreadyInstalled();
applyThemeMode();

const adminForm = document.getElementById('adminForm') as AdminFormElement | null;
const siteForm = document.getElementById('siteForm') as SiteFormElement | null;
const backToAdminButton = document.getElementById('backToAdmin');

const steps: (HTMLElement | null)[] = [
  document.getElementById('step-welcome'),
  adminForm,
  siteForm,
  document.getElementById('step-finish')
];
const dots = document.querySelectorAll('.install-steps li');
let currentStep = 0;

function setStep(i: number): void {
  currentStep = i;
  steps.forEach((el, idx) => el?.classList.toggle('active', idx === i));
  dots.forEach((d, idx) => d.classList.toggle('active', idx <= i));
}

document.getElementById('startSetup')?.addEventListener('click', () => setStep(1));

const allowWeak = document.querySelector<HTMLMetaElement>('meta[name="allow-weak-creds"]')?.content === 'true';
const devAutologin = document.querySelector<HTMLMetaElement>('meta[name="dev-autologin"]')?.content === 'true';
const devUser = document.querySelector<HTMLMetaElement>('meta[name="dev-user"]')?.content || 'admin';
const data: InstallData = { favoriteColor: '#008080' };
setAccentVariables(data.favoriteColor);

function passwordStrong(pw: string): boolean {
  return pw.length >= 12 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);
}

function applyLocalDevInstallDefaults(): void {
  if (!adminForm || !allowWeak || !devAutologin) return;

  // Mirrors the login dev shortcut so first-run setup and auto-login agree.
  const localPart = devUser.replace(/[^a-z0-9._-]/gi, '.') || 'admin';
  adminForm.username.value ||= devUser;
  adminForm.password.value ||= '123';
  adminForm.confirmPassword.value ||= '123';
  adminForm.email.value ||= `${localPart}@localhost.test`;
}

applyLocalDevInstallDefaults();

adminForm?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.currentTarget as AdminFormElement;
  const username = form.username.value.trim();
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;
  const email = form.email.value.trim();
  const errBox = document.getElementById('pwStrength');

  if (password !== confirmPassword) {
    if (errBox) errBox.textContent = 'Passwords do not match.';
    return;
  }
  if (['admin', 'root', 'test'].includes(username.toLowerCase()) && !allowWeak) {
    if (errBox) errBox.textContent = 'Username is not allowed.';
    return;
  }
  if (!passwordStrong(password) && !allowWeak) {
    if (errBox) errBox.textContent = 'Password is too weak.';
    return;
  }
  if (errBox) errBox.textContent = '';
  data.username = username;
  data.password = password;
  data.email = email;
  setStep(2);
});

const colorInput = document.getElementById('favoriteColor') as HTMLInputElement | null;
const colorContainer = document.getElementById('colorPickerContainer');
if (colorInput && colorContainer) {
  const picker = createColorPicker({
    initialColor: colorInput.value,
    onSelect: c => {
      colorInput.value = c;
      data.favoriteColor = c;
      setAccentVariables(c);
    }
  });
  colorContainer.appendChild(picker.el);
}

document.getElementById('skipSite')?.addEventListener('click', () => {
  void submitInstall();
});

if (backToAdminButton) {
  backToAdminButton.addEventListener('click', () => {
    setStep(1);
    window.requestAnimationFrame(() => {
      adminForm?.username?.focus();
    });
  });
}

siteForm?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.currentTarget as SiteFormElement;
  data.projectName = form.projectName.value.trim();
  void submitInstall();
});

async function submitInstall(): Promise<void> {
  try {
    const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '';
    await submitInstallRequest(window, csrfToken, data);
    setStep(3);
  } catch (err) {
    console.error(err);
    if (isAlreadyInstalledSubmitError(err)) {
      await showAlreadyInstalledDialog();
      return;
    }
    alert('Installation failed: ' + messageFromError(err));
  }
}
