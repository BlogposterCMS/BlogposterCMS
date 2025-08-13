// public/assets/js/pageDataLoader.js
;(function (window) {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN;

  if (!meltdownEmit) return;

  const cache = new Map();

  function sanitize(data, fields) {
    if (!fields) return (data && typeof data === 'object') ? data : null;
    if (!data || typeof data !== 'object') return null;
    const out = {};
    for (const f of fields) {
      if (Object.hasOwn(data, f)) out[f] = data[f];
    }
    return out;
  }

  async function load(eventName, payload = {}, opts = {}) {
    if (!jwt || !eventName) return null;
    const key = `${eventName}:${JSON.stringify(payload)}`;
    if (cache.has(key)) return cache.get(key);

      const p = meltdownEmit(eventName, { jwt, ...payload })
    .then(res => {
      console.log('[LOADER-DEBUG] API-RAW:', res);
      const sanitized = sanitize(res?.data ?? res ?? null, opts.fields);
      console.log('[LOADER-DEBUG] Sanitized:', sanitized);
      return sanitized;
    })
  .catch(err => {
    console.error('[pageDataLoader] fetch error', err);
    cache.delete(key);
    return null;
  });

    cache.set(key, p);
    return p;
  }

  function clear(eventName, payload) {
    if (!eventName) return cache.clear();
    const key = `${eventName}:${JSON.stringify(payload || {})}`;
    cache.delete(key);
  }

  window.pageDataLoader = { load, clear };

  window.addEventListener('pagehide', () => clear());

  if (window.PAGE_ID) {
    const fields = [
      'id',
      'slug',
      'status',
      'title',
      'seo_image',
      'translations',
      'trans_title',
      'trans_lang',
      'html',
      'css',
      'meta_desc',
      'seo_title',
      'seo_keywords',
      'meta',
      'language',
      'lane',
      'parent_id',
      'parentSlug',
      'is_content'
    ];
    window.pageDataPromise = load(
      'getPageById',
      { moduleName: 'pagesManager', moduleType: 'core', pageId: window.PAGE_ID },
      { fields }
    );
  }
})(window);
