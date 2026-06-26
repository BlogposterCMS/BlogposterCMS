'use strict';

function once(originalCb) {
  let fired = false;
  return (...args) => {
    if (fired) return;
    fired = true;
    if (typeof originalCb === 'function') originalCb(...args);
  };
}

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, once((err, result) => {
      if (err) return reject(err);
      resolve(result);
    }));
  });
}

function contentDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function contentDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

async function ensureContentEngineDatabase(motherEmitter, jwt, nonce) {
  await emitAsync(motherEmitter, 'createDatabase', {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    nonce,
    targetModuleName: 'contentEngine'
  });
}

async function ensureContentEngineSchema(motherEmitter, jwt) {
  await contentDbUpdate(motherEmitter, jwt, 'INIT_CONTENT_ENGINE_SCHEMA');
  await contentDbUpdate(motherEmitter, jwt, 'INIT_CONTENT_ENGINE_TABLES');
}

async function seedDefaultContentTypes(motherEmitter, jwt) {
  const defaults = [
    {
      key: 'page',
      label: 'Page',
      description: 'Hierarchical public or admin page.',
      icon: 'file-text',
      fields: [
        { name: 'html', type: 'html' },
        { name: 'css', type: 'css' },
        { name: 'seoTitle', type: 'string' },
        { name: 'metaDesc', type: 'text' }
      ],
      settings: { hierarchical: true, public: true }
    },
    {
      key: 'post',
      label: 'Post',
      description: 'Chronological article entry.',
      icon: 'newspaper',
      fields: [
        { name: 'body', type: 'richtext' },
        { name: 'excerpt', type: 'text' },
        { name: 'featuredImage', type: 'media' }
      ],
      settings: { hierarchical: false, public: true, archive: true }
    }
  ];

  for (const type of defaults) {
    await contentDbUpdate(motherEmitter, jwt, 'UPSERT_CONTENT_TYPE', type);
  }

}

module.exports = {
  contentDbSelect,
  contentDbUpdate,
  emitAsync,
  ensureContentEngineDatabase,
  ensureContentEngineSchema,
  seedDefaultContentTypes
};
