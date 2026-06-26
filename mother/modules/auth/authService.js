/**
 * mother/modules/auth/authService.js
 *
 * Provides meltdown event listeners for:
 *   - issueModuleToken
 *   - issueUserToken (with custom roles & perms)
 *   - issuePublicToken
 *   - validateToken
 *   - refresh tokens
 * etc.
 *
 * Also, we store refresh tokens in DB, because of course we do.
 */

require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Destructure the mother emitter and onceCallback from the object
const { motherEmitter, onceCallback } = require('../../emitters/motherEmitter');

// Because everything is better with some sets
let revokedTokens = new Set();
let userToJtiMapping = {};

const moduleExpiryOverrides = {};
const userExpiryOverrides   = {};
const AUTH_MODULE_NAME = 'auth';
const USER_MANAGEMENT_MODULE_NAME = 'userManagement';
const CORE_MODULE_TYPE = 'core';

function trustLevelToExpiry(trustLevel) {
  switch ((trustLevel || '').toLowerCase()) {
    case 'high':   return process.env.JWT_EXPIRY_HIGH   || '24h';
    case 'medium': return process.env.JWT_EXPIRY_MEDIUM || '1h';
    default:       return process.env.JWT_EXPIRY_LOW    || '15m';
  }
}

function combineSecretWithSalt(baseSecret, trustLevel) {
  switch ((trustLevel || '').toLowerCase()) {
    case 'high':   return baseSecret + (process.env.TOKEN_SALT_HIGH   || '');
    case 'medium': return baseSecret + (process.env.TOKEN_SALT_MEDIUM || '');
    default:       return baseSecret + (process.env.TOKEN_SALT_LOW    || '');
  }
}

function getModuleExpiry(moduleName, trustLevel) {
  if (moduleExpiryOverrides[moduleName]) {
    return moduleExpiryOverrides[moduleName];
  }
  return trustLevelToExpiry(trustLevel);
}

function getUserExpiry(role, trustLevel) {
  if (userExpiryOverrides[role]) {
    return userExpiryOverrides[role];
  }
  return trustLevelToExpiry(trustLevel);
}

function mapRoleToTrustLevel(roleName) {
  if (!roleName) return 'low';
  const lower = roleName.toLowerCase();
  if (lower === 'admin') return 'high';
  if (lower === 'editor' || lower === 'manager') return 'medium';
  return 'low';
}

function getInternalAuthSecret() {
  return process.env.AUTH_MODULE_INTERNAL_SECRET || '';
}

function isInternalAuthPayload(payload) {
  return Boolean(
    payload
    && payload.skipJWT === true
    && payload.moduleName === AUTH_MODULE_NAME
    && payload.moduleType === CORE_MODULE_TYPE
    && payload.authModuleSecret === getInternalAuthSecret()
  );
}

function assertInternalAuthPayload(payload, eventName) {
  if (!isInternalAuthPayload(payload)) {
    throw new Error(`[AUTH MODULE] ${eventName} => internal auth payload required.`);
  }
}

function assertCorePayloadFrom(payload, eventName, allowedModuleNames) {
  const allowed = Array.isArray(allowedModuleNames) ? allowedModuleNames : [allowedModuleNames];
  if (!payload?.jwt || payload.moduleType !== CORE_MODULE_TYPE || !allowed.includes(payload.moduleName)) {
    throw new Error(`[AUTH MODULE] ${eventName} => invalid core payload.`);
  }
}

/** ==================== Refresh Token Storage (DB-agnostic) ==================== **/
function storeRefreshTokenInDB(userId, refreshToken, expiresAt, callback) {
  motherEmitter.emit(
    'dbInsert',
    {
      moduleName: 'authModule',
      table: 'refresh_tokens',
      data: {
        user_id: userId,
        token_value: refreshToken,
        created_at: new Date().toISOString(),
        expires_at: expiresAt
      }
    },
    callback
  );
}

function getRefreshTokenFromDB(refreshToken, callback) {
  motherEmitter.emit(
    'dbSelect',
    {
      moduleName: 'authModule',
      table: 'refresh_tokens',
      where: { token_value: refreshToken }
    },
    callback
  );
}

function removeRefreshToken(refreshToken, callback) {
  motherEmitter.emit(
    'dbDelete',
    {
      moduleName: 'authModule',
      table: 'refresh_tokens',
      where: { token_value: refreshToken }
    },
    callback
  );
}

