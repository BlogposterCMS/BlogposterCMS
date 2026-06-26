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
    motherEmitter.emit(
      'registerLoginStrategy',
      {
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
            motherEmitter.emit(
              'issueModuleToken',
              {
                skipJWT         : true,
                authModuleSecret: authModuleSecret,
                moduleType      : 'core',
                moduleName      : 'auth',
                signAsModule    : 'userManagement',
                trustLevel      : 'high'
              },
              (tokenErr, userManagementToken) => {
                if (tokenErr) {
                  console.error('[ADMIN LOCAL STRATEGY] userManagement token error =>', tokenErr.message);
                  return callback(tokenErr);
                }

                // meltdown => userLogin => check username/password in userManagement
                motherEmitter.emit(
                  'userLogin',
                  {
                    jwt       : userManagementToken,
                    moduleType: 'core',
                    moduleName: 'userManagement',
                    username,
                    password
                  },
                  (err, userObj) => {
                    if (err) {
                      console.error('[ADMIN LOCAL STRATEGY] userLogin meltdown error =>', err.message);
                      return callback(err);
                    }
                    if (!userObj) {
                      // userObj===null => invalid credentials
                      return callback(null, null);
                    }

                    // meltdown => finalizeUserLogin => merges roles & JSON permissions
                    motherEmitter.emit(
                      'finalizeUserLogin',
                      {
                        jwt       : userManagementToken,
                        moduleName: 'userManagement',
                        moduleType: 'core',
                        userId    : userObj.id,
                        extraData : { provider: 'adminLocal' }
                      },
                      (finalErr, finalUserObj) => {
                        if (finalErr) {
                          console.error('[ADMIN LOCAL STRATEGY] finalizeUserLogin meltdown error =>', finalErr.message);
                          return callback(finalErr);
                        }

                        // finalUserObj now has .permissions, .role, .email, etc.
                        return callback(null, finalUserObj);
                      }
                    );
                  }
                );
              }
            );
          } catch (ex) {
            console.error('[ADMIN LOCAL STRATEGY] loginFunction => oh dear =>', ex.message);
            callback(ex);
          }
        }
      },
      (err, success) => {
        // final meltdown callback for registerLoginStrategy
        if (err) {
          console.error('[ADMIN LOCAL STRATEGY] Failed to register =>', err.message);
        } else {
          console.log('[ADMIN LOCAL STRATEGY] Strategy "adminLocal" registered successfully.');
        }
      }
    );
  }
};
