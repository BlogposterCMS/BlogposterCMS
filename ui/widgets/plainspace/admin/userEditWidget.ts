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

export async function render(el: HTMLElement | null): Promise<void> {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN;
  const userId = window.PAGE_ID;

  if (!el) return;

  if (!jwt || !userId || typeof meltdownEmit !== 'function') {
    el.innerHTML = '<p>Missing credentials or user ID.</p>';
    return;
  }

  try {
    const [user, roles, permissions, access] = await Promise.all([
      fetchUserDetails(meltdownEmit, jwt, userId),
      fetchRoles(meltdownEmit, jwt).catch(() => []),
      fetchPermissions(meltdownEmit, jwt).catch(() => []),
      fetchUserAccess(meltdownEmit, jwt, userId).catch(() => ({ roleIds: [], directPermissions: {} }))
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
    let selectedColor = userRecord.ui_color || colorChoices[0] || '#000000';

    const headerDelete = document.createElement('img');
    headerDelete.src = '/assets/icons/delete.svg';
    headerDelete.className = 'icon delete-user-btn';
    headerDelete.title = 'Delete user';
    headerDelete.style.alignSelf = 'flex-end';
    headerDelete.addEventListener('click', async () => {
      if (!await showConfirm('Delete this user?', 'Delete user', 'Delete')) return;
      try {
        await deleteUserRecord(meltdownEmit, jwt, userRecord.id);
        await showAlert('User deleted', 'Delete user');
        window.location.href = '/admin/settings/users';
      } catch (err) {
        await showAlert(`Error: ${errorMessage(err)}`, 'Delete user');
      }
    });
    container.appendChild(headerDelete);

    textFields.forEach(field => {
      const row = document.createElement('div');
      row.className = 'field user-field-row';

      const input = field === 'bio'
        ? document.createElement('textarea')
        : document.createElement('input');
      if (input instanceof HTMLInputElement) {
        input.type = 'text';
      }

      const id = `ue-${field}`;
      input.id = id;
      input.placeholder = ' ';
      input.value = userValue(userRecord, field);
      inputs[field] = input;

      const label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = field.replace('_', ' ');
      row.appendChild(input);
      row.appendChild(label);

      container.appendChild(row);
    });

    const colorRow = document.createElement('div');
    colorRow.className = 'field user-field-row';
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
    colorLabel.textContent = 'ui color';
    colorRow.appendChild(wrapper);
    colorRow.appendChild(colorLabel);
    container.appendChild(colorRow);

    const passField = document.createElement('div');
    passField.className = 'field';
    const passInput = document.createElement('input');
    passInput.id = 'ue-new-pass';
    passInput.type = 'password';
    passInput.placeholder = ' ';
    const passLabel = document.createElement('label');
    passLabel.setAttribute('for', 'ue-new-pass');
    passLabel.textContent = 'New Password';
    passField.appendChild(passInput);
    passField.appendChild(passLabel);
    container.appendChild(passField);

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
    saveBtn.textContent = 'Save';
    container.appendChild(saveBtn);

    el.innerHTML = '';
    el.appendChild(container);

    async function saveUser(): Promise<void> {
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
        window.USER_COLOR = selectedColor;
        document.documentElement.style.setProperty('--user-color', selectedColor);
        await showAlert('Saved', 'User');
      } catch (err) {
        await showAlert(`Error: ${errorMessage(err)}`, 'User');
      }
    }

    (window as UserEditWindow).saveUserChanges = saveUser;
    saveBtn.addEventListener('click', saveUser);
  } catch (err) {
    el.innerHTML = `<div class="error">Failed to load user: ${errorMessage(err)}</div>`;
  }
}