/** ==================== meltdown event listeners for the Auth Module ==================== **/
function setupEventListeners({ motherEmitter, JWT_SECRET }) {
  console.log('[AUTH MODULE] Setting up meltdown events...like a boss.');

  // A) setModuleTokenExpiry
  motherEmitter.on('setModuleTokenExpiry', (payload, cb) => {
    const callback = onceCallback(cb); // ensure 1 single response
    try {
      assertCorePayloadFrom(payload, 'setModuleTokenExpiry', AUTH_MODULE_NAME);
    } catch (err) {
      return callback(err);
    }
    const { targetModuleName, expiryString } = payload || {};
    if (!targetModuleName || !expiryString) {
      return callback(new Error('Missing targetModuleName or expiryString'));
    }
    moduleExpiryOverrides[targetModuleName] = expiryString;
    console.log(`[AUTH MODULE] Overrode token expiry for module '${targetModuleName}' => ${expiryString}`);
    callback(null, { success: true, expiry: expiryString });
  });

  // B) setUserTokenExpiry
  motherEmitter.on('setUserTokenExpiry', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      assertCorePayloadFrom(payload, 'setUserTokenExpiry', AUTH_MODULE_NAME);
    } catch (err) {
      return callback(err);
    }
    const { role, expiryString } = payload || {};
    if (!role || !expiryString) {
      return callback(new Error('Missing role or expiryString'));
    }
    userExpiryOverrides[role] = expiryString;
    console.log(`[AUTH MODULE] Overrode token expiry for user role '${role}' => ${expiryString}`);
    callback(null, { success: true, expiry: expiryString });
  });

  // C) issueModuleToken
  motherEmitter.on('issueModuleToken', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      assertInternalAuthPayload(payload, 'issueModuleToken');
      const { moduleName, trustLevel, authModuleSecret, signAsModule } = payload || {};
      const actualModuleName = signAsModule || moduleName;
      const jti = crypto.randomBytes(16).toString('hex');
      const expiresIn = getModuleExpiry(actualModuleName, trustLevel);
      const finalSecret = combineSecretWithSalt(JWT_SECRET, trustLevel);

      const signPayload = {
        moduleName: actualModuleName,
        trustLevel,
        jti
      };

      // High-trust modules need broad access. Grant wildcard permissions
      // so they can perform initialization tasks without being locked out
      // by permission checks in other core modules.
      if (trustLevel === 'high') {
        signPayload.permissions = { '*': true };
      }

      const token = jwt.sign(signPayload, finalSecret, { expiresIn });
      console.log(`[AUTH MODULE] issueModuleToken => meltdown sees moduleName='${moduleName}', signed as='${actualModuleName}', jti=${jti}`);
      callback(null, token);
    } catch (err) {
      console.error('[AUTH MODULE] Error issuing module token:', err.message);
      callback(err);
    }
  });

  // D) issueUserToken
  motherEmitter.on('issueUserToken', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      assertInternalAuthPayload(payload, 'issueUserToken');
      const {
        skipJWT,
        authModuleSecret,
        moduleName,
        moduleType,
        userId,
        role,
        userTokenLifetime,
        // custom perms
        customPermissions,
        customRoles
      } = payload || {};

      motherEmitter.emit(
        'issueModuleToken',
        {
          skipJWT: true,
          authModuleSecret: authModuleSecret,
          moduleName: 'auth',
          moduleType: 'core',
          trustLevel: 'high',
          signAsModule: 'userManagement'
        },
        (modErr, userMgmtToken) => {
          if (modErr) {
            console.error('[AUTH MODULE] issueUserToken => subcall => issueModuleToken failed =>', modErr.message);
            return callback(modErr);
          }

          motherEmitter.emit(
            'getUserDetailsById',
            {
              jwt: userMgmtToken,
              moduleName: 'userManagement',
              moduleType: 'core',
              userId
            },
            (err, userObj) => {
              if (err) return callback(err);
              if (!userObj) {
                return callback(new Error(`User not found => id=${userId}`));
              }

              const finalRole = role || userObj.role || 'user';
              const trustLevel = mapRoleToTrustLevel(finalRole);
              let expiresIn = getUserExpiry(finalRole, trustLevel);
              if (userTokenLifetime) {
                expiresIn = userTokenLifetime;
              }

              const jti = crypto.randomBytes(16).toString('hex');
              const tokenVersion = userObj.token_version || 0;

              const signPayload = {
                userId,
                role: finalRole,
                trustLevel,
                isUser: true,
                jti,
                tokenVersion
              };

              signPayload.permissions = {};
              if (finalRole === 'admin') {
                signPayload.permissions['*'] = true;
              }
              if (customPermissions) {
                Object.assign(signPayload.permissions, customPermissions);
              }
              if (customRoles) {
                signPayload.roles = customRoles;
              }

              const finalSecret = combineSecretWithSalt(JWT_SECRET, trustLevel);
              const userToken = jwt.sign(signPayload, finalSecret, { expiresIn });

              console.log(`[AUTH MODULE] issueUserToken => userId=${userId}, version=${tokenVersion}, jti=${jti}`);
              if (!userToJtiMapping[userId]) {
                userToJtiMapping[userId] = [];
              }
              userToJtiMapping[userId].push(jti);

              callback(null, userToken);
            }
          );
        }
      );
    } catch (ex) {
      console.error('[AUTH MODULE] issueUserToken => meltdown meltdown =>', ex.message);
      callback(ex);
    }
  });

  // E) issuePublicToken
  motherEmitter.on('issuePublicToken', (payload, cb) => {
    const callback = onceCallback(cb);
    try {


      const jti = crypto.randomBytes(16).toString('hex');
      const trustLevel = 'low';
      const finalSecret = combineSecretWithSalt(JWT_SECRET, trustLevel);
      const expiresIn = '1h';

      const { purpose } = payload || {};
      const signPayload = {
        jti,
        trustLevel,
        isPublic: true,
        purpose: purpose || 'public'
      };
      const token = jwt.sign(signPayload, finalSecret, { expiresIn });
      console.log(`[AUTH MODULE] issuePublicToken => purpose=${purpose}, jti=${jti}`);
      callback(null, token);
    } catch (err) {
      console.error('[AUTH MODULE] issuePublicToken => meltdown meltdown =>', err.message);
      callback(err);
    }
  });

  // E2) ensurePublicToken – return a valid public token, refreshing if needed
  motherEmitter.on('ensurePublicToken', (payload, cb) => {
    const callback = onceCallback(cb);
    let current = global.pagesPublicToken;
    let needsRefresh = true;
    if (current) {
      try {
        const decoded = jwt.verify(
          current,
          combineSecretWithSalt(JWT_SECRET, 'low')
        );
        if (decoded && decoded.exp * 1000 > Date.now()) {
          needsRefresh = false;
        }
      } catch (_) {
        needsRefresh = true;
      }
    }

    if (!current || needsRefresh) {
      motherEmitter.emit(
        'issuePublicToken',
        { purpose: 'public', moduleName: 'auth' },
        (err, newTok) => {
          if (err) return callback(err);
          global.pagesPublicToken = newTok;
          callback(null, newTok);
        }
      );
    } else {
      callback(null, current);

    }
  });

  // F) validateToken
  motherEmitter.on('validateToken', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      assertCorePayloadFrom(payload, 'validateToken', AUTH_MODULE_NAME);
    } catch (err) {
      return callback(err);
    }
    const { tokenToValidate } = payload || {};
    if (!tokenToValidate) {
      return callback(new Error('No tokenToValidate provided. You had one job.'));
    }

    let decodedUnverified = jwt.decode(tokenToValidate) || { trustLevel: 'low' };
    if (!decodedUnverified.trustLevel) decodedUnverified.trustLevel = 'low';

    const finalSecret = combineSecretWithSalt(JWT_SECRET, decodedUnverified.trustLevel);
    try {
      const decodedVerified = jwt.verify(tokenToValidate, finalSecret);

      // oh dear, did we revoke it?
      if (decodedVerified.jti && revokedTokens.has(decodedVerified.jti)) {
        return callback(new Error('Token has been revoked, sorry!'));
      }

      if (decodedVerified.isUser && decodedVerified.userId) {
        // Auth owns token validation, so the account/version lookup must not
        // depend on the permissions carried by the token being validated.
        motherEmitter.emit(
          'issueModuleToken',
          {
            skipJWT: true,
            authModuleSecret: process.env.AUTH_MODULE_INTERNAL_SECRET,
            moduleName: 'auth',
            moduleType: 'core',
            trustLevel: 'high',
            signAsModule: 'userManagement'
          },
          (tokenErr, userMgmtToken) => {
            if (tokenErr) return callback(tokenErr);
            motherEmitter.emit(
              'getUserDetailsById',
              {
                jwt: userMgmtToken,
                moduleName: 'userManagement',
                moduleType: 'core',
                userId: decodedVerified.userId
              },
              (err, userObj) => {
                if (err) return callback(err);
                if (!userObj) return callback(new Error('User not found => token invalid?'));

                const dbVersion = userObj.token_version || 0;
                if (dbVersion !== decodedVerified.tokenVersion) {
                  return callback(new Error('Token version mismatch => user roles changed => token invalid'));
                }
                callback(null, decodedVerified);
              }
            );
          }
        );
      } else {
        // presumably a module token or public token
        return callback(null, decodedVerified);
      }
    } catch (verifyErr) {
      console.error('[AUTH MODULE] validateToken => invalid meltdown =>', verifyErr.message);
      return callback(verifyErr);
    }
  });

  // G) revokeToken
  motherEmitter.on('revokeToken', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      assertCorePayloadFrom(payload, 'revokeToken', AUTH_MODULE_NAME);
    } catch (err) {
      return callback(err);
    }
    const { jti } = payload || {};
    if (!jti) {
      return callback(new Error('Missing jti. Ehm, how do you plan to revoke it exactly?'));
    }
    revokedTokens.add(jti);
    console.log(`[AUTH MODULE] Token with jti=${jti} is now revoked. Begone, vile credential!`);
    callback(null, { success: true });
  });

  // H) revokeAllTokensForUser
  motherEmitter.on('revokeAllTokensForUser', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      assertCorePayloadFrom(payload, 'revokeAllTokensForUser', [
        AUTH_MODULE_NAME,
        USER_MANAGEMENT_MODULE_NAME
      ]);
    } catch (err) {
      return callback(err);
    }
    const { userId } = payload || {};
    if (!userId) {
      return callback(new Error('Missing userId. Are you trying to revoke the entire universe?'));
    }
    const jtiList = userToJtiMapping[userId] || [];
    jtiList.forEach(jti => revokedTokens.add(jti));
    userToJtiMapping[userId] = [];
    console.log('[AUTH MODULE] All tokens for userId=%s are now revoked =>', userId, jtiList);
    callback(null, { success: true, count: jtiList.length });
  });

  // I) Refresh Token meltdown events
  motherEmitter.on('issueRefreshToken', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      assertCorePayloadFrom(payload, 'issueRefreshToken', AUTH_MODULE_NAME);
      const { userId } = payload || {};
      if (!userId) {
        return callback(new Error('Missing userId. We can’t refresh for user 0.'));
      }
      const refreshToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      storeRefreshTokenInDB(userId, refreshToken, expiresAt, (err) => {
        if (err) return callback(err);
        callback(null, refreshToken);
      });
    } catch (ex) {
      callback(ex);
    }
  });

  motherEmitter.on('refreshAccessToken', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      assertCorePayloadFrom(payload, 'refreshAccessToken', AUTH_MODULE_NAME);
    } catch (err) {
      return callback(err);
    }
    const { refreshToken } = payload || {};
    if (!refreshToken) {
      return callback(new Error('No refreshToken provided'));
    }
    getRefreshTokenFromDB(refreshToken, (dbErr, row) => {
      if (dbErr) return callback(dbErr);
      if (!row) return callback(new Error('Invalid refreshToken'));

      const now = new Date();
      if (now > row.expires_at) {
        removeRefreshToken(refreshToken, () => {});
        return callback(new Error('Refresh token expired – time to re-login, buddy.'));
      }

      motherEmitter.emit(
        'getUserDetailsById',
        {
          jwt: 'skip-check',
          moduleName: 'userManagement',
          moduleType: 'core',
          userId: row.user_id
        },
        (uErr, userObj) => {
          if (uErr) return callback(uErr);
          if (!userObj) return callback(new Error('User not found => cannot refresh.'));

          motherEmitter.emit(
            'issueUserToken',
            {
              skipJWT: true,
              moduleName: 'auth',
              moduleType: 'core',
              authModuleSecret: process.env.AUTH_MODULE_INTERNAL_SECRET,
              userId: userObj.id,
              role: userObj.role
            },
            (tokenErr, newAccessToken) => {
              if (tokenErr) return callback(tokenErr);
              callback(null, { accessToken: newAccessToken });
            }
          );
        }
      );
    });
  });

  motherEmitter.on('revokeRefreshToken', (payload, cb) => {
    const callback = onceCallback(cb);
    try {
      assertCorePayloadFrom(payload, 'revokeRefreshToken', AUTH_MODULE_NAME);
    } catch (err) {
      return callback(err);
    }
    const { refreshToken } = payload || {};
    if (!refreshToken) {
      return callback(new Error('Missing refreshToken. You gotta tell me which token to revoke, buddy.'));
    }
    removeRefreshToken(refreshToken, (err) => {
      if (err) return callback(err);
      callback(null, { success: true });
    });
  });
}

module.exports = {
  setupEventListeners
};
