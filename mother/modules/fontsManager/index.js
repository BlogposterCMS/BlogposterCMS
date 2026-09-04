'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');


require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { onceCallback } = require('../../emitters/motherEmitter');
const { DEFAULT_FONTS } = require('./config/defaultFonts');

const MODULE_NAME = 'fontsManager';
const MODULE_TYPE = 'core';

function assertFontsPayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[FONTS MANAGER] ${eventName} => invalid payload.`);
  }
}

module.exports = {
  initialize({ motherEmitter, isCore, jwt }) {
    if (!isCore) {
      throw new Error('[FONTS MANAGER] Must be loaded as a core module.');
    }
    if (!motherEmitter) {
      throw new Error('[FONTS MANAGER] motherEmitter missing.');
    }
    if (!jwt) {
      throw new Error('[FONTS MANAGER] initialization requires a valid JWT token.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[FONTS MANAGER] Initializing...');

    if (!global.fontProviders) {
      global.fontProviders = {};
    }

    if (!global.fontsList) {
      global.fontsList = Array.isArray(DEFAULT_FONTS) ? DEFAULT_FONTS.slice() : [];
    }

    motherEmitter.on(BACKEND_EVENTS.LIST_FONT_PROVIDERS, (payload, cb) => {
      cb = onceCallback(cb);
      try {
        assertFontsPayload(payload, BACKEND_EVENTS.LIST_FONT_PROVIDERS);
      } catch (err) {
        return cb(err);
      }
      const list = Object.entries(global.fontProviders).map(([name, obj]) => ({
        name,
        description: obj.description || '',
        isEnabled: !!obj.isEnabled
      }));
      cb(null, list);
    });

    motherEmitter.on(BACKEND_EVENTS.SET_FONT_PROVIDER_ENABLED, (payload, cb) => {
      cb = onceCallback(cb);
      try {
        assertFontsPayload(payload, BACKEND_EVENTS.SET_FONT_PROVIDER_ENABLED);
      } catch (err) {
        return cb(err);
      }
      const { providerName, enabled } = payload;
      if (!providerName || !Object.prototype.hasOwnProperty.call(global.fontProviders, providerName)) {
        return cb(new Error('Provider not found.'));
      }
      const provider = global.fontProviders[providerName];
      provider.isEnabled = !!enabled;
      // If enabling and provider exposes an init function, run it to populate fonts.
      try {
        if (provider.isEnabled && typeof provider.initFunction === 'function') {
          Promise.resolve(provider.initFunction()).catch(err => {
            console.warn(`[FONTS MANAGER] Provider init failed => ${providerName}`, err?.message || err);
          });
        }
      } catch (e) {
        console.warn(`[FONTS MANAGER] Provider init threw => ${providerName}`, e?.message || e);
      }
      cb(null, { success: true });
    });

    motherEmitter.on(BACKEND_EVENTS.REGISTER_FONT_PROVIDER, (payload, cb) => {
      cb = onceCallback(cb);
      const secret = process.env.FONTS_MODULE_INTERNAL_SECRET;
      const { providerName, description, isEnabled = false, initFunction, fontsModuleSecret } = payload || {};
      if (fontsModuleSecret !== secret) {
        return cb(new Error('Invalid or missing fonts module secret.'));
      }
      try {
        assertFontsPayload(payload, BACKEND_EVENTS.REGISTER_FONT_PROVIDER);
      } catch (err) {
        return cb(err);
      }
      if (!providerName || typeof initFunction !== 'function') {
        return cb(new Error('Invalid registerFontProvider payload.'));
      }
      const disallowed = ['__proto__','prototype','constructor'];
      if (disallowed.includes(providerName)) {
        return cb(new Error('Invalid provider name.'));
      }
      global.fontProviders[providerName] = { description, isEnabled, initFunction };
      cb(null, true);
    });

    motherEmitter.on(BACKEND_EVENTS.LIST_FONTS, (payload, cb) => {
      cb = onceCallback(cb);
      try {
        assertFontsPayload(payload, BACKEND_EVENTS.LIST_FONTS);
      } catch (err) {
        return cb(err);
      }
      cb(null, Array.isArray(global.fontsList) ? global.fontsList : []);
    });

    motherEmitter.on(BACKEND_EVENTS.ADD_FONT, (payload, cb) => {
      cb = onceCallback(cb);
      const { name, url, provider = 'custom' } = payload || {};
      try {
        assertFontsPayload(payload, BACKEND_EVENTS.ADD_FONT);
      } catch (err) {
        return cb(err);
      }
      if (typeof name !== 'string' || typeof url !== 'string') {
        return cb(new Error('Invalid font data.'));
      }
      const safeName = name.trim().substring(0, 80);
      const safeUrl = url.trim();
      if (!/^https?:\/\//i.test(safeUrl)) {
        return cb(new Error('Font URL must be http or https.'));
      }
      global.fontsList = Array.isArray(global.fontsList) ? global.fontsList : [];
      if (global.fontsList.some(f => f.name === safeName)) {
        return cb(new Error('Font already exists.'));
      }
      global.fontsList.push({ name: safeName, url: safeUrl, provider });
      cb(null, { success: true });
    });

    const strategiesPath = path.join(__dirname, 'strategies');
    if (fs.existsSync(strategiesPath)) {
      fs.readdirSync(strategiesPath).filter(f => f.endsWith('.js')).forEach(file => {
        const strategy = require(path.join(strategiesPath, file));
        if (typeof strategy.initialize === 'function') {
          strategy.initialize({ motherEmitter, fontsModuleSecret: process.env.FONTS_MODULE_INTERNAL_SECRET, jwt });
          console.log(`[FONTS MANAGER] Loaded provider => ${file}`);
        }
      });
    }

    console.log('[FONTS MANAGER] Initialized.');
  }
};
