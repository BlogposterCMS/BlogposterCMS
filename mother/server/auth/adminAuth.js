'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const { sanitizeCookieName, sanitizeCookiePath } = require('../../utils/cookieUtils');
const {
  canUseDevAutologin,
  resolveDevAutologinUser
} = require('../../modules/auth/devAutoLogin');
const { traceRuntimeEvent } = require('../../utils/runtimeLogging');

function createAdminAuthContext({ motherEmitter, authModuleSecret, isProduction }) {
  async function issueAppLoaderJwt() {
    return requestBackendEvent(motherEmitter, BACKEND_EVENTS.ISSUE_MODULE_TOKEN, {
          skipJWT: true,
          authModuleSecret,
          moduleType: 'core',
          moduleName: 'auth',
          signAsModule: 'appLoader',
          trustLevel: 'high'
        });
  }

  async function dispatchAppLoaderEvent(_baseJwt, decodedJWT, eventName, data = {}) {
    const jwt = await issueAppLoaderJwt();
    return requestBackendEvent(motherEmitter, eventName, {
          jwt,
          moduleName: 'appLoader',
          moduleType: 'core',
          decodedJWT,
          ...data
        });
  }

  function validateAdminToken(token) {
    if (!token) return Promise.reject(new Error('Missing token'));
    return requestBackendEvent(motherEmitter, BACKEND_EVENTS.VALIDATE_TOKEN, {
      skipJWT: true,
      authModuleSecret,
      jwt: token,
      moduleName: 'auth',
      moduleType: 'core',
      tokenToValidate: token
    });
  }

  function isHttpAdminPrincipal(decoded) {
    return Boolean(decoded && decoded.isUser === true && decoded.isPublic !== true);
  }

  async function isDevAutoLoginAllowed() {
    const localDevMode = process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production';
    const devAuto = localDevMode && process.env.DEV_AUTOLOGIN !== 'false';
    if (!devAuto) return false;
    try {
      const moduleToken = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.ISSUE_MODULE_TOKEN, {
            skipJWT: true,
            authModuleSecret,
            moduleType: 'core',
            moduleName: 'auth',
            signAsModule: 'userManagement',
            trustLevel: 'high'
          });
      const devUser = process.env.DEV_USER || 'admin';
      const user = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_USER_DETAILS_BY_USERNAME, { jwt: moduleToken, moduleName: 'userManagement', moduleType: 'core', username: devUser });
      return Boolean(user);
    } catch {
      return false;
    }
  }

  async function maybeIssueDevAdminSession(req, res, contextLabel = 'admin') {
    if (!canUseDevAutologin(req)) return null;

    try {
      const user = await resolveDevAutologinUser({
        motherEmitter,
        authModuleSecret,
        devUser: process.env.DEV_USER || 'admin'
      });

      res.cookie(sanitizeCookieName('admin_jwt'), user.jwt, {
        path: sanitizeCookiePath('/'),
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction,
        maxAge: 2 * 60 * 60 * 1000
      });

      traceRuntimeEvent(
        `[DEV AUTOLOGIN] ${contextLabel} => issued local admin session for "${process.env.DEV_USER || 'admin'}".`
      );
      return user.jwt;
    } catch (err) {
      console.warn(`[DEV AUTOLOGIN] ${contextLabel} => ${err.code || 'AUTH_DEV_AUTOLOGIN_FAILED'}: ${err.message}`);
      return null;
    }
  }

  return {
    dispatchAppLoaderEvent,
    isDevAutoLoginAllowed,
    isHttpAdminPrincipal,
    maybeIssueDevAdminSession,
    validateAdminToken
  };
}

module.exports = {
  createAdminAuthContext
};
