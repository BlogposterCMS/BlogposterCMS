import {
  createRoleRecord,
  createUserRecord,
  deleteRoleRecord,
  errorMessage,
  fetchRoles,
  fetchUsers,
  permissionsPromptDefault,
  updateRoleRecord,
  type RoleRecord,
  type UserRecord
} from './usersListData.js';

function icon(name: string, className: string): string {
  return typeof window.featherIcon === 'function' ? window.featherIcon(name, className) : '';
}

export async function render(el: HTMLElement | null): Promise<void> {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;
  if (!el) return;
  if (typeof meltdownEmit !== 'function') {
    el.textContent = 'Unable to load users without an admin session.';
    return;
  }

  let users: UserRecord[] = [];
  let roles: RoleRecord[] = [];
  let userList: HTMLUListElement;
  let roleList: HTMLUListElement;

  function buildCard(): { card: HTMLDivElement; usersListEl: HTMLUListElement; rolesListEl: HTMLUListElement } {
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
      const username = prompt('Username:');
      if (!username) return;
      const password = prompt('Password:');
      if (!password) return;
      const email = prompt('Email (optional):') || '';
      try {
        await createUserRecord(meltdownEmit, jwt, { username, password, email });
        users = await fetchUsers(meltdownEmit, jwt);
        renderUsers();
      } catch (err) {
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
      if (!name) return;
      const permStr = prompt('Permissions JSON:', '{}') || '{}';
      let perms: unknown;
      try {
        perms = JSON.parse(permStr);
      } catch {
        alert('Invalid JSON');
        return;
      }
      try {
        await createRoleRecord(meltdownEmit, jwt, { roleName: name, permissions: perms });
        roles = await fetchRoles(meltdownEmit, jwt);
        renderRoles();
      } catch (err) {
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

  function renderUsers(): void {
    userList.innerHTML = '';
    if (!users.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No users found.';
      userList.appendChild(empty);
    } else {
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

  function handleEditRole(role: RoleRecord): void {
    const name = prompt('Group name:', role.role_name || '');
    if (!name) return;
    const permStr = prompt('Permissions JSON:', permissionsPromptDefault(role.permissions)) || '{}';
    let perms: unknown;
    try {
      perms = JSON.parse(permStr);
    } catch {
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

  function handleDeleteRole(role: RoleRecord): void {
    if (!confirm(`Delete group "${role.role_name || ''}"?`)) return;
    void deleteRoleRecord(meltdownEmit, jwt, role).then(() => {
      void fetchRoles(meltdownEmit, jwt).then(nextRoles => {
        roles = nextRoles;
        renderRoles();
      });
    }).catch(err => alert(`Error: ${errorMessage(err)}`));
  }

  function renderRoles(): void {
    roleList.innerHTML = '';
    if (!roles.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No permission groups found.';
      roleList.appendChild(empty);
    } else {
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
    [users, roles] = await Promise.all([
      fetchUsers(meltdownEmit, jwt),
      fetchRoles(meltdownEmit, jwt)
    ]);
    const built = buildCard();
    userList = built.usersListEl;
    roleList = built.rolesListEl;
    renderUsers();
    renderRoles();
    el.innerHTML = '';
    el.appendChild(built.card);
  } catch (err) {
    el.innerHTML = `<div class="error">Failed to load users: ${errorMessage(err)}</div>`;
  }
}
