

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

/**
 * mother/modules/userManagement/userCrudEvents.js
 *
 * meltdown event listeners for user CRUD:
 *   - createUser
 *   - getAllUsers
 *   - deleteUser
 *   - updateUserProfile
 *   - getUserDetailsByUsername
 *   - getUserDetailsById
 *   - getUserCount
 *
 * Also includes hashing passwords, etc.
 */
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { traceRuntimeEvent } = require('../../utils/runtimeLogging');

const TIMEOUT_DURATION = 5000;

// meltdown meltdown...
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('./permissionUtils');
const { getDbType } = require('../databaseManager/helpers/dbTypeHelpers');
const {
  hasPermissionBlobEntries,
  setUserAccess
} = require('./userAccessService');

function sanitizePayload(payload, hide = []) {
  const sanitized = { ...(payload || {}) };
  if (sanitized.jwt) sanitized.jwt = '[hidden]';
  if (sanitized.decodedJWT) sanitized.decodedJWT = '[omitted]';
  hide.forEach(k => {
    if (sanitized[k]) sanitized[k] = '***';
  });
  return sanitized;
}

function setupUserCrudEvents(motherEmitter) {
  // ==================== CREATE USER ====================
  motherEmitter.on(BACKEND_EVENTS.CREATE_USER, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

  const sanitized = sanitizePayload(payload, ['password']);
  traceRuntimeEvent('[USER MGMT] "createUser" event triggered. Payload:', sanitized);

    const {
      jwt,
      moduleName,
      moduleType,
      username,
      password,
      email,
      firstName,
      lastName,
      displayName,
      phone,
      company,
      website,
      avatarUrl,
      bio,
      uiColor,
      role,
      roleIds,
      directPermissions
    } = payload || {};
    const requestedRoleIds = Array.isArray(roleIds) ? roleIds : [];
    const hasAccessSelection = requestedRoleIds.length > 0 || hasPermissionBlobEntries(directPermissions);

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      console.error('[USER MGMT] createUser => Invalid meltdown payload.');
      return callback(new Error('[USER MGMT] createUser => invalid meltdown payload.'));
    }
    if (!username || !password) {
      console.error('[USER MGMT] createUser => Missing username or password => meltdown meltdown.');
      return callback(new Error('Username and password are required.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'users.create')) {
      return callback(new Error('Forbidden – missing permission: users.create'));
    }

    if (payload.decodedJWT && hasAccessSelection && !hasPermission(payload.decodedJWT, 'userManagement.editUser')) {
      return callback(new Error('[E_USER_ACCESS_EDIT_PERMISSION] Missing permission: userManagement.editUser'));
    }

    const timeout = setTimeout(() => {
      console.error('[USER MGMT] createUser => Timeout creating user => meltdown meltdown.');
      callback(new Error('[USER MGMT] Timeout creating user.'));
    }, TIMEOUT_DURATION);

    try {
      // 1) ensure username/email are unique
      const existingUser = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, { jwt, moduleName: 'userManagement', table: 'users', where: { username } }).then(rows => rows && rows[0]);
      if (existingUser) {
        clearTimeout(timeout);
        return callback(new Error('Username already exists.'));
      }
      let existingEmail = null;
      if (email) {
        existingEmail = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, { jwt, moduleName: 'userManagement', table: 'users', where: { email } }).then(rows => rows && rows[0]);
        if (existingEmail) {
          clearTimeout(timeout);
          return callback(new Error('Email already exists.'));
        }
      }

      // 2) Hash password
      const saltedPassword = password + (process.env.USER_PASSWORD_SALT || '');
      const hashedPassword = await bcrypt.hash(saltedPassword, 10);

      // 3) Prepare data
      const dataToInsert = {
        username,
        email       : email       || null,
        password    : hashedPassword,
        first_name  : firstName   || null,
        last_name   : lastName    || null,
        display_name: displayName || null,
        phone       : phone       || null,
        company     : company     || null,
        website     : website     || null,
        avatar_url  : avatarUrl   || null,
        bio         : bio         || null,
        ui_color    : uiColor     || null,
        token_version: 0,
        created_at  : new Date().toISOString(),
        updated_at  : new Date().toISOString()
      };

      // 3) Insert user
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_INSERT, {
        jwt,
        moduleName: 'userManagement',
        table: 'users',
        data: dataToInsert
      }).then(insertedRows => {
  // InsertOne on MongoDB returns an object with `insertedId`.
  // PostgreSQL/SQLite return an array of rows. Normalize both.
  let newUser;
  if (Array.isArray(insertedRows)) {
    newUser = insertedRows[0];
  } else if (insertedRows && insertedRows.insertedId) {
    // Reconstruct the created user object for MongoDB
    newUser = {
      id: insertedRows.insertedId,
      ...dataToInsert
    };
  } else {
    newUser = insertedRows;
  }
  if (!newUser || !newUser.id) {
    clearTimeout(timeout);
    return callback(new Error('No valid inserted user row'));
  }
  const userLog = {
    ...newUser
  };
  if (userLog && userLog.password) userLog.password = '***';
  traceRuntimeEvent('[USER MGMT] createUser => User inserted:', userLog);
  if (hasAccessSelection) {
    setUserAccess(motherEmitter, jwt, newUser.id, requestedRoleIds, directPermissions).then(() => {
      clearTimeout(timeout);
      callback(null, newUser);
    }).catch(accessErr => {
      clearTimeout(timeout);
      callback(accessErr);
    });
    return;
  }
  if (!role) {
    clearTimeout(timeout);
    return callback(null, newUser);
  }
  // Dann: DB-Select nach role_name
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: 'userManagement',
    table: 'roles',
    where: {
      role_name: role
    }
  }).then(rolesArr => {
    if (!rolesArr || !rolesArr.length) {
      clearTimeout(timeout);
      console.warn(`[USER MGMT] createUser => role "${role}" not found. user created without role.`);
      return callback(null, newUser);
    }
    const foundRole = rolesArr[0];
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.ASSIGN_ROLE_TO_USER, {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      userId: newUser.id,
      roleId: foundRole.id
    }).then(() => {
      clearTimeout(timeout);
      callback(null, newUser);
    }, assignErr => {
      console.warn('[USER MGMT] createUser => Error assigning role =>', assignErr.message);
    });
  }, roleErr => {
    clearTimeout(timeout);
    console.error('[USER MGMT] createUser => Error selecting roles:', roleErr.message);
    return callback(roleErr);
  });
}, dbErr => {
  clearTimeout(timeout);
  return callback(dbErr);
});
    } catch (ex) {
      clearTimeout(timeout);
      console.error('[USER MGMT] createUser => Exception:', ex.message);
      callback(ex);
    }
  });

  // ==================== PUBLIC REGISTER ====================
  motherEmitter.on(BACKEND_EVENTS.PUBLIC_REGISTER, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    const {
      jwt,
      moduleName,
      moduleType,
      username,
      password,
      role
    } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] publicRegister => invalid meltdown payload.'));
    }
    if (!payload.decodedJWT || payload.decodedJWT.isPublic !== true) {
      return callback(new Error('Forbidden – public token required'));
    }
    if (!username || !password) {
      return callback(new Error('Username and password are required.'));
    }

    const authModuleSecret = process.env.AUTH_MODULE_INTERNAL_SECRET;
    if (!authModuleSecret) {
      return callback(new Error('Missing AUTH_MODULE_INTERNAL_SECRET'));
    }

    try {
      const firstInstallDone = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_PUBLIC_SETTING, {
            jwt,
            moduleName: 'settingsManager',
            moduleType: 'core',
            key: 'FIRST_INSTALL_DONE'
          });

      const installationFinished = String(firstInstallDone).toLowerCase() === 'true';

      if (installationFinished) {
        const allowRegistration = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_PUBLIC_SETTING, {
              jwt,
              moduleName: 'settingsManager',
              moduleType: 'core',
              key: 'ALLOW_REGISTRATION'
            });

        if (String(allowRegistration).toLowerCase() !== 'true') {
          return callback(new Error('Public registration is disabled.'));
        }
      }

      const targetRole = installationFinished
        ? 'standard'
        : (role === 'admin' ? 'admin' : (role || 'admin'));

      requestBackendEvent(motherEmitter, BACKEND_EVENTS.ISSUE_MODULE_TOKEN, {
          skipJWT: true,
          authModuleSecret,
          moduleName: 'auth',
          moduleType: 'core',
          trustLevel: 'high',
          signAsModule: 'userManagement'
        }).then(highTok => {
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_USER, {
    jwt: highTok,
    moduleName: 'userManagement',
    moduleType: 'core',
    username,
    password,
    role: targetRole
  }).then(result => callback(null, result), error => callback(error));
}, err => {
  return callback(err);
});
    } catch (err) {
      callback(err);
    }
  });

  // ==================== GET ALL USERS ====================
  motherEmitter.on(BACKEND_EVENTS.GET_ALL_USERS, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "getAllUsers" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] getAllUsers => invalid meltdown payload.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'users.read')) {
      return callback(new Error('Forbidden – missing permission: users.read'));
    }

    const timeout = setTimeout(() => {
      console.error('[USER MGMT] getAllUsers => Timeout while fetching users => meltdown meltdown.');
      callback(new Error('Timeout while fetching users.'));
    }, TIMEOUT_DURATION);

    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt,
      moduleName: 'userManagement',
      table: 'users'
    }).then(rows => {
  clearTimeout(timeout);
  callback(null, rows);
}, err => {
  console.error('[USER MGMT] getAllUsers => Error:', err.message);
  return callback(err);
});
  });

  // ==================== DELETE USER ====================
  motherEmitter.on(BACKEND_EVENTS.DELETE_USER, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "deleteUser" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, userId } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] deleteUser => invalid meltdown payload.'));
    }
    if (!userId) {
      return callback(new Error('Missing userId.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'users.delete')) {
      return callback(new Error('Forbidden – missing permission: users.delete'));
    }

    const timeout = setTimeout(() => {
      console.error('[USER MGMT] deleteUser => Timeout => meltdown meltdown.');
      callback(new Error('Timeout deleting user.'));
    }, TIMEOUT_DURATION);

    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_DELETE, {
      jwt,
      moduleName: 'userManagement',
      table: 'users',
      where: { id: userId }
    }).then(() => {
  clearTimeout(timeout);
  // Optional: Tokens löschen
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.REVOKE_ALL_TOKENS_FOR_USER, {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    userId
  }).then(() => {
    callback(null);
  }, revErr => {
    console.error('[USER MGMT] deleteUser => error revoking tokens =>', revErr.message);
  });
}, err => {
  console.error('[USER MGMT] deleteUser => Error:', err.message);
  return callback(err);
});
  });

  // ==================== getUserDetailsByUsername ====================
  motherEmitter.on(BACKEND_EVENTS.GET_USER_DETAILS_BY_USERNAME, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "getUserDetailsByUsername" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, username } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      console.error('[USER MGMT] getUserDetailsByUsername => meltdown meltdown => invalid payload.');
      return callback(new Error('[USER MGMT] getUserDetailsByUsername => invalid meltdown payload.'));
    }
    if (!username) {
      console.error('[USER MGMT] getUserDetailsByUsername => Missing username => meltdown meltdown.');
      return callback(new Error('Missing username.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'users.read')) {
      return callback(new Error('Forbidden – missing permission: users.read'));
    }

    const timeout = setTimeout(() => {
      console.error('[USER MGMT] getUserDetailsByUsername => Timeout => meltdown meltdown.');
      callback(new Error('Timeout while fetching user details by username.'));
    }, TIMEOUT_DURATION);

    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt,
      moduleName: 'userManagement',
      table: 'users',
      where: { username }
    }).then(rows => {
  clearTimeout(timeout);
  if (!rows || rows.length === 0) {
    console.warn('[USER MGMT] getUserDetailsByUsername => No matching user found => meltdown meltdown.');
    return callback(null, null);
  }
  // Never print credential fields. The trace only confirms which record was
  // resolved when detailed event tracing is explicitly enabled.
  traceRuntimeEvent('[USER MGMT] getUserDetailsByUsername => Found user:', {
    id: rows[0].id ?? rows[0]._id ?? null,
    username: rows[0].username || null
  });
  callback(null, rows[0]);
}, err => {
  console.error('[USER MGMT] getUserDetailsByUsername => Error selecting user:', err.message);
  return callback(err);
});
  });

  // ==================== updateUserProfile ====================
  motherEmitter.on(BACKEND_EVENTS.UPDATE_USER_PROFILE, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    const sanitizedPayload = sanitizePayload(payload, ['newPassword']);
    traceRuntimeEvent('[USER MGMT] "updateUserProfile" event triggered. Payload:', sanitizedPayload);

    const {
      jwt,
      moduleName,
      moduleType,
      userId,

      newUsername,
      newEmail,
      newPassword,
      newFirstName,
      newLastName,
      newDisplayName,
      newPhone,
      newCompany,
      newWebsite,
      newAvatarUrl,
      newBio,
      newUiColor
    } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] updateUserProfile => invalid meltdown payload.'));
    }
    if (!userId) {
      return callback(new Error('Missing userId.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'users.update')) {
      return callback(new Error('Forbidden – missing permission: users.update'));
    }

    const timeout = setTimeout(() => {
      console.error('[USER MGMT] updateUserProfile => Timeout => meltdown meltdown.');
      callback(new Error('Timeout updating user profile.'));
    }, TIMEOUT_DURATION);

    try {
      const dataToUpdate = {
        updated_at: new Date().toISOString()
      };
      if (newUsername)     dataToUpdate.username     = newUsername;
      if (newEmail)        dataToUpdate.email        = newEmail;
      if (newFirstName)    dataToUpdate.first_name   = newFirstName;
      if (newLastName)     dataToUpdate.last_name    = newLastName;
      if (newDisplayName)  dataToUpdate.display_name = newDisplayName;
      if (newPhone)        dataToUpdate.phone        = newPhone;
      if (newCompany)      dataToUpdate.company      = newCompany;
      if (newWebsite)      dataToUpdate.website      = newWebsite;
      if (newAvatarUrl)    dataToUpdate.avatar_url   = newAvatarUrl;
      if (newBio)          dataToUpdate.bio          = newBio;
      if (newUiColor)     dataToUpdate.ui_color     = newUiColor;

      // Password?
      if (newPassword) {
        const saltedPassword = newPassword + (process.env.USER_PASSWORD_SALT || '');
        const hashed = await bcrypt.hash(saltedPassword, 10);
        dataToUpdate.password = hashed;
      }

      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
        jwt,
        moduleName: 'userManagement',
        table: 'users',
        where: { id: userId },
        data: dataToUpdate
      }).then(() => {
  clearTimeout(timeout);
  traceRuntimeEvent('[USER MGMT] updateUserProfile => Updated user profile for userId:', userId);
  callback(null, {
    success: true
  });
}, err => {
  console.error('[USER MGMT] updateUserProfile => meltdown meltdown => Error:', err.message);
  return callback(err);
});
    } catch (err) {
      clearTimeout(timeout);
      console.error('[USER MGMT] updateUserProfile => meltdown meltdown => Exception:', err.message);
      callback(err);
    }
  });

  // ==================== getUserDetailsById ====================
  motherEmitter.on(BACKEND_EVENTS.GET_USER_DETAILS_BY_ID, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "getUserDetailsById" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, userId } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] getUserDetailsById => invalid meltdown payload.'));
    }
    if (!userId) {
      return callback(new Error('Missing userId.'));
    }

    if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'users.read')) {
      return callback(new Error('Forbidden – missing permission: users.read'));
    }

    const timeout = setTimeout(() => {
      console.error('[USER MGMT] getUserDetailsById => Timeout => meltdown meltdown.');
      callback(new Error('Timeout while fetching user by ID.'));
    }, TIMEOUT_DURATION);

    const idField = getDbType() === 'mongodb' ? '_id' : 'id';
    let queryId = userId;
    if (
      getDbType() === 'mongodb' &&
      typeof userId === 'string' &&
      /^[0-9a-fA-F]{24}$/.test(userId)
    ) {
      queryId = new ObjectId(userId);
    }
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt,
      moduleName: 'userManagement',
      table: 'users',
      where: { [idField]: queryId }
    }).then(rows => {
  clearTimeout(timeout);
  if (!rows || rows.length === 0) {
    return callback(null, null);
  }
  callback(null, rows[0]);
}, err => {
  return callback(err);
});
  });

  // ==================== getUserCount ====================
  motherEmitter.on(BACKEND_EVENTS.GET_USER_COUNT, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    traceRuntimeEvent('[USER MGMT] "getUserCount" event triggered. Payload:', sanitizePayload(payload));
    const { jwt, moduleName, moduleType } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] getUserCount => invalid meltdown payload.'));
    }

    if (payload.decodedJWT) {
      const { decodedJWT } = payload;
      const isPublicLogin = decodedJWT.isPublic && decodedJWT.purpose === 'login';
      const isPublicFirstInstall = decodedJWT.isPublic && decodedJWT.purpose === 'firstInstallCheck';
      if (!isPublicLogin && !isPublicFirstInstall && !hasPermission(decodedJWT, 'users.read')) {
        return callback(new Error('Forbidden – missing permission: users.read'));
      }
    }

    const timeout = setTimeout(() => {
      console.error('[USER MGMT] getUserCount => Timeout => meltdown meltdown.');
      callback(new Error('Timeout while counting users.'));
    }, TIMEOUT_DURATION);

    requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt,
      moduleName: 'userManagement',
      table: 'users'
    }).then(rows => {
  clearTimeout(timeout);
  const userCount = rows ? rows.length : 0;
  traceRuntimeEvent('[USER MGMT] getUserCount => count:', userCount);
  callback(null, userCount);
}, err => {
  console.error('[getUserCount] DB error:', err.message);
  return callback(err);
});
  });
}

module.exports = { setupUserCrudEvents };
