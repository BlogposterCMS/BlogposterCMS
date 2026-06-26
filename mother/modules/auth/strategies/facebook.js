/**
 * mother/modules/auth/strategies/facebook.js
 *
 * Provides a Facebook OAuth login strategy using the Facebook Graph API,
 * then finalizes login (roles + JWT).
 */

const axios = require('axios');

module.exports = {
  async initialize({ motherEmitter, JWT_SECRET, authModuleSecret }) {
    console.log('[FACEBOOK STRATEGY] Initializing Facebook login strategy...');

    motherEmitter.emit(
      'registerLoginStrategy',
      {
        skipJWT         : true,
        moduleType      : 'core',
        moduleName      : 'auth',
        authModuleSecret: authModuleSecret,
        strategyName    : 'facebook',
        description     : 'Facebook OAuth login (configured via admin settings)',
        scope           : 'public',

        // Called during actual login flow
        loginFunction: async (facebookToken, callback) => {
          try {
            if (
              !global.settings ||
              !global.settings.FACEBOOK_APP_ID ||
              !global.settings.FACEBOOK_APP_SECRET
            ) {
              return callback(new Error('Facebook app configuration not set'));
            }

            // 1) Validate the facebookToken using Facebook's debug_token endpoint
            const appToken  = `${global.settings.FACEBOOK_APP_ID}|${global.settings.FACEBOOK_APP_SECRET}`;
            const debugUrl  = `https://graph.facebook.com/debug_token?input_token=${facebookToken}&access_token=${appToken}`;
            const debugResp = await axios.get(debugUrl);
            const debugData = debugResp.data.data;

            if (!debugData.is_valid) {
              return callback(new Error('Invalid Facebook token'));
            }
            if (debugData.app_id !== global.settings.FACEBOOK_APP_ID) {
              return callback(new Error('Facebook token app_id mismatch'));
            }

            // 2) Fetch basic user details from the Graph API
            const userResponse = await axios.get(
              `https://graph.facebook.com/me?access_token=${facebookToken}&fields=id,name,email,picture`
            );
            const userData = userResponse.data;
            // { id, name, email, picture: { data: { url: '...' } } }

            // 3) meltdown => issueModuleToken => so we can talk to userManagement
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
              (modErr, userMgmtToken) => {
                if (modErr) {
                  console.error('[FACEBOOK STRATEGY] issueModuleToken =>', modErr.message);
                  return callback(modErr);
                }

                // 4) Try to find or create a local user with "facebook_id = userData.id"
                motherEmitter.emit(
                  'dbSelect',
                  {
                    jwt       : userMgmtToken,
                    moduleName: 'userManagement',
                    table     : 'users',
                    where     : { facebook_id: userData.id }
                  },
                  (selErr, rows) => {
                    if (selErr) return callback(selErr);

                    if (!rows || rows.length === 0) {
                      // not found => create new user
                      motherEmitter.emit(
                        'dbInsert',
                        {
                          jwt       : userMgmtToken,
                          moduleName: 'userManagement',
                          table     : 'users',
                          data      : {
                            username   : `fb_${userData.id}`,
                            facebook_id: userData.id,
                            email      : userData.email || null,
                            full_name  : userData.name  || null,
                            created_at : new Date().toISOString(),
                            updated_at : new Date().toISOString()
                          }
                        },
                        (insertErr, newUser) => {
                          if (insertErr) return callback(insertErr);

                          // finalize login
                          doFinalize(newUser.id);
                        }
                      );
                    } else {
                      // user found
                      doFinalize(rows[0].id);
                    }
                  }
                );

                function doFinalize(dbUserId) {
                  // meltdown => finalizeUserLogin => merges roles, issues JWT
                  motherEmitter.emit(
                    'finalizeUserLogin',
                    {
                      jwt       : userMgmtToken,
                      moduleName: 'userManagement',
                      moduleType: 'core',
                      userId    : dbUserId,
                      extraData : {
                        provider   : 'facebook',
                        facebookId : userData.id,
                        picture    : (userData.picture && userData.picture.data && userData.picture.data.url) || null
                      }
                    },
                    (finalErr, finalUserObj) => {
                      if (finalErr) {
                        console.error('[FACEBOOK STRATEGY] finalizeUserLogin =>', finalErr.message);
                        return callback(finalErr);
                      }
                      return callback(null, finalUserObj);
                    }
                  );
                }
              }
            );
          } catch (error) {
            console.error('[FACEBOOK STRATEGY] Error validating Facebook token:', error.message);
            callback(error);
          }
        },
      },
      (err, success) => {
        if (err) {
          console.error('[FACEBOOK STRATEGY] Failed to register strategy:', err.message);
        } else {
          console.log('[FACEBOOK STRATEGY] Strategy "facebook" registered successfully.');
        }
      }
    );
  }
};
