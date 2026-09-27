const bcrypt = require('bcryptjs');
const { BACKEND_EVENTS } = require('../mother/contracts/generatedBackendEventCatalog');

jest.mock('../mother/contracts/backendEventContracts', () => ({ requestBackendEvent: jest.fn() }));
const { requestBackendEvent } = require('../mother/contracts/backendEventContracts');
const { createPasswordRecoveryService, createResetToken } = require('../mother/modules/userManagement/passwordRecoveryService');

const secret = 's'.repeat(64);
const mailRegistry = { SMTP: { active: true, config: { host: 'mail.example.test', user: 'sender@example.test', pass: 'secret' } } };

function fixture(role = 'admin') {
  let user = { id: 7, email: 'admin@example.test', password: bcrypt.hashSync('OldPassword123', 4), token_version: 2 };
  const sent = [];
  const smtpConfigs = [];
  requestBackendEvent.mockImplementation(async (_emitter, event, payload) => {
    if (event === BACKEND_EVENTS.DB_SELECT) return payload.where.email === user.email ? [user] : [];
    if (event === BACKEND_EVENTS.GET_ROLES_FOR_USER) return [{ role_name: role }];
    if (event === BACKEND_EVENTS.GET_USER_DETAILS_BY_ID) return String(payload.userId) === String(user.id) ? user : null;
    if (event === BACKEND_EVENTS.DB_UPDATE) {
      if (payload.where.password !== user.password) return [];
      user = { ...user, password: payload.data.password, token_version: user.token_version + 1 };
      return [user];
    }
    throw new Error(`Unexpected event: ${event}`);
  });
  const service = createPasswordRecoveryService({
    motherEmitter: {}, getUserManagementToken: async () => 'core-token', secret,
    publicUrl: 'https://cms.example.test', isProduction: true,
    loadMailRegistry: () => mailRegistry,
    initializeSmtp: async config => { smtpConfigs.push(config); return { notify: async message => sent.push(message) }; }
  });
  return { service, sent, smtpConfigs, getUser: () => user };
}

beforeEach(() => requestBackendEvent.mockReset());

test('administrator reset sends a fixed-origin link, changes the hash once and revokes old sessions', async () => {
  const { service, sent, smtpConfigs, getUser } = fixture();
  const oldHash = getUser().password;
  await service.requestReset('admin@example.test');
  await new Promise(resolve => setImmediate(resolve));
  expect(sent).toHaveLength(1);
  expect(sent[0].recipient).toBe('admin@example.test');
  expect(smtpConfigs[0].requireTLS).toBe(true);
  const token = sent[0].message.match(/token=([^\s]+)/)[1];
  await service.verifyToken(token);
  await service.resetPassword(token, 'NewPassword456');
  expect(getUser().password).not.toBe(oldHash);
  expect(await bcrypt.compare('NewPassword456', getUser().password)).toBe(true);
  expect(getUser().token_version).toBe(3);
  await expect(service.resetPassword(token, 'AnotherPassword789')).rejects.toMatchObject({ code: 'ADMIN_RESET_INVALID' });
  expect(sent[0].message).toContain('https://cms.example.test/admin/reset-password?token=');
});

test('unknown and non-admin emails receive the same response without sending mail', async () => {
  const { service, sent } = fixture('editor');
  const unknown = await service.requestReset('unknown@example.test');
  const nonAdmin = await service.requestReset('admin@example.test');
  expect(nonAdmin).toBe(unknown);
  expect(sent).toHaveLength(0);
});

test('expired and malformed tokens and weak passwords fail closed', async () => {
  const { service, getUser } = fixture();
  const expired = createResetToken(getUser(), secret, Date.now() - 2 * 60 * 60 * 1000);
  await expect(service.verifyToken(expired)).rejects.toMatchObject({ code: 'ADMIN_RESET_INVALID' });
  await expect(service.verifyToken('invalid')).rejects.toMatchObject({ code: 'ADMIN_RESET_INVALID' });
  const current = createResetToken(getUser(), secret);
  await expect(service.resetPassword(current, 'short')).rejects.toMatchObject({ code: 'ADMIN_RESET_WEAK_PASSWORD' });
  expect(getUser().token_version).toBe(2);
});

test('missing SMTP configuration reports an operator action', async () => {
  const { service } = fixture();
  const unavailable = createPasswordRecoveryService({
    motherEmitter: {}, getUserManagementToken: async () => 'core-token', secret,
    publicUrl: 'https://cms.example.test', isProduction: true,
    loadMailRegistry: () => ({ SMTP: { active: false } })
  });
  await expect(unavailable.requestReset('admin@example.test')).rejects.toMatchObject({ code: 'ADMIN_RESET_MAIL_UNAVAILABLE' });
  await expect(service.requestReset('bad-email')).rejects.toMatchObject({ code: 'ADMIN_RESET_EMAIL_INVALID' });
});
