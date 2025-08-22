// public/assets/js/appFrameLoader.js
(function() {
  const csrfMeta = document.querySelector('meta[name="csrf-token"]');
  const adminMeta = document.querySelector('meta[name="admin-token"]');
  const appMeta = document.querySelector('meta[name="app-name"]');
  window.CSRF_TOKEN = csrfMeta ? csrfMeta.content : null;
  window.ADMIN_TOKEN = adminMeta ? adminMeta.content : null;
  const appName = appMeta ? appMeta.content : '';

  const frame = document.getElementById('app-frame');
  if (!frame) return;

  frame.addEventListener('load', () => {
    frame.contentWindow.postMessage({
      type: 'init-tokens',
      csrfToken: window.CSRF_TOKEN,
      adminToken: window.ADMIN_TOKEN,
    }, '*');
  });

  window.addEventListener('message', ev => {
    if (ev.source !== frame.contentWindow) return;
    const msg = ev.data || {};
    if (!msg.type) return;
    window.meltdownEmit('dispatchAppEvent', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'appLoader',
      moduleType: 'core',
      appName,
      event: msg.type,
      data: msg.data || {}
    }).catch(e => console.warn('[AppFrame] dispatch failed', e));
  });
})();
