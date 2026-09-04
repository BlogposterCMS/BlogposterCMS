

const { requestBackendEvent } = require('../../../contracts/backendEventContracts');

const { BACKEND_EVENTS } = require('../../../contracts/generatedBackendEventCatalog');

/**
 * mother/modules/auth/strategies/adminLocal.js
 *
 * Provides a local admin login strategy that checks username/password
 * against the "userManagement" module, then finalizes login (roles + permissions).
 */
module.exports = {
  initialize({ motherEmitter, JWT_SECRET, authModuleSecret }) {
    console.log('[ADMIN LOCAL STRATEGY] Initializing "adminLocal" login strategy... because local logins are oh so fancy.');

    // meltdown => registerLoginStrategy with skipJWT, because we’re the "auth" module. #privileged
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.REGISTER_LOGIN_STRATEGY, {
        skipJWT         : true,
        moduleType      : 'core',
        moduleName      : 'auth', // meltdown sees "auth" => skipJWT is allowed
        authModuleSecret: authModuleSecret,
        strategyName    : 'adminLocal',
        description     : 'Local admin username/password for userManagement',
        scope           : 'admin',

        // This function does the actual local user/pw check
        loginFunction: async (loginPayload, callback) => {
          try {
            const { username, password } = loginPayload || {};
            if (!username || !password) {
              return callback(new Error('Missing username or password. Try again, mortal.'));
            }

            // meltdown => issueModuleToken => obtains a high-trust token for "userManagement"
            requestBackendEvent(motherEmitter, BACKEND_EVENTS.ISSUE_MODULE_TOKEN, {
                skipJWT         : true,
                authModuleSecret: authModuleSecret,
                moduleType      : 'core',
                moduleName      : 'auth',
                signAsModule    : 'userManagement',
                trustLevel      : 'high'
              }).then(userManagementToken => {
  // meltdown => userLogin => check username/password in userManagement
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.USER_LOGIN, {
    jwt: userManagementToken,
    moduleType: 'core',
    moduleName: 'userManagement',
    username,
    password
  }).then(userObj => {
    if (!userObj) {
      // userObj===null => invalid credentials
      return callback(null, null);
    }
    // meltdown => finalizeUserLogin => merges roles & JSON permissions
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.FINALIZE_USER_LOGIN, {
      jwt: userManagementToken,
      moduleName: 'userManagement',
      moduleType: 'core',
      userId: userObj.id,
      extraData: {
        provider: 'adminLocal'
      }
    }).then(finalUserObj => {
      // finalUserObj now has .permissions, .role, .email, etc.
      return callback(null, finalUserObj);
    }, finalErr => {
      console.error('[ADMIN LOCAL STRATEGY] finalizeUserLogin meltdown error =>', finalErr.message);
      return callback(finalErr);
    });
  }, err => {
    console.error('[ADMIN LOCAL STRATEGY] userLogin meltdown error =>', err.message);
    return callback(err);
  });
}, tokenErr => {
  console.error('[ADMIN LOCAL STRATEGY] userManagement token error =>', tokenErr.message);
  return callback(tokenErr);
});
          } catch (ex) {
            console.error('[ADMIN LOCAL STRATEGY] loginFunction => oh dear =>', ex.message);
            callback(ex);
          }
        }
      }).then(success => {
  console.log('[ADMIN LOCAL STRATEGY] Strategy "adminLocal" registered successfully.');
}, err => {
  console.error('[ADMIN LOCAL STRATEGY] Failed to register =>', err.message);
});
  }
};
