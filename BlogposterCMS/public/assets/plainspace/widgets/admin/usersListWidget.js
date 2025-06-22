export async function render(el) {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;

  let users = [];
  let roles = [];

  async function fetchUsers() {
    const res = await meltdownEmit('getAllUsers', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core'
    });
    users = Array.isArray(res) ? res : (res?.data ?? []);
  }

  async function fetchRoles() {
    const res = await meltdownEmit('getAllRoles', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core'
    });
    roles = Array.isArray(res) ? res : (res?.data ?? []);
  }

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
      const username = prompt('Username:');
      if (!username) return;
      const password = prompt('Password:');
      if (!password) return;
      const email = prompt('Email (optional):') || '';
      try {
        await meltdownEmit('createUser', {
          jwt,
          moduleName: 'userManagement',
          moduleType: 'core',
          username,
          password,
          email
        });
        await fetchUsers();
        renderUsers();
      } catch (err) {
        alert('Error: ' + err.message);
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
      let perms;
      try { perms = JSON.parse(permStr); } catch { alert('Invalid JSON'); return; }
      try {
        await meltdownEmit('createRole', {
          jwt,
          moduleName: 'userManagement',
          moduleType: 'core',
          roleName: name,
          permissions: perms
        });
        await fetchRoles();
        renderRoles();
      } catch (err) {
        alert('Error: ' + err.message);
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

  let userList;
  let roleList;

  function renderUsers() {
    userList.innerHTML = '';
    if (!users.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No users found.';
      userList.appendChild(empty);
    } else {
      users.forEach(u => {
        const li = document.createElement('li');
        const name = u.display_name || u.username || u.email || `ID ${u.id}`;
        const link = document.createElement('a');
        link.href = `/admin/settings/users/edit/${u.id}`;
        link.textContent = name;
        li.appendChild(link);
        userList.appendChild(li);
      });
    }
  }

  function handleEditRole(role) {
    const name = prompt('Group name:', role.role_name);
    if (!name) return;
    const permStr = prompt('Permissions JSON:', role.permissions || '{}') || '{}';
    let perms;
    try { perms = JSON.parse(permStr); } catch { alert('Invalid JSON'); return; }
    const desc = prompt('Description (optional):', role.description || '') || '';
    meltdownEmit('updateRole', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      roleId: role.id,
      newRoleName: name,
      newDescription: desc,
      newPermissions: perms
    }).then(() => {
      fetchRoles().then(renderRoles);
    }).catch(err => alert('Error: ' + err.message));
  }

  function handleDeleteRole(role) {
    if (!confirm(`Delete group "${role.role_name}"?`)) return;
    meltdownEmit('deleteRole', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      roleId: role.id
    }).then(() => {
      fetchRoles().then(renderRoles);
    }).catch(err => alert('Error: ' + err.message));
  }

  function renderRoles() {
    roleList.innerHTML = '';
    if (!roles.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No permission groups found.';
      roleList.appendChild(empty);
    } else {
      roles.forEach(r => {
        const li = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'page-name-row';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'page-name';
        nameSpan.textContent = r.role_name + (r.description ? ` - ${r.description}` : '');

        const actions = document.createElement('span');
        actions.className = 'page-actions';
        if (!r.is_system_role) {
          actions.innerHTML = window.featherIcon('edit', 'edit-role') +
                            window.featherIcon('delete', 'delete-role');
        }

        row.appendChild(nameSpan);
        row.appendChild(actions);
        li.appendChild(row);
        roleList.appendChild(li);

        if (!r.is_system_role) {
          li.querySelector('.edit-role').addEventListener('click', () => handleEditRole(r));
          li.querySelector('.delete-role').addEventListener('click', () => handleDeleteRole(r));
        }
      });
    }
  }

  try {
    await Promise.all([fetchUsers(), fetchRoles()]);
    const built = buildCard();
    const card = built.card;
    userList = built.usersListEl;
    roleList = built.rolesListEl;
    renderUsers();
    renderRoles();
    el.innerHTML = '';
    el.appendChild(card);
  } catch (err) {
    el.innerHTML = `<div class="error">Failed to load users: ${err.message}</div>`;
  }
}
