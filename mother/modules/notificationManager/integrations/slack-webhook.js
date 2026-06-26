/**
 * mother/modules/notificationManager/integrations/slack-webhook.js
 *
 * Sends notifications to Slack using an incoming webhook without external
 * dependencies. Only allows HTTPS endpoints hosted on Slack to mitigate SSRF
 * risks.
 */
const https = require('https');
const { URL } = require('url');

module.exports = {
  integrationName: 'Slack',
  fields: [
    { name: 'webhookUrl', label: 'Webhook URL', required: true },
    { name: 'defaultChannel', label: 'Default Channel', required: false },
    { name: 'username', label: 'Username', required: false },
    { name: 'icon', label: 'Icon Emoji', required: false }
  ],

  verify: async (config = {}) => {
    const { webhookUrl } = config;
    if (!webhookUrl) throw new Error('Missing webhookUrl');
    let urlObj;
    try {
      urlObj = new URL(webhookUrl);
    } catch {
      throw new Error('Invalid webhookUrl');
    }
    if (urlObj.protocol !== 'https:' || urlObj.hostname !== 'hooks.slack.com') {
      throw new Error('Webhook must be hooks.slack.com over HTTPS');
    }

    const data = JSON.stringify({ text: 'Blogposter Slack integration verified.' });
    const options = {
      method: 'POST',
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    await new Promise((resolve, reject) => {
      const req = https.request(options, res => {
        res.on('data', () => {});
        res.on('end', resolve);
      });
      req.on('error', reject);
      req.setTimeout(5000, () => req.destroy(new Error('timeout')));
      req.write(data);
      req.end();
    });
  },

  initialize: async (config = {}) => {
    const { webhookUrl, defaultChannel, username, icon } = config;
    let urlObj;
    try {
      urlObj = new URL(webhookUrl);
    } catch {
      console.error('[Slack Integration] Invalid webhookUrl.');
      return { notify: async () => {} };
    }
    if (urlObj.protocol !== 'https:' || urlObj.hostname !== 'hooks.slack.com') {
      console.error('[Slack Integration] Refusing non-Slack webhook URL.');
      return { notify: async () => {} };
    }

    return {
      notify: async ({ moduleName = 'unknown', message = '', priority = 'info' }) => {
        const text = `[${priority.toUpperCase()}] ${moduleName}: ${message}`;
        const payload = { text };
        if (defaultChannel) payload.channel = defaultChannel;
        if (username) payload.username = username;
        if (icon) payload.icon_emoji = icon;

        const data = JSON.stringify(payload);
        const options = {
          method: 'POST',
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          }
        };

        await new Promise((resolve, reject) => {
          const req = https.request(options, res => {
            res.on('data', () => {});
            res.on('end', resolve);
          });
          req.on('error', err => {
            console.error('[Slack Integration] Failed to send =>', err.message);
            reject(err);
          });
          req.setTimeout(5000, () => req.destroy(new Error('timeout')));
          req.write(data);
          req.end();
        }).catch(() => {});
      }
    };
  }
};
