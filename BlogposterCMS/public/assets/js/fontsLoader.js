(function initFontsLoader() {
  async function run() {
    let fonts = [];
    try {
      const jwt = await window.meltdownEmit('issuePublicToken', {
        purpose: 'fonts',
        moduleName: 'auth'
      });
      let list = await window.meltdownEmit('listFonts', {
        jwt,
        moduleName: 'fontsManager',
        moduleType: 'core'
      });
      list = Array.isArray(list) ? list : (list?.data ?? []);
      fonts = list.map(f => f.name);
      window.AVAILABLE_FONTS = fonts;
      // Map family name -> stylesheet URL for lazy loading
      window.FONT_SOURCES = Object.fromEntries(
        list.filter(f => f && f.name && f.url).map(f => [f.name, f.url])
      );
      window.LOADED_FONT_CSS = window.LOADED_FONT_CSS || {};
      window.loadFontCss = function (name) {
        try {
          if (!name) return;
          if (window.LOADED_FONT_CSS[name]) return;
          const href = window.FONT_SOURCES?.[name];
          if (!href) return;
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          document.head.appendChild(link);
          window.LOADED_FONT_CSS[name] = true;
        } catch (_) {}
      };

      let providers = await window.meltdownEmit('listFontProviders', {
        jwt,
        moduleName: 'fontsManager',
        moduleType: 'core'
      });
      providers = Array.isArray(providers) ? providers : (providers?.data ?? []);
      const google = providers.find(p => p.name === 'googleFonts');
      // Avoid mass-injecting thousands of stylesheets; fonts are lazy-loaded on selection via window.loadFontCss
      document.dispatchEvent(new CustomEvent('fontsUpdated', { detail: { fonts } }));
    } catch (err) {
      console.error('[fontsLoader] Failed to load fonts', err);
      document.dispatchEvent(new CustomEvent('fontsError', { detail: { error: String(err?.message || err) } }));
    }
  }

  // Ensure meltdownEmit is available; retry a few times if needed
  function startWhenReady(attempt = 0) {
    if (typeof window.meltdownEmit === 'function') {
      run();
      return;
    }
    if (attempt >= 40) return; // ~2s max wait
    setTimeout(() => startWhenReady(attempt + 1), 50);
  }

  if (typeof window.meltdownEmit === 'function') {
    run();
  } else if (document.readyState === 'complete' || document.readyState === 'interactive') {
    startWhenReady();
  } else {
    document.addEventListener('DOMContentLoaded', () => startWhenReady());
  }
})();
