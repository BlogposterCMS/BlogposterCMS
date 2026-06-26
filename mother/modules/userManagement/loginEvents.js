/**
 * mother/modules/userManagement/loginEvents.js
 *
 * Meltdown events specifically for userLogin & finalizeUserLogin,
 * which merges roles, calls mergeAllPermissions, and issues final tokens.
 */
const bcrypt = require('bcryptjs');
const { mergeAllPermissions } = require('./permissionUtils');

// Because meltdown meltdown can cause double-callback fiasco
const { onceCallback } = require('../../emitters/motherEmitter');

function sanitizePayload(payload, hide = []) {
  const sanitized = { ...(payload || {}) };
  if (sanitized.jwt) sanitized.jwt = '[hidden]';
  if (sanitized.decodedJWT) sanitized.decodedJWT = '[omitted]';
  hide.forEach(k => {
    if (sanitized[k]) sanitized[k] = '***';
  });
  return sanitized;
}

function setupLoginEvents(motherEmitter) {
  // ================ userLogin ================
  motherEmitter.on('userLogin', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    const sanitized = sanitizePayload(payload, ['password']);
    console.log('[USER MGMT] "userLogin" event triggered. Payload:', sanitized);
    const { jwt, moduleName, moduleType, username, password } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      console.error('[USER MGMT] userLogin => invalid meltdown payload. meltdown meltdown.');
      return callback(new Error('[USER MGMT] userLogin => invalid meltdown payload.'));
    }
    if (!username || !password) {
      console.warn('[USER MGMT] userLogin => Missing username/password => invalid credentials.');
      return callback(null, null);
    }

    // meltdown => getUserDetailsByUsername
    motherEmitter.emit(
      'getUserDetailsByUsername',
      {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core',
        username
      },
      async (err, userRecord) => {
        if (err) return callback(err);
        if (!userRecord) {
          console.warn('[USER MGMT] userLogin => No user found => null.');
          return callback(null, null);
        }

        // Compare password
        const salted = password + (process.env.USER_PASSWORD_SALT || '');
        try {
          const isMatch = await bcrypt.compare(salted, userRecord.password);
          if (!isMatch) {
            console.warn('[USER MGMT] userLogin => Password mismatch.');
            return callback(null, null);
          }
          // Success
          callback(null, userRecord);
        } catch (ex) {
          callback(ex);
        }
      }
    );
  });

  // ================ finalizeUserLogin ================
  motherEmitter.on('finalizeUserLogin', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    console.log('[USER MGMT] "finalizeUserLogin" event =>', sanitizePayload(payload));
    const { jwt, moduleName, moduleType, userId, extraData } = payload || {};

    if (!jwt || moduleName !== 'userManagement' || moduleType !== 'core') {
      return callback(new Error('[USER MGMT] finalizeUserLogin => invalid meltdown payload.'));
    }
    if (!userId) {
      return callback(new Error('Missing userId in finalizeUserLogin.'));
    }
    const authModuleSecret = process.env.AUTH_MODULE_INTERNAL_SECRET;
    if (!authModuleSecret) {
      return callback(new Error('[USER MGMT] finalizeUserLogin => missing AUTH_MODULE_INTERNAL_SECRET'));
    }

    // meltdown => getUserDetailsById
    motherEmitter.emit(
      'getUserDetailsById',
      {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core',
        userId
      },
      (err, userRecord) => {
        if (err) return callback(err);
        if (!userRecord) {
          return callback(new Error(`No user found => id=${userId}`));
        }

        // meltdown => getRolesForUser => gather roles
        motherEmitter.emit(
          'getRolesForUser',
          {
            jwt,
            moduleName: 'userManagement',
            moduleType: 'core',
            userId
          },
          (roleErr, rolesArr) => {
            if (roleErr) return callback(roleErr);

            // Merge roles => permissions
            mergeAllPermissions(motherEmitter, jwt, rolesArr, (mergedPermissions) => {
              // e.g. roleNames
              const roleNames = rolesArr.map(r => r.role_name);

              // Check if admin => assign wildcard
              const isAdmin = roleNames.includes('admin')||
              (userRecord.role && userRecord.role.toLowerCase() === 'admin');
              const finalPermissions = isAdmin
                ? { '*': true } // Admin gets wildcard
                : mergedPermissions;

              // meltdown => issueUserToken => embed finalPermissions + roles
              motherEmitter.emit(
                'issueUserToken',
                {
                  skipJWT         : true,
                  authModuleSecret,
                  moduleName      : 'auth',
                  moduleType      : 'core',
                  userId          : userRecord.id,
                  role            : isAdmin ? 'admin' : (userRecord.role || 'user'),
                  customPermissions: finalPermissions,
                  customRoles      : roleNames
                },
                (tokenErr, finalToken) => {
                  if (tokenErr) return callback(tokenErr);

                  const finalUserObj = {
                    ...userRecord,
                    permissions: finalPermissions,
                    roles: roleNames,
                    jwt: finalToken
                  };
                  if (extraData && typeof extraData === 'object') {
                    Object.assign(finalUserObj, extraData);
                  }

                  callback(null, finalUserObj);
                }
              );
            });
          }
        );
      }
    );
  });
}

module.exports = { setupLoginEvents };
