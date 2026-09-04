

const { requestBackendEvent } = require('../../../contracts/backendEventContracts');

const { BACKEND_EVENTS } = require('../../../contracts/generatedBackendEventCatalog');

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

    requestBackendEvent(motherEmitter, BACKEND_EVENTS.REGISTER_LOGIN_STRATEGY, {
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
            requestBackendEvent(motherEmitter, BACKEND_EVENTS.ISSUE_MODULE_TOKEN, {
                skipJWT         : true,
                authModuleSecret: authModuleSecret,
                moduleType      : 'core',
                moduleName      : 'auth',
                signAsModule    : 'userManagement',
                trustLevel      : 'high'
              }).then(userMgmtToken => {
  // 3) Find or create user in DB with google_id = payload.sub
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt: userMgmtToken,
    moduleName: 'userManagement',
    table: 'users',
    where: {
      google_id: payload.sub
    }
  }).then(rows => {
    if (!rows || rows.length === 0) {
      // user not found => create
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_INSERT, {
        jwt: userMgmtToken,
        moduleName: 'userManagement',
        table: 'users',
        data: {
          username: `google_${payload.sub}`,
          google_id: payload.sub,
          email: payload.email || null,
          full_name: payload.name || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      }).then(newUser => {
        doFinalize(newUser.id);
      }, insertErr => {
        return callback(insertErr);
      });
    } else {
      doFinalize(rows[0].id);
    }
  }, selectErr => {
    return callback(selectErr);
  });
  function doFinalize(dbUserId) {
    // meltdown => finalizeUserLogin => merges roles, issues JWT
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.FINALIZE_USER_LOGIN, {
      jwt: userMgmtToken,
      moduleName: 'userManagement',
      moduleType: 'core',
      userId: dbUserId,
      extraData: {
        provider: 'google',
        googleId: payload.sub,
        picture: payload.picture || null
      }
    }).then(finalUserObj => {
      return callback(null, finalUserObj);
    }, finalErr => {
      console.error('[GOOGLE STRATEGY] finalizeUserLogin =>', finalErr.message);
      return callback(finalErr);
    });
  }
}, modErr => {
  console.error('[GOOGLE STRATEGY] issueModuleToken =>', modErr.message);
  return callback(modErr);
});
          } catch (error) {
            console.error('[GOOGLE STRATEGY] Error validating Google token:', error.message);
            callback(error);
          }
        },
      }).then(success => {
  console.log('[GOOGLE STRATEGY] Strategy "google" registered successfully.');
}, err => {
  console.error('[GOOGLE STRATEGY] Failed to register strategy:', err.message);
});
  }
};
