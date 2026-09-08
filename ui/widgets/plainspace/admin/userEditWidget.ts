import { createFormField, createFormActions } from '../../../shared/forms/formField.js';
import { registerWorkspaceChanges } from '../../../shared/navigation/workspaceChanges.js';
import { createColorPicker } from '/ui/shared/controls/colorPicker.js';
import {
  deleteUserRecord,
  errorMessage,
  fetchPermissions,
  fetchRoles,
  fetchUserAccess,
  fetchUserDetails,
  updateUserAccess,
  updateUserProfile,
  type PermissionRecord,
  type RoleRecord,
  userEditTextFields as textFields,
  userValue,
  type UserEditFieldValues,
  type UserEditTextField
} from './userEditData.js';
import {
  permissionBlobFromKeys,
  permissionGroupForKey,
  permissionKey,
  permissionKeysFromBlob,
  visiblePermissionGroups
} from './usersListData.js';

interface UserEditWindow extends Window {
  saveUserChanges?: () => Promise<void>;
}

interface DialogResult {
  action?: string;
}

interface DialogApi {
  alert?: (message: string, options?: { title?: string }) => Promise<DialogResult>;
  confirm?: (message: string, options?: { title?: string; confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
}

function dialogApi(): DialogApi | null {
  return (window as Window & { bpDialog?: DialogApi }).bpDialog || null;
}

async function showAlert(message: string, title = 'User'): Promise<void> {
  const dialog = dialogApi();
  if (dialog?.alert) {
    await dialog.alert(message, { title });
    return;
  }
  alert(message);
}

async function showConfirm(message: string, title: string, confirmLabel: string): Promise<boolean> {
  const dialog = dialogApi();
  if (dialog?.confirm) {
    return await dialog.confirm(message, { title, confirmLabel, cancelLabel: 'Cancel' });
  }
  return confirm(message);
}

function buildRoleCheckboxes(container: HTMLElement, roles: RoleRecord[], selectedRoleIds: Set<string>): void {
  visiblePermissionGroups(roles).forEach(role => {
    const id = String(role.id ?? '');
    if (!id) return;
    const label = document.createElement('label');
    label.className = 'permission-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = id;
    input.dataset.roleId = id;
    input.checked = selectedRoleIds.has(id);
    const text = document.createElement('span');
    text.textContent = role.role_name || id;
    label.appendChild(input);
    label.appendChild(text);
    container.appendChild(label);
  });
}

function buildPermissionCheckboxes(container: HTMLElement, permissions: PermissionRecord[], selectedKeys: Set<string>): void {
  const groups = new Map<string, PermissionRecord[]>();
  permissions.forEach(permission => {
    const key = permissionKey(permission);
    if (!key || key === '*' || key === 'canAccessEverything') return;
    const group = permissionGroupForKey(key);
    groups.set(group, [...(groups.get(group) || []), permission]);
  });

  Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([group, records]) => {
    const section = document.createElement('div');
    section.className = 'permission-group-section';
    const title = document.createElement('strong');
    title.textContent = group;
    section.appendChild(title);

    records.sort((a, b) => permissionKey(a).localeCompare(permissionKey(b))).forEach(permission => {
      const key = permissionKey(permission);
      const label = document.createElement('label');
      label.className = 'permission-checkbox';
      label.title = permission.description || key;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = key;
      input.dataset.permissionKey = key;
      input.checked = selectedKeys.has(key);
      const text = document.createElement('span');
      text.textContent = key;
      label.appendChild(input);
      label.appendChild(text);
      section.appendChild(label);
    });
    container.appendChild(section);
  });
}

export async function render(el: HTMLElement | null, options: { userId?: string } = {}): Promise<void> {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN;
  const userId = options.userId || window.PAGE_ID;

  if (!el) return;

  if (!jwt || !userId || typeof meltdownEmit !== 'function') {
    el.innerHTML = '<p>Missing credentials or user ID.</p>';
    return;
  }

  try {
    const [user, roles, permissions, access] = await Promise.all([
      fetchUserDetails(meltdownEmit, jwt, userId),
      fetchRoles(meltdownEmit, jwt),
      fetchPermissions(meltdownEmit, jwt),
      fetchUserAccess(meltdownEmit, jwt, userId)
    ]);
    if (!user) {
      el.innerHTML = '<p>User not found.</p>';
      return;
    }
    const userRecord = user;

    const inputs = {} as Record<UserEditTextField, HTMLInputElement | HTMLTextAreaElement>;
    const container = document.createElement('div');
    container.className = 'user-edit-widget';

    const colorChoices = [
      '#FF0000', '#FF4040', '#FFC0CB', '#FF00FF', '#800080', '#8A2BE2',
      '#00CED1', '#00FFFF', '#40E0D0', '#ADD8E6', '#4169E1', '#0047AB',
      '#008000', '#7CFC00', '#BFFF00', '#FFFF00', '#FFDAB9', '#FFA500',
      '#000000', '#A9A9A9', '#808080'
    ];
    let selectedColor = userRecord.ui_color || '#171717';

    const headerDelete = document.createElement('button');
    headerDelete.type = 'button';
    headerDelete.className = 'button ghost danger';
    headerDelete.textContent = 'Delete user';
    headerDelete.addEventListener('click', async () => {
      if (!await showConfirm('Delete this user?', 'Delete user', 'Delete')) return;
      try {
        await deleteUserRecord(meltdownEmit, jwt, userRecord.id);
        await showAlert('User deleted', 'Delete user');
        window.location.href = '/admin/settings/users-access';
      } catch (err) {
        await showAlert(`Error: ${errorMessage(err)}`, 'Delete user');
      }
    });

    textFields.forEach(field => {
      const input = field === 'bio' ? document.createElement('textarea') : document.createElement('input');
      if (input instanceof HTMLInputElement) input.type = field === 'email' ? 'email' : 'text';
      input.value = userValue(userRecord, field); inputs[field] = input;
      container.append(createFormField(field.replace(/_/g, ' ').replace(/^./, char => char.toUpperCase()), input));
    });

    const colorRow = document.createElement('div');
    colorRow.className = 'form-field';
    const colorBtn = document.createElement('button');
    colorBtn.type = 'button';
    colorBtn.id = 'ue-ui_color';
    colorBtn.className = 'color-picker-toggle';
    colorBtn.style.backgroundColor = selectedColor;

    const themeColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent-color')
      .trim();
    const picker = createColorPicker({
      presetColors: colorChoices,
      userColors: userRecord.ui_color ? [userRecord.ui_color] : [],
      themeColors: themeColor ? [themeColor] : [],
      initialColor: selectedColor,
      onSelect: color => {
        selectedColor = color;
        colorBtn.style.backgroundColor = color;
        picker.el.classList.add('hidden');
      }
    });
    picker.el.classList.add('hidden');
    colorBtn.addEventListener('click', () => {
      picker.el.classList.toggle('hidden');
    });
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    picker.el.classList.add('floating');
    wrapper.appendChild(colorBtn);
    wrapper.appendChild(picker.el);

    const colorLabel = document.createElement('label');
    colorLabel.setAttribute('for', 'ue-ui_color');
    colorLabel.textContent = 'Account accent';
    colorLabel.className = 'form-field__label';
    colorRow.append(colorLabel, wrapper);
    container.appendChild(colorRow);

    const passInput = document.createElement('input');
    passInput.id = 'ue-new-pass';
    passInput.type = 'password';
    passInput.placeholder = ' ';
    passInput.autocomplete = 'new-password';
    container.append(createFormField('New password', passInput, { hint: 'Leave empty to keep the current password.' }));

    const selectedRoleIds = new Set((access.roleIds || []).map(String));
    const selectedPermissionKeys = new Set(permissionKeysFromBlob(access.directPermissions));

    const roleSection = document.createElement('div');
    roleSection.className = 'permission-group-section';
    const roleTitle = document.createElement('strong');
    roleTitle.textContent = 'Permission groups';
    roleSection.appendChild(roleTitle);
    buildRoleCheckboxes(roleSection, roles, selectedRoleIds);
    container.appendChild(roleSection);

    const advanced = document.createElement('details');
    advanced.className = 'permission-advanced-section';
    const advancedSummary = document.createElement('summary');
    advancedSummary.textContent = 'Advanced rights';
    advanced.appendChild(advancedSummary);
    buildPermissionCheckboxes(advanced, permissions, selectedPermissionKeys);
    container.appendChild(advanced);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button'; saveBtn.className = 'button primary'; saveBtn.textContent = 'Save user';
    const status = document.createElement('p'); status.className = 'form-status'; status.setAttribute('role', 'status');
    const discard = document.createElement('button'); discard.type = 'button';
    discard.className = 'button ghost'; discard.textContent = 'Discard changes';
    const actions = createFormActions(saveBtn, discard, headerDelete); actions.classList.add('settings-save-bar');
    container.append(actions, status);
    const controls = [...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')];
    const valueOf = (input: HTMLInputElement | HTMLTextAreaElement) => input instanceof HTMLInputElement && input.type === 'checkbox' ? String(input.checked) : input.value;
    let baseline = controls.map(valueOf); let savedColor = selectedColor; let saving = false;
    const dirty = () => savedColor !== selectedColor || controls.some((input, index) => valueOf(input) !== baseline[index]);
    registerWorkspaceChanges(container, { isDirty: dirty, isBusy: () => saving });
    discard.addEventListener('click', () => {
      if (saving) return;
      controls.forEach((input, index) => {
        if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = baseline[index] === 'true';
        else input.value = baseline[index] || '';
      });
      selectedColor = savedColor; colorBtn.style.backgroundColor = savedColor; status.textContent = '';
    });

    el.innerHTML = '';
    el.appendChild(container);

    async function saveUser(): Promise<void> {
      if (saving) return;
      saving = true; container.inert = true; saveBtn.disabled = true;
      status.setAttribute('role', 'status'); status.textContent = 'Saving…';
      const values = {} as UserEditFieldValues;
      textFields.forEach(field => {
        values[field] = inputs[field].value;
      });
      try {
        await updateUserProfile(meltdownEmit, jwt, userRecord.id, {
          ...values,
          uiColor: selectedColor,
          password: passInput.value
        });
        const roleIds = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-role-id]'))
          .filter(input => input.checked)
          .map(input => input.value);
        const permissionKeys = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-permission-key]'))
          .filter(input => input.checked)
          .map(input => input.value);
        await updateUserAccess(meltdownEmit, jwt, userRecord.id, {
          roleIds,
          directPermissions: permissionBlobFromKeys(permissionKeys)
        });
        passInput.value = ''; baseline = controls.map(valueOf); savedColor = selectedColor;
        status.textContent = 'User saved.';
      } catch (err) {
        status.setAttribute('role', 'alert'); status.textContent = `SETTINGS_USER_SAVE_FAILED: ${errorMessage(err)}`;
      } finally { saving = false; container.inert = false; saveBtn.disabled = false; }
    }

    (window as UserEditWindow).saveUserChanges = saveUser;
    saveBtn.addEventListener('click', saveUser);
  } catch (err) {
    const error = document.createElement('p'); error.setAttribute('role', 'alert');
    error.textContent = 'SETTINGS_USER_LOAD_FAILED: ' + errorMessage(err);
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button ghost'; retry.textContent = 'Retry';
    retry.addEventListener('click', () => void render(el, options)); el.replaceChildren(error, retry);
  }
}
