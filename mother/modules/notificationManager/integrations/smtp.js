/**
 * mother/modules/notificationManager/integrations/smtp.js
 */
// SMTP is an existing first-party integration, so its transport belongs to the
// normal runtime dependency set instead of silently degrading to a no-op.
const nodemailer = require('nodemailer');

module.exports = {
  integrationName: 'SMTP',

  initialize: async (config) => {
    // Transport creation remains lazy until the integration is activated by
    // Notification Manager, so inactive SMTP configuration performs no I/O.
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      }
    });

    return {
      // Notification Manager owns dispatch; this adapter only translates the
      // existing notification payload into an SMTP message.
      notify: async ({ message, priority, recipient, subject, timestamp }) => {
        if (!recipient) return;
        const finalSubject = subject || `[${priority.toUpperCase()}] Notification`;
        const finalBody = `${message}\nTime: ${timestamp}`;

        await transporter.sendMail({
          from: config.user,
          to: recipient,
          subject: finalSubject,
          text: finalBody
        });
      }
    };
  }
};
