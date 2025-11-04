import { createColorPicker } from './colorPicker.js';
import { setAccentVariables } from './userColor.js';

// redirect if already installed
(async () => {
  try {
    const pubTok = await window.fetchWithTimeout('/api/meltdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: 'issuePublicToken',
        payload: { purpose: 'firstInstallCheck', moduleName: 'auth' }
      })
    }).then(r => r.json()).then(j => j.data);
    const val = await window.fetchWithTimeout('/api/meltdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Public-Token': pubTok },
      body: JSON.stringify({
        eventName: 'getPublicSetting',
        payload: { jwt: pubTok, moduleName: 'settingsManager', moduleType: 'core', key: 'FIRST_INSTALL_DONE' }
      })
    }).then(r => r.json()).then(j => j.data);
    if (val === 'true') {
      window.location.href = '/login';
      return;
    }
  } catch (err) {
    console.error('[install] FIRST_INSTALL check failed', err);
  }
})();

const adminForm = document.getElementById('adminForm');
const siteForm = document.getElementById('siteForm');
const backToAdminButton = document.getElementById('backToAdmin');

const steps = [
  document.getElementById('step-welcome'),
  adminForm,
  siteForm,
  document.getElementById('step-finish')
];
const dots = document.querySelectorAll('.install-steps li');
let currentStep = 0;

function setStep(i) {
  currentStep = i;
  steps.forEach((el, idx) => el.classList.toggle('active', idx === i));
  dots.forEach((d, idx) => d.classList.toggle('active', idx <= i));
}

document.getElementById('startSetup').addEventListener('click', () => setStep(1));

const allowWeak = document.querySelector('meta[name="allow-weak-creds"]')?.content === 'true';
const data = { favoriteColor: '#008080' };
setAccentVariables(data.favoriteColor);

function passwordStrong(pw) {
  return pw.length >= 12 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);
}

adminForm.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const username = form.username.value.trim();
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;
  const email = form.email.value.trim();
  const errBox = document.getElementById('pwStrength');

  if (password !== confirmPassword) {
    errBox.textContent = 'Passwords do not match.';
    return;
  }
  if (['admin', 'root', 'test'].includes(username.toLowerCase()) && !allowWeak) {
    errBox.textContent = 'Username is not allowed.';
    return;
  }
  if (!passwordStrong(password) && !allowWeak) {
    errBox.textContent = 'Password is too weak.';
    return;
  }
  errBox.textContent = '';
  data.username = username;
  data.password = password;
  data.email = email;
  setStep(2);
});

// color picker setup
const colorInput = document.getElementById('favoriteColor');
const colorContainer = document.getElementById('colorPickerContainer');
const picker = createColorPicker({
  initialColor: colorInput.value,
  onSelect: c => {
    colorInput.value = c;
    data.favoriteColor = c;
    setAccentVariables(c);
  }
});
colorContainer.appendChild(picker.el);

document.getElementById('skipSite').addEventListener('click', submitInstall);

if (backToAdminButton) {
  backToAdminButton.addEventListener('click', () => {
    setStep(1);
    window.requestAnimationFrame(() => {
      adminForm.username?.focus();
    });
  });
}

siteForm.addEventListener('submit', e => {
  e.preventDefault();
  data.projectName = e.target.projectName.value.trim();
  submitInstall();
});

async function submitInstall() {
  try {
    const resp = await window.fetchWithTimeout('/install', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
      },
      body: JSON.stringify({
        username: data.username,
        email: data.email,
        password: data.password,
        favoriteColor: data.favoriteColor,
        siteName: data.projectName
      })
    });
    if (!resp.ok) throw new Error(await resp.text());
    setStep(3);
  } catch (err) {
    console.error(err);
    alert('Installation failed: ' + err.message);
  }
}
