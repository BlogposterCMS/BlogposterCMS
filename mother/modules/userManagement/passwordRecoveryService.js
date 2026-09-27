'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');
const { requestBackendEvent } = require('../../contracts/backendEventContracts');
const { getDbType } = require('../databaseManager/helpers/dbTypeHelpers');
const { loadRegistry } = require('../notificationManager/notificationManagerService');
const smtpIntegration = require('../notificationManager/integrations/smtp');

const TOKEN_LIFETIME_MS = 60 * 60 * 1000;
const GENERIC_MESSAGE = 'If this is an administrator account with a registered email address, a reset link will arrive shortly. If no email arrives, contact the site operator.';

function recoveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function userId(user) {
  return user?.id ?? user?._id;
}

function recoverySignature(payload, passwordHash, secret) {
  const key = crypto.createHmac('sha256', secret).update(`admin-password-recovery:${passwordHash}`).digest();
  return crypto.createHmac('sha256', key).update(payload).digest('base64url');
}

function createResetToken(user, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    id: String(userId(user)),
    expires: now + TOKEN_LIFETIME_MS,
    nonce: crypto.randomBytes(16).toString('base64url')
  })).toString('base64url');
  return `${payload}.${recoverySignature(payload, user.password, secret)}`;
}

function parseResetToken(token) {
  if (typeof token !== 'string' || token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw recoveryError('ADMIN_RESET_INVALID', 'This reset link is invalid or has expired. Request a new link.');
  }
  const [payload, signature] = token.split('.');
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw recoveryError('ADMIN_RESET_INVALID', 'This reset link is invalid or has expired. Request a new link.'); }
  if (!data || typeof data.id !== 'string' || !/^(\d+|[0-9a-fA-F]{24})$/.test(data.id) ||
      !Number.isSafeInteger(data.expires) || data.expires <= Date.now() ||
      data.expires > Date.now() + TOKEN_LIFETIME_MS || typeof data.nonce !== 'string' || data.nonce.length < 20) {
    throw recoveryError('ADMIN_RESET_INVALID', 'This reset link is invalid or has expired. Request a new link.');
  }
  return { ...data, payload, signature };
}

function assertTokenForUser(parsed, user, secret) {
  if (!user?.password || String(userId(user)) !== parsed.id) {
    throw recoveryError('ADMIN_RESET_INVALID', 'This reset link is invalid or has expired. Request a new link.');
  }
  const expected = Buffer.from(recoverySignature(parsed.payload, user.password, secret));
  const actual = Buffer.from(parsed.signature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw recoveryError('ADMIN_RESET_INVALID', 'This reset link is invalid or has expired. Request a new link.');
  }
}

function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256 ||
      !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw recoveryError('ADMIN_RESET_WEAK_PASSWORD', 'Use 12 to 256 characters, including uppercase, lowercase and a number.');
  }
}

function createPasswordRecoveryService({ motherEmitter, getUserManagementToken, secret, publicUrl, isProduction, loadMailRegistry = loadRegistry, initializeSmtp = smtpIntegration.initialize }) {
  let origin;
  try { origin = new URL(publicUrl).origin; } catch { origin = null; }

  function assertConfig() {
    if (typeof secret !== 'string' || secret.length < 64 || !origin || !/^https?:\/\//.test(origin) ||
        (isProduction && !origin.startsWith('https://'))) {
      throw recoveryError('ADMIN_RESET_CONFIG', 'Password recovery configuration is unavailable. Contact the site operator.');
    }
  }

  async function getUserById(id, jwt) {
    return requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_USER_DETAILS_BY_ID, {
      jwt, moduleName: 'userManagement', moduleType: 'core', userId: id
    });
  }

  async function isAdmin(user, jwt) {
    const roles = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_ROLES_FOR_USER, {
      jwt, moduleName: 'userManagement', moduleType: 'core', userId: userId(user)
    });
    return Array.isArray(roles) && roles.some(role => role.role_name === 'admin');
  }

  async function requestReset(email) {
    assertConfig();
    if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw recoveryError('ADMIN_RESET_EMAIL_INVALID', 'Enter a valid email address.');
    }
    const registry = loadMailRegistry();
    const smtp = registry.SMTP;
    if (!smtp?.active || !smtp.config?.host || !smtp.config?.user || !smtp.config?.pass ||
        smtp.config.host === 'smtp.myserver.com') {
      throw recoveryError('ADMIN_RESET_MAIL_UNAVAILABLE', 'Password recovery email is not configured. Contact the site operator.');
    }
    const jwt = await getUserManagementToken();
    const rows = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      jwt, moduleName: 'userManagement', moduleType: 'core', table: 'users', where: { email: email.trim() }
    });
    const user = rows?.[0];
    if (!user || !(await isAdmin(user, jwt))) return GENERIC_MESSAGE;

    const token = createResetToken(user, secret);
    const link = `${origin}/admin/reset-password?token=${encodeURIComponent(token)}`;
    // Mail transport latency must not reveal which addresses belong to admins.
    void (async () => {
      const transport = await initializeSmtp({ ...smtp.config, requireTLS: true });
      await transport.notify({
        recipient: user.email,
        subject: 'Reset your BlogposterCMS administrator password',
        message: `A password reset was requested for your administrator account. Open this link within one hour:\n${link}\n\nIf you did not request this, you can ignore this email.`,
        priority: 'info',
        timestamp: new Date().toISOString()
      });
    })().catch(error => {
      console.error('[ADMIN_RESET_MAIL_FAILED]', error.message);
    });
    return GENERIC_MESSAGE;
  }

  async function verifyToken(token) {
    assertConfig();
    const parsed = parseResetToken(token);
    const jwt = await getUserManagementToken();
    const user = await getUserById(parsed.id, jwt);
    assertTokenForUser(parsed, user, secret);
    if (!(await isAdmin(user, jwt))) {
      throw recoveryError('ADMIN_RESET_INVALID', 'This reset link is invalid or has expired. Request a new link.');
    }
    return { parsed, user, jwt };
  }

  async function resetPassword(token, newPassword) {
    validateNewPassword(newPassword);
    const { user, jwt } = await verifyToken(token);
    const idField = getDbType() === 'mongodb' ? '_id' : 'id';
    const updated = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      jwt, moduleName: 'userManagement', moduleType: 'core', table: 'users',
      where: { [idField]: userId(user), password: user.password },
      data: {
        password: await bcrypt.hash(newPassword + (process.env.USER_PASSWORD_SALT || ''), 10),
        token_version: { __raw_expr: 'token_version + 1' },
        updated_at: new Date().toISOString()
      }
    });
    const changed = Array.isArray(updated) ? updated.length : updated?.modifiedCount;
    if (changed !== 1) {
      throw recoveryError('ADMIN_RESET_INVALID', 'This reset link is invalid or has expired. Request a new link.');
    }
  }

  return { requestReset, verifyToken, resetPassword };
}

module.exports = { createPasswordRecoveryService, createResetToken, parseResetToken, GENERIC_MESSAGE };
