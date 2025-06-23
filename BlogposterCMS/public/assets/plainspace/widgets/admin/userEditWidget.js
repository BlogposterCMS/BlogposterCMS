import { createColorPicker } from '../../builder/colorPicker.js';

export async function render(el) {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN;
  const userId = window.PAGE_ID;

  if (!jwt || !userId) {
    el.innerHTML = '<p>Missing credentials or user ID.</p>';
    return;
  }

  try {
    const userRes = await meltdownEmit('getUserDetailsById', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      userId
    });
    const user = userRes?.data ?? userRes;
    if (!user) {
      el.innerHTML = '<p>User not found.</p>';
      return;
    }

    const fields = [
      'username',
      'email',
      'first_name',
      'last_name',
      'display_name',
      'phone',
      'company',
      'website',
      'avatar_url',
      'bio',
      'ui_color'
    ];
    const inputs = {};
    const container = document.createElement('div');
    container.className = 'user-edit-widget';

    const colorChoices = [
      '#FF0000', '#FF4040', '#FFC0CB', '#FF00FF', '#800080', '#8A2BE2',
      '#00CED1', '#00FFFF', '#40E0D0', '#ADD8E6', '#4169E1', '#0047AB',
      '#008000', '#7CFC00', '#BFFF00', '#FFFF00', '#FFDAB9', '#FFA500',
      '#000000', '#A9A9A9', '#808080'
    ];
    let selectedColor = user.ui_color || colorChoices[0];

    const headerDelete = document.createElement('img');
    headerDelete.src = '/assets/icons/trash-2.svg';
    headerDelete.className = 'icon delete-user-btn';
    headerDelete.title = 'Delete user';
    headerDelete.style.alignSelf = 'flex-end';
    headerDelete.addEventListener('click', async () => {
      if (!confirm('Delete this user?')) return;
      try {
        await meltdownEmit('deleteUser', {
          jwt,
          moduleName: 'userManagement',
          moduleType: 'core',
          userId: user.id
        });
        alert('User deleted');
        window.location.href = '/admin/settings/users';
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
    container.appendChild(headerDelete);

    fields.forEach(f => {
      const row = document.createElement('div');
      row.className = 'field user-field-row';

      let input;
      if (f === 'bio') {
        input = document.createElement('textarea');
      } else if (f === 'ui_color') {
        const colorBtn = document.createElement('button');
        colorBtn.type = 'button';
        colorBtn.className = 'color-picker-toggle';
        colorBtn.style.backgroundColor = selectedColor;

        const themeColor = getComputedStyle(document.documentElement)
          .getPropertyValue('--accent-color')
          .trim();
        const picker = createColorPicker({
          presetColors: colorChoices,
          userColors: user.ui_color ? [user.ui_color] : [],
          themeColors: themeColor ? [themeColor] : [],
          initialColor: selectedColor,
          onSelect: c => {
            selectedColor = c;
            colorBtn.style.backgroundColor = c;
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
        input = wrapper;
      } else {
        input = document.createElement('input');
        input.type = 'text';
      }

      const id = `ue-${f}`;
      input.id = id;
      if (f !== 'ui_color') input.placeholder = ' ';
      if (f !== 'ui_color') {
        input.value = user[f] || '';
      }
      if (f === 'ui_color' && !user[f]) input.dataset.empty = 'true';
      inputs[f] = input;

      const label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = f.replace('_', ' ');
      row.appendChild(input);
      row.appendChild(label);



      container.appendChild(row);
    });

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

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    container.appendChild(saveBtn);

    el.innerHTML = '';
    el.appendChild(container);

    async function saveUser() {
      const payload = {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core',
        userId: user.id,
        newUsername: inputs.username.value.trim(),
        newEmail: inputs.email.value.trim(),
        newFirstName: inputs.first_name.value.trim(),
        newLastName: inputs.last_name.value.trim(),
        newDisplayName: inputs.display_name.value.trim(),
        newPhone: inputs.phone.value.trim(),
        newCompany: inputs.company.value.trim(),
        newWebsite: inputs.website.value.trim(),
        newAvatarUrl: inputs.avatar_url.value.trim(),
        newBio: inputs.bio.value,
        newUiColor: selectedColor
      };
      if (passInput.value.trim()) {
        payload.newPassword = passInput.value.trim();
      }
      try {
        await meltdownEmit('updateUserProfile', payload);
        alert('Saved');
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
    window.saveUserChanges = saveUser;
    saveBtn.addEventListener('click', saveUser);
  } catch (err) {
    el.innerHTML = `<div class="error">Failed to load user: ${err.message}</div>`;
  }
}
