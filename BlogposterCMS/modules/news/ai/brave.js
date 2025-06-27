//modules/news/ai/brave.js

'use strict';

// Brave API Integration for fetching news
module.exports = function fetchFromBrave({ motherEmitter, jwt, query }, cb) {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    const err = new Error('Missing valid BRAVE_API_KEY');
    console.error('[BRAVE MODULE] fetch error:', err.message);
    return cb?.(err);
  }

  const braveUrl = `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(query)}&freshness=pt1h`;

  motherEmitter.emit('httpRequest', {
    jwt,
    moduleName: 'news',
    moduleType: 'community',
    url: braveUrl,
    method: 'get',
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey
    }
  }, (err, res) => {
    if (err) {
      console.error('[BRAVE MODULE] HTTP Request Error:', err);
      return cb?.(err);
    }

    const articles = res.data?.results || [];
    cb?.(null, articles); // KEINE sofortige Speicherung hier!
  });
};

 