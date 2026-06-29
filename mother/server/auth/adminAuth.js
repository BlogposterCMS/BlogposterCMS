'use strict';

const { sanitizeCookieName, sanitizeCookiePath } = require('../../utils/cookieUtils');
const {
  canUseDevAutologin,
  resolveDevAutologinUser
} = require('../../modules/auth/devAutoLogin');

function createAdminAuthContext({ motherEmitter, authModuleSecret, isProduction }) {
  async function issueAppLoaderJwt() {
    return new Promise((resolve, reject) => {
      motherEmitter.emit(
        'issueModuleToken',
        {
          skipJWT: true,
          authModuleSecret,
          moduleType: 'core',
          moduleName: 'auth',
          signAsModule: 'appLoader',
          trustLevel: 'high'
        },
        (err, token) => (err ? reject(err) : resolve(token))
      );
    });
  }

  async function dispatchAppLoaderEvent(_baseJwt, decodedJWT, eventName, data = {}) {
    const jwt = await issueAppLoaderJwt();
    return new Promise((resolve, reject) => {
      motherEmitter.emit(
        eventName,
        {
          jwt,
          moduleName: 'appLoader',
          moduleType: 'core',
          decodedJWT,
          ...data
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });
  }

  function validateAdminToken(token) {
    return new Promise((resolve, reject) => {
      if (!token) return reject(new Error('Missing token'));
      motherEmitter.emit(
        'validateToken',
        {
          skipJWT: true,
          authModuleSecret,
          jwt: token,
          moduleName: 'auth',
          moduleType: 'core',
          tokenToValidate: token
        },
        (err, decoded) => (err ? reject(err) : resolve(decoded))
      );
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
      const moduleToken = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'issueModuleToken',
          {
            skipJWT: true,
            authModuleSecret,
            moduleType: 'core',
            moduleName: 'auth',
            signAsModule: 'userManagement',
            trustLevel: 'high'
          },
          (err, token) => (err ? reject(err) : resolve(token))
        );
      });
      const devUser = process.env.DEV_USER || 'admin';
      const user = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'getUserDetailsByUsername',
          { jwt: moduleToken, moduleName: 'userManagement', moduleType: 'core', username: devUser },
          (err, result) => (err ? reject(err) : resolve(result))
        );
      });
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

      console.log(`[DEV AUTOLOGIN] ${contextLabel} => issued local admin session for "${process.env.DEV_USER || 'admin'}".`);
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
