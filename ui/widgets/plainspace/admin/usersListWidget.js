import { createTabSystem } from '../../../shared/navigation/tabs.js';
import { createFormField } from '../../../shared/forms/formField.js';
import { bpDialog } from '../../../shared/dialogs/bpDialog.js';
import { createRoleRecord, createUserRecord, deleteRoleRecord, errorMessage, fetchPermissions, fetchRoles, fetchUsers, permissionBlobFromKeys, permissionGroupForKey, permissionKey, permissionsPromptDefault, updateRoleRecord, visiblePermissionGroups } from './usersListData.js';
function dialogApi() {
    return window.bpDialog || null;
}
function createInput(id, labelText, type = 'text') {
    const row = document.createElement('div');
    row.className = 'field user-field-row';
    const input = document.createElement('input');
    input.id = id;
    input.type = type;
    input.placeholder = ' ';
    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = labelText;
    row.appendChild(input);
    row.appendChild(label);
    return row;
}
function buildRoleCheckboxes(container, roles) {
    visiblePermissionGroups(roles).forEach(role => {
        const id = `role-${String(role.id)}`;
        const label = document.createElement('label');
        label.className = 'permission-checkbox';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.value = String(role.id ?? '');
        input.dataset.roleId = input.value;
        const text = document.createElement('span');
        text.textContent = role.role_name || input.value;
        label.appendChild(input);
        label.appendChild(text);
        container.appendChild(label);
    });
}
function buildPermissionCheckboxes(container, permissions) {
    const groups = new Map();
    permissions.forEach(permission => {
        const key = permissionKey(permission);
        if (!key || key === '*' || key === 'canAccessEverything')
            return;
        const group = permissionGroupForKey(key);
        groups.set(group, [...(groups.get(group) || []), permission]);
    });
    Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([group, records]) => {
        const section = document.createElement('div');
        section.className = 'permission-group-section';
        const title = document.createElement('strong');
        title.textContent = group;
        section.appendChild(title);
        records
            .sort((a, b) => permissionKey(a).localeCompare(permissionKey(b)))
            .forEach(permission => {
            const key = permissionKey(permission);
            const label = document.createElement('label');
            label.className = 'permission-checkbox';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = key;
            input.dataset.permissionKey = key;
            const text = document.createElement('span');
            text.textContent = key;
            label.title = permission.description || key;
            label.appendChild(input);
            label.appendChild(text);
            section.appendChild(label);
        });
        container.appendChild(section);
    });
}
async function openCreateUserDialog(roles, permissions) {
    const dialog = dialogApi();
    if (!dialog?.open) {
        const username = prompt('Username:');
        if (!username)
            return null;
        const password = prompt('Password:');
        if (!password)
            return null;
        const email = prompt('Email (optional):') || '';
        return { username, password, email, roleIds: [], directPermissions: {} };
    }
    const body = document.createElement('div');
    body.className = 'user-create-dialog';
    body.appendChild(createInput('new-user-username', 'Username'));
    body.appendChild(createInput('new-user-password', 'Password', 'password'));
    body.appendChild(createInput('new-user-email', 'Email'));
    const roleSection = document.createElement('div');
    roleSection.className = 'permission-group-section';
    const roleTitle = document.createElement('strong');
    roleTitle.textContent = 'Permission groups';
    roleSection.appendChild(roleTitle);
    buildRoleCheckboxes(roleSection, roles);
    body.appendChild(roleSection);
    const advanced = document.createElement('details');
    advanced.className = 'permission-advanced-section';
    const summary = document.createElement('summary');
    summary.textContent = 'Advanced rights';
    advanced.appendChild(summary);
    buildPermissionCheckboxes(advanced, permissions);
    body.appendChild(advanced);
    const result = await dialog.open({
        title: 'Create user',
        body,
        dismissable: true,
        actions: [
            { id: 'cancel', label: 'Cancel' },
            { id: 'create', label: 'Create', variant: 'primary' }
        ]
    });
    if (result.action !== 'create')
        return null;
    const username = (body.querySelector('#new-user-username')?.value || '').trim();
    const password = body.querySelector('#new-user-password')?.value || '';
    const email = (body.querySelector('#new-user-email')?.value || '').trim();
    if (!username || !password) {
        await dialog.alert?.('Username and password are required.', { title: 'Create user' });
        return null;
    }
    const roleIds = Array.from(body.querySelectorAll('input[data-role-id]'))
        .filter(input => input.checked)
        .map(input => input.value);
    const permissionKeys = Array.from(body.querySelectorAll('input[data-permission-key]'))
        .filter(input => input.checked)
        .map(input => input.value);
    return {
        username,
        password,
        email,
        roleIds,
        directPermissions: permissionBlobFromKeys(permissionKeys)
    };
}
async function editPermissionGroup(role) {
    const name = document.createElement('input');
    name.value = role?.role_name || '';
    const description = document.createElement('input');
    description.value = role?.description || '';
    const permissions = document.createElement('textarea');
    permissions.rows = 8;
    permissions.value = permissionsPromptDefault(role?.permissions);
    const body = document.createElement('div');
    body.className = 'settings-section';
    body.append(createFormField('Group name', name, { required: true }), createFormField('Description', description), createFormField('Permissions JSON', permissions, { hint: 'Existing permission keys and custom rules are preserved. The server validates access changes.' }));
    const result = await bpDialog.open({ title: role ? 'Edit permission group' : 'Add permission group', body,
        actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'save', label: 'Save group', variant: 'primary' }] });
    if (result.action !== 'save')
        return null;
    if (!name.value.trim()) {
        await bpDialog.alert('SETTINGS_GROUP_NAME_REQUIRED: Enter a group name.');
        return null;
    }
    try {
        return { roleName: name.value.trim(), description: description.value.trim(), permissions: JSON.parse(permissions.value) };
    }
    catch {
        await bpDialog.alert('SETTINGS_GROUP_PERMISSIONS_INVALID: Enter valid permissions JSON.');
        return null;
    }
}
export async function render(el, options = {}) {
    const jwt = window.ADMIN_TOKEN;
    const meltdownEmit = window.meltdownEmit;
    if (!el)
        return;
    if (typeof meltdownEmit !== 'function') {
        el.textContent = 'Unable to load users without an admin session.';
        return;
    }
    let users = [];
    let roles = [];
    let permissions = [];
    let userList;
    let roleList;
    function buildCard() {
        const card = document.createElement('div');
        card.className = 'user-list-card';
        const titleBar = document.createElement('div');
        titleBar.className = 'user-title-bar';
        const title = document.createElement('div');
        title.className = 'user-title';
        title.textContent = 'User Management';
        const tabsHost = document.createElement('nav');
        const tabs = options.tabs || createTabSystem(card, tabsHost, { variant: 'underline' });
        if (!options.tabs)
            card.append(titleBar, tabsHost);
        const usersPanel = tabs.addTab('Users');
        const rolesPanel = tabs.addTab('Permission groups');
        const usersToolbar = document.createElement('div');
        const rolesToolbar = document.createElement('div');
        usersToolbar.className = rolesToolbar.className = 'settings-panel-toolbar';
        const usersHint = document.createElement('p');
        usersHint.className = 'settings-hint';
        usersHint.textContent = 'Open a user to manage their account and assigned permissions.';
        const rolesHint = document.createElement('p');
        rolesHint.className = 'settings-hint';
        rolesHint.textContent = 'Permission groups let you assign the same access to several people.';
        usersToolbar.append(usersHint);
        rolesToolbar.append(rolesHint);
        usersPanel.append(usersToolbar);
        rolesPanel.append(rolesToolbar);
        const addUserBtn = document.createElement('button');
        addUserBtn.type = 'button';
        addUserBtn.textContent = 'Add user';
        addUserBtn.className = 'button primary sm';
        addUserBtn.addEventListener('click', async () => {
            const values = await openCreateUserDialog(roles, permissions);
            if (!values)
                return;
            try {
                await createUserRecord(meltdownEmit, jwt, values);
                users = await fetchUsers(meltdownEmit, jwt);
                renderUsers();
            }
            catch (err) {
                const dialog = dialogApi();
                if (dialog?.alert)
                    await dialog.alert(`Error: ${errorMessage(err)}`, { title: 'Create user' });
                else
                    alert(`Error: ${errorMessage(err)}`);
            }
        });
        const addRoleBtn = document.createElement('button');
        addRoleBtn.type = 'button';
        addRoleBtn.textContent = 'Add permission group';
        addRoleBtn.className = 'button primary sm';
        addRoleBtn.addEventListener('click', async () => {
            const values = await editPermissionGroup();
            if (!values)
                return;
            try {
                await createRoleRecord(meltdownEmit, jwt, values);
                roles = await fetchRoles(meltdownEmit, jwt);
                renderRoles();
            }
            catch (err) {
                alert(`Error: ${errorMessage(err)}`);
            }
        });
        titleBar.appendChild(title);
        usersToolbar.append(addUserBtn);
        rolesToolbar.append(addRoleBtn);
        const usersListEl = document.createElement('ul');
        usersListEl.className = 'users-list';
        usersPanel.append(usersListEl);
        const rolesListEl = document.createElement('ul');
        rolesListEl.className = 'roles-list';
        rolesPanel.append(rolesListEl);
        return { card, usersListEl, rolesListEl };
    }
    function renderUsers() {
        userList.innerHTML = '';
        if (!users.length) {
            const empty = document.createElement('li');
            empty.className = 'empty-state';
            empty.textContent = 'No users found.';
            userList.appendChild(empty);
        }
        else {
            users.forEach(user => {
                const li = document.createElement('li');
                const name = user.display_name || user.username || user.email || `ID ${user.id}`;
                const link = document.createElement('a');
                link.href = `/admin/settings/users/edit/${encodeURIComponent(String(user.id ?? ''))}`;
                link.textContent = name;
                li.appendChild(link);
                userList.appendChild(li);
            });
        }
    }
    async function handleEditRole(role) {
        const values = await editPermissionGroup(role);
        if (!values)
            return;
        try {
            await updateRoleRecord(meltdownEmit, jwt, role, values);
            roles = await fetchRoles(meltdownEmit, jwt);
            renderRoles();
        }
        catch (err) {
            await bpDialog.alert('SETTINGS_GROUP_SAVE_FAILED: ' + errorMessage(err));
        }
    }
    async function handleDeleteRole(role) {
        if (!await bpDialog.confirm('Delete permission group "' + (role.role_name || '') + '"?', { title: 'Delete permission group' }))
            return;
        try {
            await deleteRoleRecord(meltdownEmit, jwt, role);
            roles = await fetchRoles(meltdownEmit, jwt);
            renderRoles();
        }
        catch (err) {
            await bpDialog.alert('SETTINGS_GROUP_DELETE_FAILED: ' + errorMessage(err));
        }
    }
    function renderRoles() {
        roleList.innerHTML = '';
        if (!roles.length) {
            const empty = document.createElement('li');
            empty.className = 'empty-state';
            empty.textContent = 'No permission groups found.';
            roleList.appendChild(empty);
        }
        else {
            visiblePermissionGroups(roles).forEach(role => {
                const li = document.createElement('li');
                const row = document.createElement('div');
                row.className = 'page-name-row';
                const nameSpan = document.createElement('span');
                nameSpan.className = 'page-name';
                nameSpan.textContent = (role.role_name || '') + (role.description ? ` - ${role.description}` : '');
                const actions = document.createElement('span');
                actions.className = 'page-actions';
                if (!role.is_system_role) {
                    for (const [label, action] of [['Edit', () => handleEditRole(role)], ['Delete', () => handleDeleteRole(role)]]) {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = 'button ghost sm';
                        button.textContent = label;
                        button.addEventListener('click', () => void action());
                        actions.append(button);
                    }
                }
                row.appendChild(nameSpan);
                row.appendChild(actions);
                li.appendChild(row);
                roleList.appendChild(li);
            });
        }
    }
    try {
        [users, roles, permissions] = await Promise.all([
            fetchUsers(meltdownEmit, jwt),
            fetchRoles(meltdownEmit, jwt),
            fetchPermissions(meltdownEmit, jwt).catch(() => [])
        ]);
        const built = buildCard();
        userList = built.usersListEl;
        roleList = built.rolesListEl;
        renderUsers();
        renderRoles();
        if (!options.tabs)
            el.replaceChildren(built.card);
    }
    catch (err) {
        if (options.tabs)
            throw err;
        const error = document.createElement('p');
        error.setAttribute('role', 'alert');
        error.textContent = 'SETTINGS_USERS_LOAD_FAILED: ' + errorMessage(err);
        el.replaceChildren(error);
    }
}
