'use strict';
const { createHash } = require('node:crypto');
const { hasPermission } = require('../userManagement/permissionUtils');

function cssError(code) { return Object.assign(new Error(code), { code }); }
function presentationCssRevision(pageId, language, css) {
  return createHash('sha256').update(JSON.stringify([String(pageId), language, css || ''])).digest('hex');
}
function validateCssPatch(payload) {
  if (!payload.jwt || payload.moduleName !== 'pagesManager' || payload.moduleType !== 'core') throw cssError('PAGE_CSS_PATCH_CONTEXT_INVALID');
  if (!hasPermission(payload.decodedJWT, 'pages.update')) throw cssError('PAGE_CSS_PATCH_FORBIDDEN');
  const patch = payload.presentationCss;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw cssError('PAGE_CSS_PATCH_INVALID');
  const allowed = new Set(['jwt', 'decodedJWT', 'moduleName', 'moduleType', 'pageId', 'presentationCss', 'appContext']);
  if (Object.keys(payload).some(key => !allowed.has(key)) || Object.keys(patch).some(key => !['language', 'css', 'expectedRevision'].includes(key))) throw cssError('PAGE_CSS_PATCH_FIELDS_FORBIDDEN');
  if (!['string', 'number'].includes(typeof payload.pageId) || !String(payload.pageId).trim()) throw cssError('PAGE_CSS_PATCH_ID_INVALID');
  if (typeof patch.language !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(patch.language)) throw cssError('PAGE_CSS_PATCH_LANGUAGE_INVALID');
  if (typeof patch.css !== 'string' || Buffer.byteLength(patch.css, 'utf8') > 262144) throw cssError('PAGE_CSS_PATCH_VALUE_INVALID');
  if (typeof patch.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(patch.expectedRevision)) throw cssError('PAGE_CSS_PATCH_REVISION_REQUIRED');
  return { pageId: payload.pageId, ...patch };
}

async function patchPresentationCss(db, dialect, p) {
  p = Array.isArray(p) ? p[0] : p;
  let row;
  let collection;
  let id;
  if (dialect === 'mongo') {
    const { ObjectId } = require('mongodb');
    if (!ObjectId.isValid(String(p.pageId))) throw cssError('PAGE_CSS_PATCH_ID_INVALID');
    id = new ObjectId(String(p.pageId));
    collection = db.collection('page_translations');
    row = await collection.findOne({ page_id: id, language: p.language });
  } else if (dialect === 'postgres') {
    row = (await db.query('SELECT css FROM pagesManager.page_translations WHERE page_id=$1 AND language=$2', [p.pageId, p.language])).rows[0];
  } else {
    row = await db.get('SELECT css FROM pagesManager_page_translations WHERE page_id=? AND language=?', [p.pageId, p.language]);
  }
  if (!row) throw cssError('PAGE_CSS_PATCH_TRANSLATION_NOT_FOUND');
  const previous = row.css || '';
  if (presentationCssRevision(p.pageId, p.language, previous) !== p.expectedRevision) throw cssError('PAGE_CSS_PATCH_VERSION_CONFLICT');
  // Compare the actual previous bytes in the UPDATE as well as the revision:
  // another writer between SELECT and UPDATE must never be overwritten.
  let matched;
  if (dialect === 'mongo') {
    matched = (await collection.updateOne({ page_id: id, language: p.language,
      css: previous === '' ? { $in: ['', null] } : previous }, { $set: { css: p.css } })).matchedCount;
  } else if (dialect === 'postgres') {
    matched = (await db.query("UPDATE pagesManager.page_translations SET css=$1 WHERE page_id=$2 AND language=$3 AND COALESCE(css,'')=$4", [p.css, p.pageId, p.language, previous])).rowCount;
  } else {
    matched = (await db.run("UPDATE pagesManager_page_translations SET css=? WHERE page_id=? AND language=? AND COALESCE(css,'')=?", [p.css, p.pageId, p.language, previous])).changes;
  }
  if (matched !== 1) throw cssError('PAGE_CSS_PATCH_VERSION_CONFLICT');
  return { pageId: p.pageId, language: p.language, css: p.css, revision: presentationCssRevision(p.pageId, p.language, p.css) };
}
module.exports = { validateCssPatch, presentationCssRevision, patchPresentationCss };
