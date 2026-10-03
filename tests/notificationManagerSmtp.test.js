afterEach(() => {
  jest.resetModules();
  jest.dontMock('nodemailer');
});

test('SMTP runtime dependency is installed and exposes a transport factory', () => {
  const nodemailerPath = require.resolve('nodemailer');
  const nodemailer = require(nodemailerPath);

  expect(nodemailerPath).toContain('node_modules');
  expect(typeof nodemailer.createTransport).toBe('function');
});

test('shared DNS cache preserves each transport TLS server name', async () => {
  const shared = require('nodemailer/lib/shared');
  const host = 'smtp-cache.example.test';
  shared.dnsCache.set(host, {
    value: { addresses: ['192.0.2.10'], servername: 'other-tenant.example.test' },
    expires: Date.now() + 60000
  });
  try {
    for (const servername of ['tenant-a.example.test', 'tenant-b.example.test']) {
      const resolved = await new Promise((resolve, reject) => {
        shared.resolveHostname({ host, servername }, (err, value) => err ? reject(err) : resolve(value));
      });
      expect(resolved.servername).toBe(servername);
      expect(resolved.cached).toBe(true);
    }
  } finally {
    shared.dnsCache.delete(host);
  }
});

test('real mail composer handles deeply nested recipient arrays without stack exhaustion', async () => {
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ jsonTransport: true });
  let recipient = { name: 'Recipient', address: 'recipient@example.test' };
  for (let i = 0; i < 15000; i++) recipient = [recipient];
  const result = await transport.sendMail({
    from: 'sender@example.test', to: recipient, subject: 'Test', text: 'Body'
  });
  expect(result.envelope).toEqual({ from: 'sender@example.test', to: ['recipient@example.test'] });
  const ordinary = await transport.sendMail({
    from: 'sender@example.test', to: '"Doe, Jane" <jane@example.test>', subject: 'Test', text: 'Body'
  });
  expect(ordinary.envelope.to).toEqual(['jane@example.test']);
});

test('SMTP integration uses the installed Nodemailer transport', async () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'message-1' });
  const createTransport = jest.fn(() => ({ sendMail }));
  jest.doMock('nodemailer', () => ({ createTransport }));

  const smtp = require('../mother/modules/notificationManager/integrations/smtp');
  const notifier = await smtp.initialize({
    host: 'smtp.example.test',
    port: 587,
    secure: false,
    user: 'sender@example.test',
    pass: 'secret'
  });

  await notifier.notify({
    message: 'Build completed',
    priority: 'info',
    recipient: 'recipient@example.test',
    subject: '',
    timestamp: '2026-07-25T08:00:00.000Z'
  });

  expect(createTransport).toHaveBeenCalledWith({
    host: 'smtp.example.test',
    port: 587,
    secure: false,
    requireTLS: false,
    auth: {
      user: 'sender@example.test',
      pass: 'secret'
    }
  });
  expect(sendMail).toHaveBeenCalledWith({
    from: 'sender@example.test',
    to: 'recipient@example.test',
    subject: '[INFO] Notification',
    text: 'Build completed\nTime: 2026-07-25T08:00:00.000Z'
  });
});

test('SMTP recovery delivery requires STARTTLS', async () => {
  const createTransport = jest.fn(() => ({ sendMail: jest.fn() }));
  jest.doMock('nodemailer', () => ({ createTransport }));

  const smtp = require('../mother/modules/notificationManager/integrations/smtp');
  await smtp.initialize({ host: 'smtp.example.test', port: 587, secure: false, requireTLS: true, user: 'sender@example.test', pass: 'secret' });

  expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true }));
});

test('SMTP integration skips notifications without a recipient', async () => {
  const sendMail = jest.fn();
  jest.doMock('nodemailer', () => ({
    createTransport: jest.fn(() => ({ sendMail }))
  }));

  const smtp = require('../mother/modules/notificationManager/integrations/smtp');
  const notifier = await smtp.initialize({
    host: 'smtp.example.test',
    port: 587,
    secure: false,
    user: 'sender@example.test',
    pass: 'secret'
  });

  await notifier.notify({
    message: 'No recipient',
    priority: 'warning',
    timestamp: '2026-07-25T08:00:00.000Z'
  });

  expect(sendMail).not.toHaveBeenCalled();
});
