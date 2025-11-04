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

const TIMEOUT_DURATION = 5000;

// meltdown meltdown...
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('./permissionUtils');
const { getDbType } = require('../databaseManager/helpers/dbTypeHelpers');

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
  motherEmitter.on('createUser', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

  const sanitized = sanitizePayload(payload, ['password']);
  console.log('[USER MGMT] "createUser" event triggered. Payload:', sanitized);

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
      role
    } = payload || {};

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

    const timeout = setTimeout(() => {
      console.error('[USER MGMT] createUser => Timeout creating user => meltdown meltdown.');
      callback(new Error('[USER MGMT] Timeout creating user.'));
    }, TIMEOUT_DURATION);

    try {
      // 1) ensure username/email are unique
      const existingUser = await new Promise((res, rej) => {
        motherEmitter.emit(
          'dbSelect',
          { jwt, moduleName: 'userManagement', table: 'users', where: { username } },
          (e, rows) => (e ? rej(e) : res(rows && rows[0]))
        );
      });
      if (existingUser) {
        clearTimeout(timeout);
        return callback(new Error('Username already exists.'));
      }
      let existingEmail = null;
      if (email) {
        existingEmail = await new Promise((res, rej) => {
          motherEmitter.emit(
            'dbSelect',
            { jwt, moduleName: 'userManagement', table: 'users', where: { email } },
            (e, rows) => (e ? rej(e) : res(rows && rows[0]))
          );
        });
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
      motherEmitter.emit('dbInsert', {
        jwt,
        moduleName: 'userManagement',
        table: 'users',
        data: dataToInsert
      }, (dbErr, insertedRows) => {
        if (dbErr) {
          clearTimeout(timeout);
          return callback(dbErr);
        }

        // InsertOne on MongoDB returns an object with `insertedId`.
        // PostgreSQL/SQLite return an array of rows. Normalize both.
        let newUser;
        if (Array.isArray(insertedRows)) {
          newUser = insertedRows[0];
        } else if (insertedRows && insertedRows.insertedId) {
          // Reconstruct the created user object for MongoDB
          newUser = { id: insertedRows.insertedId, ...dataToInsert };
        } else {
          newUser = insertedRows;
        }

        if (!newUser || !newUser.id) {
          clearTimeout(timeout);
          return callback(new Error('No valid inserted user row'));
        }
      
        const userLog = { ...newUser };
        if (userLog && userLog.password) userLog.password = '***';
        console.log('[USER MGMT] createUser => User inserted:', userLog);
      
        if (!role) {
          clearTimeout(timeout);
          return callback(null, newUser);
        }
      
        // Dann: DB-Select nach role_name
        motherEmitter.emit('dbSelect', {
          jwt,
          moduleName: 'userManagement',
          table: 'roles',
          where: { role_name: role }
        }, (roleErr, rolesArr) => {
          if (roleErr) {
            clearTimeout(timeout);
            console.error('[USER MGMT] createUser => Error selecting roles:', roleErr.message);
            return callback(roleErr);
          }
          if (!rolesArr || !rolesArr.length) {
            clearTimeout(timeout);
            console.warn(`[USER MGMT] createUser => role "${role}" not found. user created without role.`);
            return callback(null, newUser);
          }
      
          const foundRole = rolesArr[0];
          motherEmitter.emit('assignRoleToUser', {
            jwt,
            moduleName: 'userManagement',
            moduleType: 'core',
            userId: newUser.id,
            roleId: foundRole.id
          }, (assignErr) => {
            if (assignErr) {
              console.warn('[USER MGMT] createUser => Error assigning role =>', assignErr.message);
            }
            clearTimeout(timeout);
            callback(null, newUser);
          });
        });
      });
    } catch (ex) {
      clearTimeout(timeout);
      console.error('[USER MGMT] createUser => Exception:', ex.message);
      callback(ex);
    }
  });

  // ==================== PUBLIC REGISTER ====================
  motherEmitter.on('publicRegister', async (payload, originalCb) => {
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
      const firstInstallDone = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'getPublicSetting',
          {
            jwt,
            moduleName: 'settingsManager',
            moduleType: 'core',
            key: 'FIRST_INSTALL_DONE'
          },
          (err, val) => (err ? reject(err) : resolve(val))
        );
      });

      const installationFinished = String(firstInstallDone).toLowerCase() === 'true';

      if (installationFinished) {
        const allowRegistration = await new Promise((resolve, reject) => {
          motherEmitter.emit(
            'getPublicSetting',
            {
              jwt,
              moduleName: 'settingsManager',
              moduleType: 'core',
              key: 'ALLOW_REGISTRATION'
            },
            (err, val) => (err ? reject(err) : resolve(val))
          );
        });

        if (String(allowRegistration).toLowerCase() !== 'true') {
          return callback(new Error('Public registration is disabled.'));
        }
      }

      const targetRole = installationFinished
        ? 'standard'
        : (role === 'admin' ? 'admin' : (role || 'admin'));

      motherEmitter.emit(
        'issueModuleToken',
        {
          skipJWT: true,
          authModuleSecret,
          moduleName: 'auth',
          moduleType: 'core',
          trustLevel: 'high',
          signAsModule: 'userManagement'
        },
        (err, highTok) => {
          if (err) return callback(err);
          motherEmitter.emit(
            'createUser',
            {
              jwt: highTok,
              moduleName: 'userManagement',
              moduleType: 'core',
              username,
              password,
              role: targetRole
            },
            callback
          );
        }
      );
    } catch (err) {
      callback(err);
    }
  });

  // ==================== GET ALL USERS ====================
  motherEmitter.on('getAllUsers', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "getAllUsers" event triggered. Payload:', sanitizePayload(payload));
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

    motherEmitter.emit('dbSelect', {
      jwt,
      moduleName: 'userManagement',
      table: 'users'
    }, (err, rows) => {
      clearTimeout(timeout);
      if (err) {
        console.error('[USER MGMT] getAllUsers => Error:', err.message);
        return callback(err);
      }
      callback(null, rows);
    });
  });

  // ==================== DELETE USER ====================
  motherEmitter.on('deleteUser', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "deleteUser" event triggered. Payload:', sanitizePayload(payload));
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

    motherEmitter.emit('dbDelete', {
      jwt,
      moduleName: 'userManagement',
      table: 'users',
      where: { id: userId }
    }, (err) => {
      clearTimeout(timeout);
      if (err) {
        console.error('[USER MGMT] deleteUser => Error:', err.message);
        return callback(err);
      }

      // Optional: Tokens löschen
      motherEmitter.emit('revokeAllTokensForUser', { userId }, (revErr) => {
        if (revErr) {
          console.error('[USER MGMT] deleteUser => error revoking tokens =>', revErr.message);
        }
        callback(null);
      });
    });
  });

  // ==================== getUserDetailsByUsername ====================
  motherEmitter.on('getUserDetailsByUsername', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "getUserDetailsByUsername" event triggered. Payload:', sanitizePayload(payload));
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

    motherEmitter.emit('dbSelect', {
      jwt,
      moduleName: 'userManagement',
      table: 'users',
      where: { username }
    }, (err, rows) => {
      clearTimeout(timeout);
      if (err) {
        console.error('[USER MGMT] getUserDetailsByUsername => Error selecting user:', err.message);
        return callback(err);
      }
      if (!rows || rows.length === 0) {
        console.warn('[USER MGMT] getUserDetailsByUsername => No matching user found => meltdown meltdown.');
        return callback(null, null);
      }
      console.log('[USER MGMT] getUserDetailsByUsername => Found user record:', rows[0]);
      callback(null, rows[0]);
    });
  });

  // ==================== updateUserProfile ====================
  motherEmitter.on('updateUserProfile', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    const sanitizedPayload = sanitizePayload(payload, ['newPassword']);
    console.log('[USER MGMT] "updateUserProfile" event triggered. Payload:', sanitizedPayload);

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

      motherEmitter.emit('dbUpdate', {
        jwt,
        moduleName: 'userManagement',
        table: 'users',
        where: { id: userId },
        data: dataToUpdate
      }, (err) => {
        clearTimeout(timeout);
        if (err) {
          console.error('[USER MGMT] updateUserProfile => meltdown meltdown => Error:', err.message);
          return callback(err);
        }
        console.log('[USER MGMT] updateUserProfile => Updated user profile for userId:', userId);
        callback(null, { success: true });
      });
    } catch (err) {
      clearTimeout(timeout);
      console.error('[USER MGMT] updateUserProfile => meltdown meltdown => Exception:', err.message);
      callback(err);
    }
  });

  // ==================== getUserDetailsById ====================
  motherEmitter.on('getUserDetailsById', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "getUserDetailsById" event triggered. Payload:', sanitizePayload(payload));
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
    motherEmitter.emit('dbSelect', {
      jwt,
      moduleName: 'userManagement',
      table: 'users',
      where: { [idField]: queryId }
    }, (err, rows) => {
      clearTimeout(timeout);
      if (err) return callback(err);
      if (!rows || rows.length === 0) {
        return callback(null, null);
      }
      callback(null, rows[0]);
    });
  });

  // ==================== getUserCount ====================
  motherEmitter.on('getUserCount', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "getUserCount" event triggered. Payload:', sanitizePayload(payload));
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

    motherEmitter.emit('dbSelect', {
      jwt,
      moduleName: 'userManagement',
      table: 'users'
    }, (err, rows) => {
      clearTimeout(timeout);
      if (err) {
        console.error('[getUserCount] DB error:', err.message);
        return callback(err);
      }
      const userCount = rows ? rows.length : 0;
      console.log('[DEBUG] userCount:', userCount);
      callback(null, userCount);
    });
  });
}

module.exports = { setupUserCrudEvents };
