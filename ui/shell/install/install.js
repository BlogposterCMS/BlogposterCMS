import { createColorPicker } from '../../shared/controls/colorPicker.js';
import { resolveShellPublicClient } from '../data/publicMeltdownClient.js';
import { setAccentVariables } from '../theme/userColor.js';
import { fetchFirstInstallState, submitInstallRequest } from './installData.js';
function messageFromError(err) {
    return err instanceof Error ? err.message : String(err);
}
async function redirectIfAlreadyInstalled() {
    try {
        const { firstInstallDone } = await fetchFirstInstallState(resolveShellPublicClient(window));
        if (firstInstallDone) {
            window.location.href = '/login';
        }
    }
    catch (err) {
        console.error('[install] install status check failed', err);
    }
}
void redirectIfAlreadyInstalled();
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
    steps.forEach((el, idx) => el?.classList.toggle('active', idx === i));
    dots.forEach((d, idx) => d.classList.toggle('active', idx <= i));
}
document.getElementById('startSetup')?.addEventListener('click', () => setStep(1));
const allowWeak = document.querySelector('meta[name="allow-weak-creds"]')?.content === 'true';
const data = { favoriteColor: '#008080' };
setAccentVariables(data.favoriteColor);
function passwordStrong(pw) {
    return pw.length >= 12 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);
}
adminForm?.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.currentTarget;
    const username = form.username.value.trim();
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    const email = form.email.value.trim();
    const errBox = document.getElementById('pwStrength');
    if (password !== confirmPassword) {
        if (errBox)
            errBox.textContent = 'Passwords do not match.';
        return;
    }
    if (['admin', 'root', 'test'].includes(username.toLowerCase()) && !allowWeak) {
        if (errBox)
            errBox.textContent = 'Username is not allowed.';
        return;
    }
    if (!passwordStrong(password) && !allowWeak) {
        if (errBox)
            errBox.textContent = 'Password is too weak.';
        return;
    }
    if (errBox)
        errBox.textContent = '';
    data.username = username;
    data.password = password;
    data.email = email;
    setStep(2);
});
const colorInput = document.getElementById('favoriteColor');
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
    const form = e.currentTarget;
    data.projectName = form.projectName.value.trim();
    void submitInstall();
});
async function submitInstall() {
    try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';
        await submitInstallRequest(window, csrfToken, data);
        setStep(3);
    }
    catch (err) {
        console.error(err);
        alert('Installation failed: ' + messageFromError(err));
    }
}
