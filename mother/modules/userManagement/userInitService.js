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

const DEFAULT_PERMISSION_DEFINITIONS = Object.freeze([
  { permission_key: 'settings.core.view', description: 'View core settings' },
  { permission_key: 'settings.core.edit', description: 'Edit core settings' },
  { permission_key: 'settings.unified.editSchemas', description: 'Manage unified settings schemas' },
  { permission_key: 'settings.unified.viewSettings', description: 'View unified settings values' },
  { permission_key: 'settings.unified.editSettings', description: 'Edit unified settings values' },

  { permission_key: 'auth.strategies.view', description: 'View configured login strategies' },
  { permission_key: 'auth.strategies.manage', description: 'Enable or disable login strategies' },

  { permission_key: 'agent.view', description: 'View agent surfaces and activity' },
  { permission_key: 'agent.access.manage', description: 'Create and revoke short-lived agent access codes' },
  { permission_key: 'agent.surface.write', description: 'Publish agent surface snapshots and command acknowledgements' },
  { permission_key: 'agent.control', description: 'Control agent surface commands and workflows' },

  { permission_key: 'builder.use', description: 'Use the Page Builder' },
  { permission_key: 'builder.manage', description: 'Manage builder assets and app integrations' },
  { permission_key: 'builder.publish', description: 'Publish builder assets and pages' },

  { permission_key: 'content.types.manage', description: 'Manage content type definitions' },
  { permission_key: 'content.create', description: 'Create content entries' },
  { permission_key: 'content.update', description: 'Update content entries' },
  { permission_key: 'content.publish', description: 'Publish content entries' },
  { permission_key: 'content.delete', description: 'Trash or delete content entries' },
  { permission_key: 'content.restore', description: 'Restore trashed content entries' },
  { permission_key: 'comments.create', description: 'Create comments' },
  { permission_key: 'comments.edit', description: 'Edit comments' },
  { permission_key: 'comments.moderate', description: 'Moderate comments' },
  { permission_key: 'comments.delete', description: 'Delete comments' },

  { permission_key: 'navigation.manage', description: 'Manage navigation menus and locations' },
  { permission_key: 'seo.manage', description: 'Manage SEO metadata, robots and sitemaps' },
  { permission_key: 'search.manage', description: 'Manage search indexes' },
  { permission_key: 'redirects.manage', description: 'Manage redirect rules and redirect hit data' },
  { permission_key: 'media.manage', description: 'Manage media attachments, variants and relations' },
  { permission_key: 'fonts.read', description: 'Read configured fonts and font providers' },
  { permission_key: 'fonts.manage', description: 'Manage fonts and font providers' },
  { permission_key: 'metadata.manage', description: 'Manage custom metadata fields and values' },
  { permission_key: 'notifications.read', description: 'Read recent system notifications' },

  { permission_key: 'pages.create', description: 'Create pages' },
  { permission_key: 'pages.read', description: 'Read pages' },
  { permission_key: 'pages.update', description: 'Update pages' },
  { permission_key: 'pages.delete', description: 'Delete pages' },
  { permission_key: 'pages.manage', description: 'Manage page hierarchy and advanced page settings' },

  { permission_key: 'plainspace.read', description: 'Read PlainSpace layouts and presentation metadata' },
  { permission_key: 'plainspace.saveLayout', description: 'Save PlainSpace layouts' },
  { permission_key: 'plainspace.saveLayoutTemplate', description: 'Save PlainSpace layout templates' },
  { permission_key: 'plainspace.widgetInstance', description: 'Manage PlainSpace widget instances' },

  { permission_key: 'widgets.create', description: 'Create widgets' },
  { permission_key: 'widgets.read', description: 'Read widgets' },
  { permission_key: 'widgets.update', description: 'Update widgets' },
  { permission_key: 'widgets.delete', description: 'Delete widgets' },
  { permission_key: 'widgets.saveLayout', description: 'Save widget layouts' },

  { permission_key: 'modules.install', description: 'Install modules' },
  { permission_key: 'modules.list', description: 'List modules' },
  { permission_key: 'modules.listActive', description: 'List active modules' },
  { permission_key: 'modules.activate', description: 'Activate modules' },
  { permission_key: 'modules.deactivate', description: 'Deactivate modules' },
  { permission_key: 'modules.manageAccess', description: 'Approve module access requests' },

  { permission_key: 'apps.list', description: 'List installed apps' },
  { permission_key: 'apps.rescan', description: 'Rescan app manifests and rebuild the app registry' },

  { permission_key: 'importers.list', description: 'List available content importers' },
  { permission_key: 'importers.run', description: 'Run content imports' },
  { permission_key: 'exporters.list', description: 'List available content exporters' },
  { permission_key: 'exporters.run', description: 'Run content exports and backups' },
  { permission_key: 'themes.list', description: 'List installed themes' },
  { permission_key: 'themes.activate', description: 'Activate installed themes' },

  { permission_key: 'userManagement.createRole', description: 'Create roles' },
  { permission_key: 'userManagement.editRole', description: 'Edit roles' },
  { permission_key: 'userManagement.deleteRole', description: 'Delete roles' },
  { permission_key: 'userManagement.listRoles', description: 'List roles' },
  { permission_key: 'userManagement.managePermissions', description: 'Manage permission records' },
  { permission_key: 'userManagement.editUser', description: 'Assign user roles and groups' },

  { permission_key: 'users.create', description: 'Create users' },
  { permission_key: 'users.read', description: 'Read users' },
  { permission_key: 'users.update', description: 'Update users' },
  { permission_key: 'users.delete', description: 'Delete users' },

  { permission_key: 'serverManager.createLocation', description: 'Create server locations' },
  { permission_key: 'serverManager.viewLocations', description: 'View server locations' },
  { permission_key: 'serverManager.editLocation', description: 'Edit server locations' },
  { permission_key: 'serverManager.deleteLocation', description: 'Delete server locations' },

  { permission_key: 'share.create', description: 'Create share tokens' },
  { permission_key: 'share.read', description: 'Read shared resources' },
  { permission_key: 'share.revoke', description: 'Revoke share tokens' },

  { permission_key: 'translations.create', description: 'Create translations' },
  { permission_key: 'translations.read', description: 'Read translations' },
  { permission_key: 'translations.update', description: 'Update translations' },
  { permission_key: 'translations.delete', description: 'Delete translations' },
  { permission_key: 'translations.addLanguage', description: 'Add translation languages' },
  { permission_key: 'translations.listLanguages', description: 'List translation languages' }
]);

