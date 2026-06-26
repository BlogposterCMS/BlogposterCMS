/**
 * mother/modules/notificationManager/integrations/smtp.js
 */
// nodemailer is optional because the environment may not have it installed
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  console.warn('[SMTP Integration] nodemailer not installed => e-mail notifications disabled');
}

module.exports = {
  integrationName: 'SMTP',

  initialize: async (config) => {
    if (!nodemailer) {
      // If nodemailer isn't available we return a no-op notifier
      return {
        notify: async () => {
          console.warn('[SMTP Integration] notify() called but nodemailer is missing');
        }
      };
    }

    // transporter erstellen
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
      // "notify" => eigentliche Versand-Logik
      notify: async ({ message, priority, recipient, subject, timestamp }) => {
        if (!recipient) return; // o. subject ...
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
