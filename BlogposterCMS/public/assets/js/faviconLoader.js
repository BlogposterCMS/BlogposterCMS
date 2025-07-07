(async () => {
  if (typeof window.meltdownEmit !== 'function') return;
  try {
    const jwt = await window.meltdownEmit('issuePublicToken', {
      purpose: 'favicon',
      moduleName: 'auth'
    });
    const url = await window.meltdownEmit('getPublicSetting', {
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'FAVICON_URL'
    });
    if (url) {
      let link = document.querySelector('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = url;
    }
  } catch (err) {
    console.error('[faviconLoader] Failed to load favicon', err);
  }
})();
