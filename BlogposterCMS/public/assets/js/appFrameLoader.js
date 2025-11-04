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

  const normalizeOrigin = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw || raw.toLowerCase() === 'null') {
      return null;
    }
    try {
      const url = new URL(raw, window.location.href);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.origin;
      }
      console.warn('[AppFrame] Ignoring unsupported origin protocol', raw);
      return null;
    } catch (err) {
      console.warn('[AppFrame] Ignoring invalid origin value', value, err.message);
      return null;
    }
  };

  const parseOrigins = (value) => String(value || '')
    .split(',')
    .map(part => normalizeOrigin(part.trim()))
    .filter(Boolean);

  const metaOrigins = parseOrigins(document.querySelector('meta[name="app-frame-allowed-origins"]')?.content);
  const dataOrigins = parseOrigins(frame.dataset.allowedOrigins);
  const allowedOrigins = Array.from(new Set([...metaOrigins, ...dataOrigins]));
  if (!allowedOrigins.length) {
    allowedOrigins.push(window.location.origin);
  }

  const frameOrigin = normalizeOrigin(frame.getAttribute('src')) || window.location.origin;

  frame.addEventListener('load', () => {
    frame.contentWindow.postMessage({
      type: 'init-tokens',
      csrfToken: window.CSRF_TOKEN,
      adminToken: window.ADMIN_TOKEN,
      allowedOrigins
    }, frameOrigin);
  });

  window.addEventListener('message', ev => {
    if (ev.source !== frame.contentWindow) return;
    if (!allowedOrigins.includes(ev.origin)) return;
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