function parsePermissionBlob(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function makeAdminPermissionBlob(existing = {}) {
  return JSON.stringify({
    ...existing,
    '*': true,
    canAccessEverything: true
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

  const roleList = Array.isArray(roles) ? roles : [];
  const names = roleList.map(r => (r.role_name || '').toLowerCase());
  const adminRole = roleList.find(r => (r.role_name || '').toLowerCase() === 'admin');
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
        permissions: makeAdminPermissionBlob(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }));
  } else {
    const adminPermissions = parsePermissionBlob(adminRole.permissions);
    if (adminPermissions['*'] !== true || adminPermissions.canAccessEverything !== true) {
      const where = adminRole.id != null ? { id: adminRole.id } : { role_name: adminRole.role_name || 'admin' };
      tasks.push(emitAsync(motherEmitter, 'dbUpdate', {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core',
        table: 'roles',
        where,
        data: {
          permissions: makeAdminPermissionBlob(adminPermissions),
          updated_at: new Date().toISOString()
        }
      }));
    }
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

  const existing = new Set((Array.isArray(perms) ? perms : [])
    .map(p => (p.permission_key || '').toLowerCase()));
  const tasks = DEFAULT_PERMISSION_DEFINITIONS
    .filter(def => !existing.has(def.permission_key.toLowerCase()))
    .map(def => emitAsync(motherEmitter, 'dbInsert', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      table: 'permissions',
      data: {
        permission_key: def.permission_key,
        description: def.description,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }));

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
  DEFAULT_PERMISSION_DEFINITIONS,
  parsePermissionBlob,
  makeAdminPermissionBlob,
  ensureFirstUserIsAdmin          // neue Routine wird mit‑exportiert
};
