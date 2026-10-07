'use strict';
const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');
const { requestBackendEvent } = require('../../contracts/backendEventContracts');
function navigationError(code, statusCode = 400) { return Object.assign(new Error(code), { code, statusCode }); }
function pageId(page) { return String(page.id ?? page.pageId ?? page._id ?? ''); }
function metaOf(page) {
  if (typeof page.meta === 'string') return JSON.parse(page.meta || '{}');
  return page.meta || {};
}
function visible(page) {
  const meta = metaOf(page);
  return String(page.status).toLowerCase() === 'published' && String(page.lane || 'public').toLowerCase() === 'public'
    && !page.deleted_at && !page.deletedAt && ![true, 1, '1', 'true'].includes(page.is_deleted)
    && page.is_private !== true && meta.visibility !== 'private' && meta.private !== true;
}
async function pageNavigationTree(emitter, jwt, params) {
  if (!['string', 'number'].includes(typeof params.parentId) || !String(params.parentId).trim()) throw navigationError('NAVIGATION_PAGES_PARENT_REQUIRED');
  const language = String(params.language || 'en').toLowerCase();
  if (language.length > 35 || !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/.test(language)) throw navigationError('NAVIGATION_PAGES_LANGUAGE_INVALID');
  const depth = params.maxDepth === undefined ? 3 : Number(params.maxDepth);
  if (!Number.isInteger(depth) || depth < 1 || depth > 4) throw navigationError('NAVIGATION_PAGES_DEPTH_INVALID');
  const request = (event, args) => requestBackendEvent(emitter, event, { jwt, moduleName: 'pagesManager', moduleType: 'core', ...args });
  const rows = await request(BACKEND_EVENTS.GET_ALL_PAGES, {});
  if (!Array.isArray(rows) || rows.length > 2048) throw new Error('NAVIGATION_PAGES_LIST_INVALID');
  const parent = rows.find(page => pageId(page) === String(params.parentId));
  if (!parent || !visible(parent)) throw navigationError('NAVIGATION_PAGES_PARENT_UNAVAILABLE', 404);
  const seen = new Set([pageId(parent)]);
  let count = 0;
  async function children(id, level) {
    if (level > depth) return [];
    const candidates = rows.filter(page => String(page.parentId ?? page.parent_id ?? '') === id && visible(page))
      .sort((a, b) => (Number(a.weight) || 0) - (Number(b.weight) || 0) || pageId(a).localeCompare(pageId(b), 'en'));
    const items = [];
    for (const page of candidates) {
      const id = pageId(page);
      if (seen.has(id)) throw new Error('NAVIGATION_PAGES_CYCLE');
      seen.add(id);
      if (++count > 256) throw new Error('NAVIGATION_PAGES_LIMIT_EXCEEDED');
      const localized = await request(BACKEND_EVENTS.GET_PAGE_BY_ID, { pageId: id, language });
      if (!localized || !visible(localized)) continue;
      // Omit a missing secondary translation instead of presenting another locale's article as translated.
      const transLang = localized.trans_lang || localized.translation?.language;
      if (transLang !== language && String(localized.language || '').toLowerCase() !== language) continue;
      const meta = metaOf(localized);
      const short = typeof meta.navigationTitles?.[language] === 'string' ? meta.navigationTitles[language].trim().slice(0, 120) : '';
      const title = localized.trans_title || localized.translation?.title || localized.title || '';
      const slug = String(localized.slug || '').replace(/^\/+|\/+$/g, '');
      if (!slug || /[?#\s\\]/.test(slug)) throw new Error('NAVIGATION_PAGES_ADDRESS_INVALID');
      items.push({ id: `page:${id}`, title: short || title, url: `/${slug}?lang=${encodeURIComponent(language)}`, status: 'active', position: Number(page.weight) || 0,
        children: await children(id, level + 1) });
    }
    return items;
  }
  const tree = await children(pageId(parent), 1);
  return { menu: { id: `pages:${pageId(parent)}`, title: parent.title, status: 'active' }, tree, items: tree };
}
module.exports = { pageNavigationTree };
