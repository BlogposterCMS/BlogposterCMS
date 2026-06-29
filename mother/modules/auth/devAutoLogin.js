require('dotenv').config();

const AUTH_DEV_AUTOLOGIN_ERRORS = {
  EMITTER_MISSING: 'AUTH_DEV_AUTOLOGIN_EMITTER_MISSING',
  SECRET_MISSING: 'AUTH_DEV_AUTOLOGIN_SECRET_MISSING',
  USER_NOT_FOUND: 'AUTH_DEV_AUTOLOGIN_USER_NOT_FOUND',
  TOKEN_MISSING: 'AUTH_DEV_AUTOLOGIN_TOKEN_MISSING'
};

function codedError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function isLoopbackAddress(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;

  return normalized === 'localhost'
      || normalized === '::1'
      || normalized === '0:0:0:0:0:0:0:1'
      || normalized === '127.0.0.1'
      || normalized.startsWith('127.')
      || normalized.startsWith('::ffff:127.')
      || normalized === '::ffff:7f00:1';
}

function isLocalDevRequest(req) {
  return [
    req?.ip,
    req?.hostname,
    req?.socket?.remoteAddress,
    req?.connection?.remoteAddress
  ].some(isLoopbackAddress);
}

function isDevAutologinEnabled() {
  return process.env.NODE_ENV !== 'production'
      && process.env.APP_ENV !== 'production'
      && process.env.DEV_AUTOLOGIN !== 'false';
}

function isWeakCredentialOverrideEnabled() {
  return process.env.ALLOW_WEAK_CREDS === 'I_KNOW_THIS_IS_LOCAL';
}

function canUseWeakLocalDevCredentials(req) {
  const localDevMode = process.env.NODE_ENV !== 'production'
      && process.env.APP_ENV !== 'production';
  if (!localDevMode || !isLocalDevRequest(req)) return false;

  // Local setup uses admin/123 for speed, but production must never inherit it.
  return isDevAutologinEnabled() || isWeakCredentialOverrideEnabled();
}

function canUseDevAutologin(req) {
  return isDevAutologinEnabled()
      && isLocalDevRequest(req)
      && Boolean(process.env.AUTH_MODULE_INTERNAL_SECRET);
}

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

async function resolveDevAutologinUser({
  motherEmitter,
  authModuleSecret = process.env.AUTH_MODULE_INTERNAL_SECRET,
  devUser = process.env.DEV_USER || 'admin'
} = {}) {
  if (!motherEmitter || typeof motherEmitter.emit !== 'function') {
    throw codedError(AUTH_DEV_AUTOLOGIN_ERRORS.EMITTER_MISSING, 'motherEmitter is required.');
  }
  if (!authModuleSecret) {
    throw codedError(AUTH_DEV_AUTOLOGIN_ERRORS.SECRET_MISSING, 'AUTH_MODULE_INTERNAL_SECRET is required.');
  }

  const moduleToken = await emitAsync(motherEmitter, 'issueModuleToken', {
    skipJWT: true,
    authModuleSecret,
    moduleType: 'core',
    moduleName: 'auth',
    signAsModule: 'userManagement',
    trustLevel: 'high'
  });

  const user = await emitAsync(motherEmitter, 'getUserDetailsByUsername', {
    jwt: moduleToken,
    moduleName: 'userManagement',
    moduleType: 'core',
    username: devUser
  });

  if (!user?.id) {
    throw codedError(AUTH_DEV_AUTOLOGIN_ERRORS.USER_NOT_FOUND, `DEV_USER "${devUser}" was not found.`);
  }

  const finalUser = await emitAsync(motherEmitter, 'finalizeUserLogin', {
    jwt: moduleToken,
    moduleName: 'userManagement',
    moduleType: 'core',
    userId: user.id,
    extraData: { provider: 'devAutoLogin' }
  });

  if (!finalUser?.jwt) {
    throw codedError(AUTH_DEV_AUTOLOGIN_ERRORS.TOKEN_MISSING, 'finalizeUserLogin did not return a JWT.');
  }

  return finalUser;
}

module.exports = {
  AUTH_DEV_AUTOLOGIN_ERRORS,
  canUseDevAutologin,
  canUseWeakLocalDevCredentials,
  isDevAutologinEnabled,
  isLocalDevRequest,
  isLoopbackAddress,
  isWeakCredentialOverrideEnabled,
  resolveDevAutologinUser,
};
