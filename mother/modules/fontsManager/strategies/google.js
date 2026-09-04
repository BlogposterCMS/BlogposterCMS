

const { BACKEND_EVENTS } = require('../../../contracts/generatedBackendEventCatalog');

const https = require('https');
const { requestBackendEvent } = require('../../../contracts/backendEventContracts');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

module.exports = {
  initialize({ motherEmitter, fontsModuleSecret, jwt }) {
    // Helper to add a single font entry via the manager API
    const addFont = ({ name, url }) => requestBackendEvent(motherEmitter, BACKEND_EVENTS.ADD_FONT, {
      jwt,
      moduleName: 'fontsManager',
      moduleType: 'core',
      name,
      url,
      provider: 'googleFonts'
    }).then(() => true, () => true);

    // Build a css2 URL with a sensible default of weights to keep CSS small.
    const cssUrlForFamily = family =>
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600&display=swap`;

    // The init function will fetch the full Google Fonts catalog and register it
    // into fontsManager (global.fontsList).
    const initFunction = async () => {
      try {
        let apiKey = process.env.GOOGLE_FONTS_API_KEY;
        if (!apiKey && motherEmitter) {
          // Try to read from settingsManager so admins can configure via UI
          apiKey = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_SETTING, {
            jwt,
            moduleName: 'settingsManager',
            moduleType: 'core',
            key: 'GOOGLE_FONTS_API_KEY'
          }).then(value => String(value || '').trim(), () => '');
        }
        if (!apiKey) {
          console.warn('[FONTS MANAGER][google] GOOGLE_FONTS_API_KEY missing; falling back to defaults.');
          return;
        }
        const url = `https://www.googleapis.com/webfonts/v1/webfonts?sort=alpha&key=${encodeURIComponent(apiKey)}`;
        const json = await fetchJson(url);
        const items = Array.isArray(json.items) ? json.items : [];
        if (!items.length) {
          console.warn('[FONTS MANAGER][google] API returned no items.');
          return;
        }
        // Register fonts sequentially to avoid overwhelming the event bus
        for (const it of items) {
          const family = it.family || it.familyName || it.name;
          if (!family) continue;
          const cssUrl = cssUrlForFamily(family);
          await addFont({ name: family, url: cssUrl });
        }
        console.log(`[FONTS MANAGER][google] Registered ${items.length} Google Fonts.`);
      } catch (err) {
        console.warn('[FONTS MANAGER][google] Failed to fetch Google Fonts list:', err.message);
      }
    };

    requestBackendEvent(motherEmitter, BACKEND_EVENTS.REGISTER_FONT_PROVIDER, {
      jwt,
      moduleType: 'core',
      moduleName: 'fontsManager',
      fontsModuleSecret,
      providerName: 'googleFonts',
      description: 'Google Fonts provider',
      isEnabled: false,
      initFunction
    }).then(() => {}, err => {
  console.warn('[FONTS MANAGER][google] registerFontProvider failed:', err.message);
});
  }
};
