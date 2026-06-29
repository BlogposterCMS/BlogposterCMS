import { createRoleRecord, createUserRecord, deleteRoleRecord, errorMessage, fetchPermissions, fetchRoles, fetchUsers, permissionBlobFromKeys, permissionGroupForKey, permissionKey, permissionsPromptDefault, updateRoleRecord, visiblePermissionGroups } from './usersListData.js';
function icon(name, className) {
    return typeof window.featherIcon === 'function' ? window.featherIcon(name, className) : '';
}
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
export async function render(el) {
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
        const tabs = document.createElement('div');
        tabs.className = 'users-tabs';
        const usersBtn = document.createElement('button');
        usersBtn.className = 'users-tab active';
        usersBtn.textContent = 'Users';
        const permsBtn = document.createElement('button');
        permsBtn.className = 'users-tab';
        permsBtn.textContent = 'Permissions';
        tabs.appendChild(usersBtn);
        tabs.appendChild(permsBtn);
        const addUserBtn = document.createElement('img');
        addUserBtn.src = '/assets/icons/plus.svg';
        addUserBtn.alt = 'Add user';
        addUserBtn.title = 'Add new user';
        addUserBtn.className = 'icon add-user-btn';
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
        const addRoleBtn = document.createElement('img');
        addRoleBtn.src = '/assets/icons/plus.svg';
        addRoleBtn.alt = 'Add group';
        addRoleBtn.title = 'Add permission group';
        addRoleBtn.className = 'icon add-group-btn';
        addRoleBtn.style.display = 'none';
        addRoleBtn.addEventListener('click', async () => {
            const name = prompt('Group name:');
            if (!name)
                return;
            const permStr = prompt('Permissions JSON:', '{}') || '{}';
            let perms;
            try {
                perms = JSON.parse(permStr);
            }
            catch {
                alert('Invalid JSON');
                return;
            }
            try {
                await createRoleRecord(meltdownEmit, jwt, { roleName: name, permissions: perms });
                roles = await fetchRoles(meltdownEmit, jwt);
                renderRoles();
            }
            catch (err) {
                alert(`Error: ${errorMessage(err)}`);
            }
        });
        titleBar.appendChild(title);
        titleBar.appendChild(tabs);
        titleBar.appendChild(addUserBtn);
        titleBar.appendChild(addRoleBtn);
        card.appendChild(titleBar);
        const usersListEl = document.createElement('ul');
        usersListEl.className = 'users-list';
        card.appendChild(usersListEl);
        const rolesListEl = document.createElement('ul');
        rolesListEl.className = 'roles-list';
        rolesListEl.style.display = 'none';
        card.appendChild(rolesListEl);
        usersBtn.addEventListener('click', () => {
            usersBtn.classList.add('active');
            permsBtn.classList.remove('active');
            usersListEl.style.display = '';
            rolesListEl.style.display = 'none';
            addUserBtn.style.display = '';
            addRoleBtn.style.display = 'none';
        });
        permsBtn.addEventListener('click', () => {
            permsBtn.classList.add('active');
            usersBtn.classList.remove('active');
            usersListEl.style.display = 'none';
            rolesListEl.style.display = '';
            addUserBtn.style.display = 'none';
            addRoleBtn.style.display = '';
        });
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
    function handleEditRole(role) {
        const name = prompt('Group name:', role.role_name || '');
        if (!name)
            return;
        const permStr = prompt('Permissions JSON:', permissionsPromptDefault(role.permissions)) || '{}';
        let perms;
        try {
            perms = JSON.parse(permStr);
        }
        catch {
            alert('Invalid JSON');
            return;
        }
        const desc = prompt('Description (optional):', role.description || '') || '';
        void updateRoleRecord(meltdownEmit, jwt, role, {
            roleName: name,
            description: desc,
            permissions: perms
        }).then(() => {
            void fetchRoles(meltdownEmit, jwt).then(nextRoles => {
                roles = nextRoles;
                renderRoles();
            });
        }).catch(err => alert(`Error: ${errorMessage(err)}`));
    }
    function handleDeleteRole(role) {
        if (!confirm(`Delete group "${role.role_name || ''}"?`))
            return;
        void deleteRoleRecord(meltdownEmit, jwt, role).then(() => {
            void fetchRoles(meltdownEmit, jwt).then(nextRoles => {
                roles = nextRoles;
                renderRoles();
            });
        }).catch(err => alert(`Error: ${errorMessage(err)}`));
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
                    actions.innerHTML = icon('edit', 'edit-role') + icon('delete', 'delete-role');
                }
                row.appendChild(nameSpan);
                row.appendChild(actions);
                li.appendChild(row);
                roleList.appendChild(li);
                if (!role.is_system_role) {
                    li.querySelector('.edit-role')?.addEventListener('click', () => handleEditRole(role));
                    li.querySelector('.delete-role')?.addEventListener('click', () => handleDeleteRole(role));
                }
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
        el.innerHTML = '';
        el.appendChild(built.card);
    }
    catch (err) {
        el.innerHTML = `<div class="error">Failed to load users: ${errorMessage(err)}</div>`;
    }
}
