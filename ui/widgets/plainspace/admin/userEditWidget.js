import { createColorPicker } from '/ui/shared/controls/colorPicker.js';
import { deleteUserRecord, errorMessage, fetchUserDetails, updateUserProfile, userEditTextFields as textFields, userValue } from './userEditData.js';
export async function render(el) {
    const meltdownEmit = window.meltdownEmit;
    const jwt = window.ADMIN_TOKEN;
    const userId = window.PAGE_ID;
    if (!el)
        return;
    if (!jwt || !userId || typeof meltdownEmit !== 'function') {
        el.innerHTML = '<p>Missing credentials or user ID.</p>';
        return;
    }
    try {
        const user = await fetchUserDetails(meltdownEmit, jwt, userId);
        if (!user) {
            el.innerHTML = '<p>User not found.</p>';
            return;
        }
        const userRecord = user;
        const inputs = {};
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
            if (!confirm('Delete this user?'))
                return;
            try {
                await deleteUserRecord(meltdownEmit, jwt, userRecord.id);
                alert('User deleted');
                window.location.href = '/admin/settings/users';
            }
            catch (err) {
                alert(`Error: ${errorMessage(err)}`);
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
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        container.appendChild(saveBtn);
        el.innerHTML = '';
        el.appendChild(container);
        async function saveUser() {
            const values = {};
            textFields.forEach(field => {
                values[field] = inputs[field].value;
            });
            try {
                await updateUserProfile(meltdownEmit, jwt, userRecord.id, {
                    ...values,
                    uiColor: selectedColor,
                    password: passInput.value
                });
                window.USER_COLOR = selectedColor;
                document.documentElement.style.setProperty('--user-color', selectedColor);
                alert('Saved');
            }
            catch (err) {
                alert(`Error: ${errorMessage(err)}`);
            }
        }
        window.saveUserChanges = saveUser;
        saveBtn.addEventListener('click', saveUser);
    }
    catch (err) {
        el.innerHTML = `<div class="error">Failed to load user: ${errorMessage(err)}</div>`;
    }
}
