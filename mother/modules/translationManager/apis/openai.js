/**
 * mother/modules/translationManager/apis/openai.js
 *
 * Minimal example to call OpenAI GPT for translation.
 * 
 * For production usage, you might want to handle token usage, cost, 
 * partial responses, error handling, etc.
 */

const { OpenAI } = require('openai');

async function translateText(text, fromLang, toLang, apiKey) {
  if (!apiKey) {
    throw new Error('[OPENAI] Missing API key.');
  }
  if (!text) {
    throw new Error('[OPENAI] text is empty.');
  }

  const openai = new OpenAI({ apiKey });

  const prompt = `
    Translate from ${fromLang} to ${toLang} in a professional style:
    ${text}
  `;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [{ role: 'user', content: prompt }]
  });

  const translated = response.choices[0]?.message?.content?.trim() || '';
  return translated;
}

module.exports = {
  translateText
};
