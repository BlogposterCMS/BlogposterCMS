'use strict';

module.exports = async function newsFilter({ motherEmitter, jwt, articles, model = 'gpt-4.1-mini', currentTimestamp }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const payload = {
    model,
    messages: [{
      role: 'user',
      content: `
Current timestamp: ${currentTimestamp}

Given the news articles, filter ONLY those with immediate significant market impact published within the last 10 minutes (600 seconds).

Respond strictly in JSON:
[{
  "headline": "",
  "source": "",
  "url": "",
  "breaking": true/false,
  "published_at": unix timestamp,
  "provider": "brave"/"yahoo"/"twitter",
  "reason": ""
}]

Articles: ${JSON.stringify(articles)}
      `
    }]
  };

  const response = await new Promise((resolve, reject) => {
    motherEmitter.emit('httpRequest', {
      jwt,
      moduleName: 'news',
      moduleType: 'community',
      url: 'BlogposterCMS/modules/news/ai/chatgpt.js',
      method: 'post',
      data: payload,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }, (err, res) => err ? reject(err) : resolve(res));
  });

  let filteredArticles;
  try {
    const content = response.data?.choices?.[0]?.message?.content || '[]';
    filteredArticles = JSON.parse(content);
  } catch (parseError) {
    console.error('[NEWS FILTER] JSON Parse Error:', parseError);
    throw parseError;
  }

  // Speicherung der gefilterten News
  const insertPromises = filteredArticles.map(article => new Promise((resolve, reject) => {
    motherEmitter.emit('performDbOperation', {
      jwt,
      moduleName: 'news',
      moduleType: 'community',
      operation: `
        INSERT INTO news_articles (headline, source, url, breaking, provider, published_at)
        VALUES ($1,$2,$3,$4,$5,$6)
      `,
      params: [
        article.headline,
        article.source,
        article.url,
        article.breaking,
        article.provider,
        article.published_at
      ]
    }, (dbErr) => dbErr ? reject(dbErr) : resolve());
  }));

  await Promise.all(insertPromises);
  return filteredArticles;
};
