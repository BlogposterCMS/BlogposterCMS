/**
 * mother/modules/auth/strategies/google.js
 *
 * Provides a Google OAuth login strategy using Google's tokeninfo endpoint,
 * then finalizes login (roles + JWT).
 */

const axios = require('axios');

module.exports = {
  async initialize({ motherEmitter, JWT_SECRET, authModuleSecret }) {
    console.log('[GOOGLE STRATEGY] Initializing Google login strategy...');

    motherEmitter.emit(
      'registerLoginStrategy',
      {
        skipJWT         : true,
        moduleType      : 'core',
        moduleName      : 'auth',
        authModuleSecret: authModuleSecret,
        strategyName    : 'google',
        description     : 'Google OAuth login (configured via admin settings)',
        scope           : 'public',

        loginFunction: async (googleToken, callback) => {
          try {
            if (!global.settings || !global.settings.GOOGLE_CLIENT_ID) {
              return callback(new Error('Google client ID not configured'));
            }

            // 1) Validate googleToken using Google's tokeninfo endpoint
            const response = await axios.get(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${googleToken}`);
            const payload  = response.data;

            if (payload.aud !== global.settings.GOOGLE_CLIENT_ID) {
              return callback(new Error('Invalid Google token: client ID mismatch'));
            }

            // 2) meltdown => issueModuleToken => so we can talk to userManagement
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
                  console.error('[GOOGLE STRATEGY] issueModuleToken =>', modErr.message);
                  return callback(modErr);
                }

                // 3) Find or create user in DB with google_id = payload.sub
                motherEmitter.emit(
                  'dbSelect',
                  {
                    jwt       : userMgmtToken,
                    moduleName: 'userManagement',
                    table     : 'users',
                    where     : { google_id: payload.sub }
                  },
                  (selectErr, rows) => {
                    if (selectErr) return callback(selectErr);

                    if (!rows || rows.length === 0) {
                      // user not found => create
                      motherEmitter.emit(
                        'dbInsert',
                        {
                          jwt       : userMgmtToken,
                          moduleName: 'userManagement',
                          table     : 'users',
                          data      : {
                            username   : `google_${payload.sub}`,
                            google_id  : payload.sub,
                            email      : payload.email || null,
                            full_name  : payload.name  || null,
                            created_at : new Date().toISOString(),
                            updated_at : new Date().toISOString()
                          }
                        },
                        (insertErr, newUser) => {
                          if (insertErr) return callback(insertErr);
                          doFinalize(newUser.id);
                        }
                      );
                    } else {
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
                        provider : 'google',
                        googleId : payload.sub,
                        picture  : payload.picture || null
                      }
                    },
                    (finalErr, finalUserObj) => {
                      if (finalErr) {
                        console.error('[GOOGLE STRATEGY] finalizeUserLogin =>', finalErr.message);
                        return callback(finalErr);
                      }
                      return callback(null, finalUserObj);
                    }
                  );
                }
              }
            );
          } catch (error) {
            console.error('[GOOGLE STRATEGY] Error validating Google token:', error.message);
            callback(error);
          }
        },
      },
      (err, success) => {
        if (err) {
          console.error('[GOOGLE STRATEGY] Failed to register strategy:', err.message);
        } else {
          console.log('[GOOGLE STRATEGY] Strategy "google" registered successfully.');
        }
      }
    );
  }
};
