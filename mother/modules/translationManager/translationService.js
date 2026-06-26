/**
 * mother/modules/translationManager/translationService.js
 *
 * This file always:
 *  1) Calls the chosen translation provider (OpenAI, etc.).
 *  2) Immediately logs usage into 'translation_usage'.
 *  3) Immediately caches the result in 'translation_cache'.
 */

//const openai = require('./apis/openai');

async function translateText({
  provider,
  text,
  fromLang,
  toLang,
  apiKey,
  // meltdown-related:
  motherEmitter,
  userJwt,
  userId   // the user performing the translation
}) {
  if (!motherEmitter || !userJwt || !userId) {
    throw new Error('[TRANSLATION SERVICE] Missing motherEmitter, userJwt, or userId for meltdown usage.');
  }

  // 1) Call the chosen provider to get the translation
  let translated;
  switch (provider) {
    case 'openai':
      translated = await openai.translateText(text, fromLang, toLang, apiKey);
      break;
    // case 'gemini':
    //   translated = await gemini.translateText(text, fromLang, toLang, apiKey);
    //   break;
    default:
      throw new Error(`[TRANSLATION SERVICE] Unsupported provider: ${provider}`);
  }

  // 2) Immediately log usage in "translation_usage"
  await new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbInsert',
      {
        jwt: userJwt,
        moduleName: 'translationManager',
        table: 'translation_usage',
        data: {
          user_id: userId,
          provider,
          chars: text.length,
          from_lang: fromLang,
          to_lang: toLang,
          created_at: new Date().toISOString()
        }
      },
      (err, insertedUsage) => {
        if (err) return reject(err);
        resolve(insertedUsage);
      }
    );
  });

  // 3) Immediately store the translated text in "translation_cache"
  await new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbInsert',
      {
        jwt: userJwt,
        moduleName: 'translationManager',
        table: 'translation_cache',
        data: {
          provider,
          from_lang: fromLang,
          to_lang: toLang,
          source_text: text,
          translated_text: translated,
          user_id: userId,
          created_at: new Date().toISOString()
        }
      },
      (err, insertedCache) => {
        if (err) return reject(err);
        resolve(insertedCache);
      }
    );
  });

  // 4) Return the final translated text
  return translated;
}

module.exports = {
  translateText
};
