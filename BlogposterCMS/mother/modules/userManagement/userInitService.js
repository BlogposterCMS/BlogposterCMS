/**
 * mother/modules/userManagement/userInitService.js
 *
 * – erstellt (falls nötig) Datenbank + Tabellen
 * – legt Default‑Rollen "admin" & "standard" an
 * – sorgt dafür, dass der allererste Benutzer immer auch wirklich
 *   ein admin‑Mapping in user_roles hat
 */

require('dotenv').config();

/* ------------------------------------------------------------- */
/*  Generic Promise‑Wrapper für db‑Operationen via motherEmitter  */
/* ------------------------------------------------------------- */
function emitAsync(motherEmitter, event, payload) {
  return new Promise((res, rej) => {
    motherEmitter.emit(event, payload, (err, data) =>
      err ? rej(err) : res(data)
    );
  });
}

/* ====================== 1) DB / Schema ======================= */
async function ensureUserManagementDatabase(motherEmitter, jwt) {
  console.log('[USER SERVICE] Ensuring the userManagement data store…');
  await emitAsync(motherEmitter, 'createDatabase', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core'
  });
  console.log('[USER SERVICE] data‑store creation done (if needed).');
}

async function ensureUserManagementSchemaAndTables(motherEmitter, jwt) {
  console.log('[USER SERVICE] Initialising user tables/collections…');
  await emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: '__rawSQL__',
    where: {},
    data: { rawSQL: 'INIT_USER_MANAGEMENT' }
  });
  console.log('[USER SERVICE] tables ensured/created.');
}

/* ===================== 2) Default‑Rollen ===================== */
async function ensureDefaultRoles(motherEmitter, jwt) {
  console.log('[USER SERVICE] Checking default roles…');
  const roles = await emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'roles'
  });

  const names = roles.map(r => (r.role_name || '').toLowerCase());
  const tasks = [];

  if (!names.includes('admin')) {
    tasks.push(emitAsync(motherEmitter, 'dbInsert', {
      jwt,
      moduleName: 'userManagement',
      table: 'roles',
      data: {
        role_name: 'admin',
        is_system_role: true,
        description: 'System Admin Role',
        permissions: JSON.stringify({ canAccessEverything: true }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }));
  }

  if (!names.includes('standard')) {
    tasks.push(emitAsync(motherEmitter, 'dbInsert', {
      jwt,
      moduleName: 'userManagement',
      table: 'roles',
      data: {
        role_name: 'standard',
        is_system_role: false,
        description: 'Default basic user role',
        permissions: JSON.stringify({}),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }));
  }

  await Promise.all(tasks);
  console.log('[USER SERVICE] Default roles ensured.');
}

/* ==================== 2b) Default Permissions ==================== */
async function ensureDefaultPermissions(motherEmitter, jwt) {
  console.log('[USER SERVICE] Checking default permissions…');
  const perms = await emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'permissions'
  });

  const existing = perms.map(p => (p.permission_key || '').toLowerCase());
  const tasks = [];

  if (!existing.includes('settings.core.view')) {
    tasks.push(emitAsync(motherEmitter, 'dbInsert', {
      jwt,
      moduleName: 'userManagement',
      table: 'permissions',
      data: {
        permission_key: 'settings.core.view',
        description: 'View core settings',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }));
  }

  if (!existing.includes('settings.core.edit')) {
    tasks.push(emitAsync(motherEmitter, 'dbInsert', {
      jwt,
      moduleName: 'userManagement',
      table: 'permissions',
      data: {
        permission_key: 'settings.core.edit',
        description: 'Edit core settings',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }));
  }

  if (!existing.includes('builder.use')) {
    tasks.push(emitAsync(motherEmitter, 'dbInsert', {
      jwt,
      moduleName: 'userManagement',
      table: 'permissions',
      data: {
        permission_key: 'builder.use',
        description: 'Use the Page Builder',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }));
  }

  await Promise.all(tasks);
  console.log('[USER SERVICE] Default permissions ensured.');
}

async function ensureUserColorField(motherEmitter, jwt) {
  console.log('[USER SERVICE] Ensuring ui_color field…');
  await emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: '__rawSQL__',
    where: {},
    data: { rawSQL: 'ADD_USER_FIELD', fieldName: 'ui_color', fieldType: 'VARCHAR(16)' }
  });
  console.log('[USER SERVICE] ui_color field ensured.');
}

/* ============ 3) Self‑Healing: erster User = Admin ============ */
async function ensureFirstUserIsAdmin(motherEmitter, jwt) {
  console.log('[USER SERVICE] Verifying that at least one admin exists…');

  // admin‑Role finden
  const [adminRole] = await emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'roles',
    where: { role_name: 'admin' }
  });

  if (!adminRole) {
    console.warn('[USER SERVICE] No "admin" role found – skipped self‑heal.');
    return;
  }

  // gibt es schon ein Mapping?
  const existing = await emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'user_roles',
    where: { role_id: adminRole.id },
    limit: 1
  });

  if (existing.length) {
    console.log('[USER SERVICE] Admin mapping exists – nothing to heal.');
    return;
  }

  // ersten User holen
  const [firstUser] = await emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'users',
    limit: 1,
    orderBy: 'id asc'
  });

  if (!firstUser) {
    console.log('[USER SERVICE] No users yet – self‑heal postponed.');
    return;
  }

  // Mapping anlegen
  try {
    await emitAsync(motherEmitter, 'dbInsert', {
      jwt,
      moduleName: 'userManagement',
      table: 'user_roles',
      data: { user_id: firstUser.id, role_id: adminRole.id }
    });
    console.log(`[USER SERVICE] Self‑Heal: User #${firstUser.id} zum Admin befördert.`);
  } catch (e) {
    if (/duplicate key/i.test(e.message)) {
      console.log('[USER SERVICE] Race condition – admin mapping already inserted by another process.');
    } else {
      throw e;
    }
  }
}

/* ======================= Export‑API ========================== */
module.exports = {
  ensureUserManagementDatabase,
  ensureUserManagementSchemaAndTables,
  ensureDefaultRoles,
  ensureDefaultPermissions,
  ensureUserColorField,
  ensureFirstUserIsAdmin          // neue Routine wird mit‑exportiert
};
