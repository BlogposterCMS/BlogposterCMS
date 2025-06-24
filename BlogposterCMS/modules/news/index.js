'use strict';

module.exports = {
  async initialize({ motherEmitter, jwt }) {
    console.log('[NEWS MODULE] Initializing news module...');

    let axios;
    await new Promise((resolve) => {
      motherEmitter.emit(
        'requestDependency',
        { moduleNameToCheck: 'news', dependencyName: 'axios' },
        (err, dep) => {
          if (err) {
            console.error('[NEWS MODULE] axios not allowed =>', err.message);
          } else {
            axios = dep;
          }
          resolve();
        }
      );
    });

    let latest = null;
    let timer = null;

    async function fetchNews(cb) {
      if (!axios) return cb && cb(new Error('axios missing'));
      const apiKey = process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY';
      try {
        const resp = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'GENA: Trading-Analyse jetzt!' }]
          },
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        latest = resp.data;
        if (cb) cb(null, latest);
      } catch (err) {
        console.error('[NEWS MODULE] fetch error:', err.message);
        if (cb) cb(err);
      }
    }

    function setCron(minutes) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      const ms = minutes ? minutes * 60 * 1000 : 0;
      if (ms > 0) {
        timer = setInterval(() => fetchNews(() => {}), ms);
      }
    }

    motherEmitter.on('news.fetchNow', (payload, cb) => {
      fetchNews(cb);
    });

    motherEmitter.on('news.setCron', (payload, cb) => {
      const minutes = Number(payload?.minutes || 0);
      setCron(minutes);
      if (typeof cb === 'function') cb(null, { active: !!timer });
    });

    motherEmitter.on('news.getLatest', (_payload, cb) => {
      cb(null, latest);
    });

    await seedAssets(motherEmitter, jwt);

    console.log('[NEWS MODULE] Initialized.');
  }
};

async function seedAssets(motherEmitter, jwt) {
  const widgetId = 'newsWidget';
  const pageSlug = 'news';

  // Ensure widget exists
  const widgets = await new Promise((resolve) => {
    motherEmitter.emit(
      'getWidgets',
      { jwt, moduleName: 'widgetManager', moduleType: 'core', widgetType: 'public' },
      (err, list = []) => resolve(err ? [] : list)
    );
  });
  const exists = widgets.some((w) => w.widgetId === widgetId);
  if (!exists) {
    await new Promise((resolve) => {
      motherEmitter.emit(
        'createWidget',
        {
          jwt,
          moduleName: 'widgetManager',
          moduleType: 'core',
          widgetId,
          widgetType: 'public',
          label: 'News',
          content: '/assets/plainspace/community/news/widget.js',
          category: 'community'
        },
        () => resolve()
      );
    });
  }

  // Ensure page exists
  let page = await new Promise((resolve) => {
    motherEmitter.emit(
      'getPageBySlug',
      {
        jwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        slug: pageSlug,
        lane: 'public',
        language: 'en'
      },
      (err, p) => resolve(err ? null : p)
    );
  });

  if (!page) {
    const createRes = await new Promise((resolve) => {
      motherEmitter.emit(
        'createPage',
        {
          jwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          title: 'News',
          slug: pageSlug,
          lane: 'public',
          status: 'published',
          translations: [
            {
              language: 'en',
              title: 'News',
              html: '<div id="root"></div>',
              metaDesc: 'Latest trading news',
              seoTitle: 'News',
              seoKeywords: ''
            }
          ],
          is_content: false
        },
        (err, res) => resolve(err ? null : res)
      );
    });
    if (createRes && createRes.pageId) {
      const layout = [
        { id: 'w1', widgetId, x: 0, y: 0, w: 8, h: 4, code: null }
      ];
      await new Promise((resolve) => {
        motherEmitter.emit(
          'saveLayoutForViewport',
          {
            jwt,
            moduleName: 'plainspace',
            moduleType: 'core',
            pageId: createRes.pageId,
            lane: 'public',
            viewport: 'desktop',
            layout
          },
          () => resolve()
        );
      });
    }
  }
}
