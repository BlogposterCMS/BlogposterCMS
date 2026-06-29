'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  canUseWeakLocalDevCredentials,
  isLocalDevRequest
} = require('../../modules/auth/devAutoLogin');
const { validateInstallInput } = require('../../utils/installValidation');

function createInstallRoutes({
  csrfProtection,
  getCachedCoreToken,
  getInstallationStatus,
  injectDevBanner,
  isDevAutoLoginAllowed,
  loginLimiter,
  motherEmitter,
  installLockPath,
  publicPath
}) {
  const router = express.Router();

  router.post('/install', loginLimiter, csrfProtection, async (req, res) => {
    const { username, email, password, favoriteColor, siteName } = req.body || {};
    const trimmedUsername = String(username || '').trim();
    const trimmedEmail = String(email || '').trim();
    const trimmedSiteName = siteName != null ? String(siteName).trim() : '';
    const safePassword = typeof password === 'string' ? password : '';
    const allowWeak = canUseWeakLocalDevCredentials(req);
    const isLocal = isLocalDevRequest(req);
    const forbidden = ['admin', 'root', 'test'];

    const { error } = validateInstallInput(
      { username: trimmedUsername, email: trimmedEmail, password: safePassword },
      { forbidden, allowWeak, isLocal }
    );

    if (error) return res.status(error.status).send(error.message);

    const strong = safePassword.length >= 12 &&
      /[a-z]/.test(safePassword) &&
      /[A-Z]/.test(safePassword) &&
      /\d/.test(safePassword);
    if (!strong && (!allowWeak || !isLocal)) {
      return res.status(400).send('Password too weak');
    }

    try {
      const installationStatus = await getInstallationStatus();
      const userManagementToken = await getCachedCoreToken('userManagement');
      const settingsManagerToken = await getCachedCoreToken('settingsManager');

      if (installationStatus.complete || installationStatus.hasPersistentData) {
        return res.status(403).send('Already installed');
      }

      await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'createUser',
          {
            jwt: userManagementToken,
            moduleName: 'userManagement',
            moduleType: 'core',
            username: trimmedUsername,
            password: safePassword,
            email: trimmedEmail,
            displayName: trimmedUsername,
            uiColor: favoriteColor,
            role: 'admin'
          },
          err => (err ? reject(err) : resolve())
        );
      });

      await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'setSetting',
          {
            jwt: settingsManagerToken,
            moduleName: 'settingsManager',
            moduleType: 'core',
            key: 'FIRST_INSTALL_DONE',
            value: 'true'
          },
          err => (err ? reject(err) : resolve())
        );
      });

      if (trimmedSiteName) {
        await new Promise((resolve, reject) => {
          motherEmitter.emit(
            'setSetting',
            {
              jwt: settingsManagerToken,
              moduleName: 'settingsManager',
              moduleType: 'core',
              key: 'SITE_NAME',
              value: trimmedSiteName
            },
            err => (err ? reject(err) : resolve())
          );
        });
      }

      fs.writeFileSync(installLockPath, 'installed');
      res.json({ success: true });
    } catch (err) {
      console.error('[POST /install] Error:', err);
      res.status(500).send('Installation failed');
    }
  });

  router.get('/install', csrfProtection, async (req, res) => {
    try {
      const installationStatus = await getInstallationStatus();
      if (installationStatus.complete || installationStatus.hasPersistentData) {
        return res.redirect('/login');
      }

      const devAutoLoginAllowed = await isDevAutoLoginAllowed();
      const devSetupShortcutsAllowed = canUseWeakLocalDevCredentials(req);
      let html = fs.readFileSync(path.join(publicPath, 'install.html'), 'utf8');
      html = html.replace('{{CSRF_TOKEN}}', req.csrfToken())
        .replace('{{DEV_AUTOLOGIN}}', (devAutoLoginAllowed || devSetupShortcutsAllowed) ? 'true' : '')
        .replace('{{DEV_USER}}', process.env.DEV_USER || 'admin')
        .replace('{{ALLOW_WEAK_CREDS}}', devSetupShortcutsAllowed ? 'true' : '');
      html = injectDevBanner(html);
      res.send(html);
    } catch (err) {
      console.error('[GET /install] Error:', err);
      res.status(500).send('Server misconfiguration');
    }
  });

  router.get('/register', (_req, res) => {
    res.redirect('/install');
  });

  return router;
}

module.exports = {
  createInstallRoutes
};
