//modules/news/ai/chatgpt.js

'use strict';

module.exports = function fetchFromChatGPT({ motherEmitter, jwt, input, lastResponseId }, cb) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('Missing valid OPENAI_API_KEY');
    console.error('[NEWS MODULE] fetch error:', err.message);
    if (cb) cb(err);
    return;
  }

  /* lassen für testing
  const payload = lastResponseId
    ? { model: 'gpt-4.1', input, previous_response_id: lastResponseId }
    : {
        model: 'gpt-4.1',
        tools: [{"type": "web_search_preview"}],
        prompt: {
          id: 'pmpt_685a6e8709008190a58ca9728a0c85630b93c77ebe12afd4',
          version: '20'
        },
        input
      };
*/

  const payload = { 
      model: "o4-mini",
      reasoning: { effort: "medium" },
      input: input,
      tools: [{"type": "web_search_preview"}],
      
  };

  motherEmitter.emit(
    'httpRequest',
    {
      jwt,
      moduleName: 'news',
      moduleType: 'community',
      url: 'https://api.openai.com/v1/responses',
      method: 'post',
      data: payload,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    },
    (err, resp) => {
      if (cb) {
        if (err) {
          cb(err);
        } else {
          cb(null, resp.data);
        }
      }
    }
  );
};
