import { createPermissionRecord, createRoleRecord, deleteRoleRecord, errorMessage, fetchPermissions, fetchPermissionsState, fetchRoles, permissionsPromptDefault, updateRoleRecord } from './permissionsData.js';
function icon(name, className) {
    return typeof window.featherIcon === 'function' ? window.featherIcon(name, className) : '';
}
export async function render(el) {
    const jwt = window.ADMIN_TOKEN;
    const meltdownEmit = window.meltdownEmit;
    if (!el)
        return;
    if (typeof meltdownEmit !== 'function') {
        el.textContent = 'Unable to load permissions without an admin session.';
        return;
    }
    let permissions = [];
    let roles = [];
    let permList;
    let roleList;
    function buildCard() {
        const card = document.createElement('div');
        card.className = 'permissions-card';
        const titleBar = document.createElement('div');
        titleBar.className = 'permissions-title-bar';
        const title = document.createElement('div');
        title.className = 'permissions-title';
        title.textContent = 'Permissions';
        const addPermBtn = document.createElement('img');
        addPermBtn.src = '/assets/icons/plus.svg';
        addPermBtn.alt = 'Add permission';
        addPermBtn.title = 'Add new permission';
        addPermBtn.className = 'icon add-permission-btn';
        const addGroupBtn = document.createElement('img');
        addGroupBtn.src = '/assets/icons/plus.svg';
        addGroupBtn.alt = 'Add group';
        addGroupBtn.title = 'Add permission group';
        addGroupBtn.className = 'icon add-group-btn';
        addPermBtn.addEventListener('click', async () => {
            const key = prompt('Permission key:');
            if (!key)
                return;
            const desc = prompt('Description (optional):') || '';
            try {
                await createPermissionRecord(meltdownEmit, jwt, { permissionKey: key, description: desc });
                permissions = await fetchPermissions(meltdownEmit, jwt);
                renderPermissions();
            }
            catch (err) {
                alert(`Error: ${errorMessage(err)}`);
            }
        });
        addGroupBtn.addEventListener('click', async () => {
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
        titleBar.appendChild(addGroupBtn);
        titleBar.appendChild(addPermBtn);
        card.appendChild(titleBar);
        const groupLabel = document.createElement('div');
        groupLabel.className = 'permissions-sub-title';
        groupLabel.textContent = 'Permission Groups';
        card.appendChild(groupLabel);
        const roleListEl = document.createElement('ul');
        roleListEl.className = 'roles-list';
        card.appendChild(roleListEl);
        const permLabel = document.createElement('div');
        permLabel.className = 'permissions-sub-title';
        permLabel.textContent = 'Single Permissions';
        card.appendChild(permLabel);
        const permListEl = document.createElement('ul');
        permListEl.className = 'permissions-list';
        card.appendChild(permListEl);
        return { card, permListEl, roleListEl };
    }
    function renderPermissions() {
        permList.innerHTML = '';
        if (!permissions.length) {
            const empty = document.createElement('li');
            empty.className = 'empty-state';
            empty.textContent = 'No permissions found.';
            permList.appendChild(empty);
        }
        else {
            permissions.forEach(permission => {
                const li = document.createElement('li');
                li.textContent = (permission.permission_key || '') + (permission.description ? ` - ${permission.description}` : '');
                permList.appendChild(li);
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
            roles.forEach(role => {
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
        ({ permissions, roles } = await fetchPermissionsState(meltdownEmit, jwt));
        const built = buildCard();
        permList = built.permListEl;
        roleList = built.roleListEl;
        renderRoles();
        renderPermissions();
        el.innerHTML = '';
        el.appendChild(built.card);
    }
    catch (err) {
        el.innerHTML = `<div class="error">Failed to load permissions: ${errorMessage(err)}</div>`;
    }
}
