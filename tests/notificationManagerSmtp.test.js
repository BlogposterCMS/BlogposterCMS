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
