'use strict';

const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');

const SKIPPED_POST_TYPES = new Set([
  'revision',
  'nav_menu_item',
  'custom_css',
  'customize_changeset',
  'oembed_cache',
  'wp_block',
  'wp_global_styles',
  'wp_navigation',
  'wp_template',
  'wp_template_part'
]);

function asArray(value) {
  if (typeof value === 'undefined' || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  if (typeof value === 'undefined' || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value._ !== 'undefined') return String(value._);
  if (typeof value['#text'] !== 'undefined') return String(value['#text']);
  return '';
}

function attr(value, key) {
  if (!value || typeof value !== 'object') return '';
  return String(value.$?.[key] || value[key] || '');
}

function normalizeKey(raw, fallback = '') {
  const value = String(raw || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return value || fallback;
}

function normalizeSlug(raw, fallback = 'item') {
  const slug = String(raw || fallback)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 180);
  return slug || fallback;
}

function normalizeWpTermDomain(raw) {
  const key = normalizeKey(raw, 'category');
  if (key === 'post-tag') return 'post_tag';
  return key;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch] || ch));
}

function normalizeStatus(raw) {
  switch (String(raw || '').toLowerCase()) {
    case 'publish':
    case 'published':
      return 'published';
    case 'future':
      return 'scheduled';
    case 'pending':
      return 'review';
    case 'private':
      return 'private';
    case 'trash':
      return 'deleted';
    case 'draft':
    default:
      return 'draft';
  }
}

function normalizeCommentStatus(raw) {
  const value = String(raw || '').toLowerCase();
  if (value === '1' || value === 'approve' || value === 'approved') return 'approved';
  if (value === 'spam') return 'spam';
  if (value === 'trash') return 'trash';
  return 'pending';
}

function normalizeWpDate(raw) {
  const value = text(raw).trim();
  if (!value || value.startsWith('0000-00-00')) return null;
  const candidate = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function metaPairs(rawMeta) {
  const result = {};
  for (const meta of asArray(rawMeta)) {
    const key = text(meta['wp:meta_key']).trim();
    if (!key) continue;
    const value = text(meta['wp:meta_value']);
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

const WORDPRESS_LANGUAGE_META_KEYS = [
  '_wpml_language',
  'wpml_language',
  'wpml_language_code',
  '_icl_lang',
  'icl_language_code',
  '_language',
  'language',
  'lang',
  'locale',
  '_locale',
  'pll_language',
  '_pll_language'
];

const WORDPRESS_TRANSLATION_GROUP_META_KEYS = [
  '_wpml_trid',
  'wpml_trid',
  'trid',
  '_translation_group',
  'translation_group',
  'pll_translation_group'
];

const WORDPRESS_TRANSLATION_SOURCE_META_KEYS = [
  '_icl_lang_duplicate_of',
  '_icl_translation_of',
  '_translation_source',
  'translation_source'
];

function firstMetaValue(value) {
  if (Array.isArray(value)) {
    return value.map(firstMetaValue).find(Boolean) || '';
  }
  return String(value ?? '').trim();
}

function normalizeLanguageCode(value) {
  const raw = firstMetaValue(value).replace(/_/g, '-').toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(raw) ? raw : '';
}

function languageFromTerms(terms = []) {
  for (const term of asArray(terms)) {
    const domain = String(term?.wpDomain || term?.sourceDomain || '').toLowerCase();
    if (!domain.includes('language') && !domain.includes('translation')) continue;
    const language = normalizeLanguageCode(term.slug || term.name);
    if (language) return language;
  }
  return '';
}

function detectWordPressLanguage(metadata = {}, terms = []) {
  for (const key of WORDPRESS_LANGUAGE_META_KEYS) {
    const language = normalizeLanguageCode(metadata[key]);
    if (language) return language;
  }
  return languageFromTerms(terms) || 'en';
}

function firstExistingMeta(metadata = {}, keys = []) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) continue;
    const value = firstMetaValue(metadata[key]);
    if (value) return value;
  }
  return '';
}

function detectWordPressTranslationHints(metadata = {}) {
  const groupId = firstExistingMeta(metadata, WORDPRESS_TRANSLATION_GROUP_META_KEYS);
  const sourceId = firstExistingMeta(metadata, WORDPRESS_TRANSLATION_SOURCE_META_KEYS);
  if (!groupId && !sourceId) return null;
  return {
    ...(groupId ? { groupId } : {}),
    ...(sourceId ? { sourceId } : {})
  };
}

function fileNameFromUrl(rawUrl, fallback = 'attachment') {
  try {
    const url = new URL(rawUrl);
    const base = path.posix.basename(url.pathname);
    return base || fallback;
  } catch {
    const base = path.posix.basename(String(rawUrl || '').split('?')[0]);
    return base || fallback;
  }
}

function inferMimeType(item, url) {
  const explicit = text(item['wp:post_mime_type']).trim();
  if (explicit) return explicit;
  const ext = path.extname(fileNameFromUrl(url)).toLowerCase();
  if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function normalizeItemTerm(rawTerm) {
  const domain = attr(rawTerm, 'domain');
  const name = text(rawTerm).trim();
  if (!domain || !name) return null;
  const wpDomain = normalizeWpTermDomain(domain);
  const slug = normalizeSlug(attr(rawTerm, 'nicename') || name);
  return {
    wpDomain,
    slug,
    name,
    sourceDomain: domain
  };
}

function normalizeChannelCategory(rawTerm) {
  const name = text(rawTerm['wp:cat_name']).trim();
  if (!name) return null;
  return {
    wpDomain: 'category',
    sourceId: text(rawTerm['wp:term_id']),
    slug: normalizeSlug(text(rawTerm['wp:category_nicename']) || name),
    name,
    parentSlug: normalizeSlug(text(rawTerm['wp:category_parent']) || '', ''),
    description: text(rawTerm['wp:category_description'])
  };
}

function normalizeChannelTag(rawTerm) {
  const name = text(rawTerm['wp:tag_name']).trim();
  if (!name) return null;
  return {
    wpDomain: 'post_tag',
    sourceId: text(rawTerm['wp:term_id']),
    slug: normalizeSlug(text(rawTerm['wp:tag_slug']) || name),
    name,
    parentSlug: '',
    description: text(rawTerm['wp:tag_description'])
  };
}

function normalizeChannelTerm(rawTerm) {
  const name = text(rawTerm['wp:term_name']).trim();
  const wpDomain = normalizeWpTermDomain(text(rawTerm['wp:term_taxonomy']));
  if (!name || !wpDomain) return null;
  return {
    wpDomain,
    sourceId: text(rawTerm['wp:term_id']),
    slug: normalizeSlug(text(rawTerm['wp:term_slug']) || name),
    name,
    parentSlug: normalizeSlug(text(rawTerm['wp:term_parent']) || '', ''),
    description: text(rawTerm['wp:term_description'])
  };
}

function normalizeAuthor(rawAuthor) {
  const login = text(rawAuthor['wp:author_login']).trim();
  if (!login) return null;
  return {
    sourceId: text(rawAuthor['wp:author_id']),
    login,
    email: text(rawAuthor['wp:author_email']).trim(),
    displayName: text(rawAuthor['wp:author_display_name']).trim() || login,
    firstName: text(rawAuthor['wp:author_first_name']).trim(),
    lastName: text(rawAuthor['wp:author_last_name']).trim()
  };
}

function normalizeAttachment(item) {
  const sourceId = text(item['wp:post_id']).trim() || text(item.guid).trim();
  const url = text(item['wp:attachment_url']).trim() || text(item.guid).trim();
  const title = text(item.title).trim() || fileNameFromUrl(url, `attachment-${sourceId || 'item'}`);
  const fileName = fileNameFromUrl(url, normalizeSlug(title));
  const metadata = metaPairs(item['wp:postmeta']);
  return {
    sourceId,
    title,
    slug: normalizeSlug(text(item['wp:post_name']) || title),
    fileName,
    originalUrl: url,
    storagePath: url,
    mimeType: inferMimeType(item, url),
    status: normalizeStatus(text(item['wp:status'])),
    publishedAt: normalizeWpDate(item['wp:post_date_gmt'] || item.pubDate),
    parentSourceId: text(item['wp:post_parent']).trim(),
    description: text(item['content:encoded']),
    caption: text(item.excerpt),
    metadata
  };
}

function normalizeComment(rawComment, postSourceId) {
  const sourceId = text(rawComment['wp:comment_id']).trim();
  const content = text(rawComment['wp:comment_content']).trim();
  if (!sourceId || !content) return null;
  return {
    sourceId,
    postSourceId,
    parentSourceId: text(rawComment['wp:comment_parent']).trim(),
    authorName: text(rawComment['wp:comment_author']).trim(),
    authorEmail: text(rawComment['wp:comment_author_email']).trim(),
    authorUrl: text(rawComment['wp:comment_author_url']).trim(),
    authorIp: text(rawComment['wp:comment_author_IP']).trim(),
    content,
    status: normalizeCommentStatus(text(rawComment['wp:comment_approved'])),
    createdAt: normalizeWpDate(rawComment['wp:comment_date_gmt'] || rawComment['wp:comment_date']),
    meta: metaPairs(rawComment['wp:commentmeta'])
  };
}

function normalizeContentItem(item) {
  const postType = normalizeKey(text(item['wp:post_type']) || 'post', 'post');
  const sourceId = text(item['wp:post_id']).trim() || text(item.guid).trim();
  const title = text(item.title).trim() || `(untitled ${postType})`;
  const status = normalizeStatus(text(item['wp:status']));
  const metadata = metaPairs(item['wp:postmeta']);
  const wordpressTerms = asArray(item.category).map(normalizeItemTerm).filter(Boolean);
  const language = detectWordPressLanguage(metadata, wordpressTerms);
  const translation = detectWordPressTranslationHints(metadata);
  const publishedAt = normalizeWpDate(item['wp:post_date_gmt'] || item.pubDate);
  const slug = normalizeSlug(text(item['wp:post_name']) || title, sourceId ? `${postType}-${sourceId}` : postType);

  return {
    sourceId,
    contentType: postType === 'page' ? 'page' : postType,
    title,
    slug,
    permalink: text(item.link).trim(),
    status,
    language,
    publishedAt,
    scheduledAt: status === 'scheduled' ? publishedAt : null,
    parentSourceId: text(item['wp:post_parent']).trim(),
    menuOrder: Number(text(item['wp:menu_order'])) || 0,
    authorLogin: text(item['dc:creator']).trim(),
    excerpt: text(item['excerpt:encoded'] || item.description),
    content: {
      format: 'wordpress',
      html: text(item['content:encoded']),
      raw: text(item['content:encoded'])
    },
    comments: asArray(item['wp:comment']).map(comment => normalizeComment(comment, sourceId)).filter(Boolean),
    metadata: {
      ...metadata,
      wordpress: {
        postId: sourceId,
        postType,
        guid: text(item.guid).trim(),
        link: text(item.link).trim(),
        menuOrder: Number(text(item['wp:menu_order'])) || 0,
        terms: wordpressTerms,
        language,
        ...(translation ? { translation } : {})
      }
    }
  };
}

function addUniqueWordPressTerm(map, term) {
  if (!term || !term.wpDomain || !term.slug) return;
  const key = `${term.wpDomain}:${term.slug}`;
  if (!map.has(key)) {
    map.set(key, term);
  }
}

function isCollectionTerm(term) {
  return term?.wpDomain === 'category' && Boolean(term.slug);
}

function collectionDepth(collection, bySlug, seen = new Set()) {
  if (!collection?.parentSlug || seen.has(collection.slug)) return 0;
  const parent = bySlug.get(collection.parentSlug);
  if (!parent) return 0;
  seen.add(collection.slug);
  return 1 + collectionDepth(parent, bySlug, seen);
}

function buildCollectionPlans(terms = [], entries = []) {
  const categories = new Map();
  for (const term of terms) {
    if (!isCollectionTerm(term)) continue;
    categories.set(term.slug, {
      sourceId: term.sourceId || `category:${term.slug}`,
      slug: term.slug,
      title: term.name || term.slug,
      description: term.description || '',
      parentSlug: term.parentSlug || '',
      wpDomain: term.wpDomain,
      term: { ...term },
      entrySourceIds: []
    });
  }

  for (const entry of entries) {
    const seenForEntry = new Set();
    for (const term of asArray(entry.metadata?.wordpress?.terms)) {
      if (!isCollectionTerm(term)) continue;
      if (!categories.has(term.slug)) {
        categories.set(term.slug, {
          sourceId: term.sourceId || `category:${term.slug}`,
          slug: term.slug,
          title: term.name || term.slug,
          description: '',
          parentSlug: '',
          wpDomain: term.wpDomain,
          term: { ...term },
          entrySourceIds: []
        });
      }
      if (!seenForEntry.has(term.slug)) {
        categories.get(term.slug).entrySourceIds.push(entry.sourceId);
        seenForEntry.add(term.slug);
      }
    }
  }

  const collections = Array.from(categories.values());
  const bySlug = new Map(collections.map(collection => [collection.slug, collection]));
  return collections.sort((left, right) => {
    const depthDiff = collectionDepth(left, bySlug) - collectionDepth(right, bySlug);
    return depthDiff || left.title.localeCompare(right.title);
  });
}

function primaryCollectionForEntry(entry, collections = []) {
  const bySlug = new Map(collections.map(collection => [collection.slug, collection]));
  return asArray(entry.metadata?.wordpress?.terms)
    .filter(isCollectionTerm)
    .map(term => bySlug.get(term.slug))
    .find(Boolean) || null;
}

function entryPageStatus(status) {
  return status === 'published' ? 'published' : status === 'deleted' ? 'deleted' : 'draft';
}

function collectionChildSlug(entry, collection) {
  const entrySlug = normalizeSlug(entry.slug || entry.title || entry.sourceId, entry.sourceId || 'entry');
  if (!collection?.slug) return entrySlug;
  if (entrySlug === collection.slug || entrySlug.startsWith(`${collection.slug}/`)) return entrySlug;
  return `${collection.slug}/${entrySlug}`;
}

function entryTranslation(entry, language = entry.language || 'en') {
  return {
    language,
    title: entry.title,
    html: entry.content?.html || entry.content?.raw || '',
    metaDesc: entry.excerpt || '',
    seoTitle: entry.title,
    seoKeywords: asArray(entry.metadata?.wordpress?.terms).map(term => term.name).filter(Boolean).join(', ')
  };
}

function emptyPlan(warnings = []) {
  return {
    source: 'wordpress',
    dryRun: true,
    site: {},
    authors: [],
    sourceWordPressTerms: [],
    collections: [],
    entries: [],
    attachments: [],
    comments: [],
    skipped: [],
    totals: {
      authors: 0,
      sourceWordPressTerms: 0,
      collections: 0,
      entries: 0,
      attachments: 0,
      comments: 0,
      skipped: 0
    },
    warnings
  };
}

async function readXml(options = {}) {
  if (typeof options.xml === 'string') return options.xml;
  if (Buffer.isBuffer(options.buffer)) return options.buffer.toString('utf8');
  const filePath = options.filePath || options.path;
  if (filePath) {
    return fs.promises.readFile(path.resolve(filePath), 'utf8');
  }
  return '';
}

async function buildImportPlan(options = {}) {
  const xml = await readXml(options);
  if (!xml.trim()) {
    return emptyPlan(['No WordPress WXR XML provided. Pass options.xml, options.buffer or options.filePath.']);
  }

  const doc = await parseStringPromise(xml, {
    explicitArray: false,
    trim: false,
    normalizeTags: false,
    attrkey: '$',
    charkey: '_'
  });

  const channel = doc?.rss?.channel || doc?.channel;
  if (!channel) {
    throw new Error('Invalid WordPress WXR export: missing rss/channel.');
  }

  const entries = [];
  const attachments = [];
  const comments = [];
  const skipped = [];
  const wordpressTermMap = new Map();

  for (const rawTerm of asArray(channel['wp:category']).map(normalizeChannelCategory)) {
    addUniqueWordPressTerm(wordpressTermMap, rawTerm);
  }
  for (const rawTerm of asArray(channel['wp:tag']).map(normalizeChannelTag)) {
    addUniqueWordPressTerm(wordpressTermMap, rawTerm);
  }
  for (const rawTerm of asArray(channel['wp:term']).map(normalizeChannelTerm)) {
    addUniqueWordPressTerm(wordpressTermMap, rawTerm);
  }

  for (const item of asArray(channel.item)) {
    const postType = normalizeKey(text(item['wp:post_type']) || 'post', 'post');
    if (postType === 'attachment') {
      attachments.push(normalizeAttachment(item));
      continue;
    }
    if (SKIPPED_POST_TYPES.has(postType)) {
      skipped.push({
        sourceId: text(item['wp:post_id']).trim(),
        postType,
        title: text(item.title).trim()
      });
      continue;
    }

    const entry = normalizeContentItem(item);
    entries.push(entry);
    comments.push(...entry.comments);
    for (const term of entry.metadata.wordpress.terms) addUniqueWordPressTerm(wordpressTermMap, term);
  }

  const sourceWordPressTerms = Array.from(wordpressTermMap.values()).sort((a, b) =>
    `${a.wpDomain}:${a.slug}`.localeCompare(`${b.wpDomain}:${b.slug}`)
  );
  const collections = buildCollectionPlans(sourceWordPressTerms, entries);
  const authors = asArray(channel['wp:author']).map(normalizeAuthor).filter(Boolean);
  const plan = {
    source: 'wordpress',
    dryRun: options.dryRun !== false,
    site: {
      title: text(channel.title).trim(),
      link: text(channel.link).trim(),
      description: text(channel.description).trim(),
      wxrVersion: text(channel['wp:wxr_version']).trim(),
      baseSiteUrl: text(channel['wp:base_site_url']).trim(),
      baseBlogUrl: text(channel['wp:base_blog_url']).trim()
    },
    authors,
    sourceWordPressTerms,
    collections,
    entries,
    attachments,
    comments,
    skipped,
    totals: {
      authors: authors.length,
      sourceWordPressTerms: sourceWordPressTerms.length,
      collections: collections.length,
      entries: entries.length,
      attachments: attachments.length,
      comments: comments.length,
      skipped: skipped.length
    },
    warnings: []
  };

  if (!plan.entries.length && !plan.attachments.length) {
    plan.warnings.push('WXR parsed successfully but no importable posts, pages or attachments were found.');
  }
  return plan;
}

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function resultId(result, keys, fallback) {
  for (const key of keys) {
    if (result && typeof result[key] !== 'undefined' && result[key] !== null) {
      return result[key];
    }
  }
  return fallback;
}

function canEmit(motherEmitter, eventName) {
  if (!motherEmitter) return false;
  if (typeof motherEmitter.listenerCount !== 'function') return true;
  return motherEmitter.listenerCount(eventName) > 0;
}

async function createCollectionPages(plan, options, decodedJWT) {
  const { motherEmitter, jwt } = options;
  const collectionPageIds = new Map();
  const applied = [];
  const warnings = [];
  if (!plan.collections.length) return { collectionPageIds, applied, warnings };
  if (options.createPages === false) {
    warnings.push('WORDPRESS_COLLECTION_PAGES_DISABLED: category collections were planned but page creation was disabled.');
    return { collectionPageIds, applied, warnings };
  }
  if (!canEmit(motherEmitter, 'createPage')) {
    warnings.push('WORDPRESS_COLLECTION_PAGES_UNAVAILABLE: pagesManager.createPage was unavailable, so category collections stayed as metadata.');
    return { collectionPageIds, applied, warnings };
  }

  const pageBase = { jwt, moduleName: 'pagesManager', moduleType: 'core', decodedJWT };
  for (const collection of plan.collections) {
    const parentId = collection.parentSlug ? collectionPageIds.get(collection.parentSlug) || null : null;
    const result = await emitAsync(motherEmitter, 'createPage', {
      ...pageBase,
      title: collection.title,
      slug: collection.slug,
      status: 'published',
      lane: 'public',
      language: 'en',
      parent_id: parentId,
      is_content: false,
      translations: [{
        language: 'en',
        title: collection.title,
        html: collection.description ? `<p>${escapeHtml(collection.description)}</p>` : '',
        metaDesc: collection.description || '',
        seoTitle: collection.title
      }],
      meta: {
        isCollection: true,
        source: 'wordpress',
        wordpress: {
          term: collection.term,
          wpDomain: collection.wpDomain,
          sourceId: collection.sourceId,
          entrySourceIds: collection.entrySourceIds
        }
      },
      autoSuffixSlug: true,
      skipContentMirror: true
    });
    const pageId = resultId(result, ['pageId', 'id', 'insertedId'], collection.slug);
    collectionPageIds.set(collection.slug, pageId);
    applied.push({ slug: collection.slug, sourceId: collection.sourceId, pageId, result });
  }

  return { collectionPageIds, applied, warnings };
}

async function createEntryPageProjection(entry, context) {
  const { motherEmitter, jwt, decodedJWT, entryId, collections, collectionPageIds, entryPageIds, options } = context;
  if (options.createPages === false || !canEmit(motherEmitter, 'createPage')) return null;

  const language = entry.language || 'en';
  const primaryCollection = primaryCollectionForEntry(entry, collections);
  const parentId = entry.parentSourceId
    ? entryPageIds.get(entry.parentSourceId) || null
    : primaryCollection
      ? collectionPageIds.get(primaryCollection.slug) || null
      : null;
  const pageSlug = collectionChildSlug(entry, primaryCollection);
  const wordpressMeta = entry.metadata?.wordpress || {};
  const result = await emitAsync(motherEmitter, 'createPage', {
    jwt,
    moduleName: 'pagesManager',
    moduleType: 'core',
    decodedJWT,
    title: entry.title,
    slug: pageSlug,
    status: entryPageStatus(entry.status),
    lane: 'public',
    language,
    parent_id: parentId,
    is_content: true,
    translations: [entryTranslation(entry, language)],
    meta: {
      source: 'wordpress',
      sourceModule: 'wordpress',
      sourceId: entry.sourceId,
      contentEntryId: entryId,
      isCollectionChild: Boolean(parentId),
      primaryCollection: primaryCollection
        ? {
          slug: primaryCollection.slug,
          title: primaryCollection.title,
          sourceId: primaryCollection.sourceId
        }
        : null,
      wordpress: {
        postId: wordpressMeta.postId || entry.sourceId,
        postType: wordpressMeta.postType || entry.contentType,
        terms: wordpressMeta.terms || []
      }
    },
    autoSuffixSlug: true,
    skipContentMirror: true
  });
  const pageId = resultId(result, ['pageId', 'id', 'insertedId'], pageSlug);
  entryPageIds.set(entry.sourceId, pageId);
  return { sourceId: entry.sourceId, slug: pageSlug, parentId, pageId, result };
}

async function applyImportPlan(plan, options = {}) {
  const { motherEmitter, jwt } = options;
  if (!motherEmitter) {
    return {
      applied: false,
      warnings: ['No motherEmitter available; returning dry-run import plan only.']
    };
  }

  const decodedJWT = { permissions: { '*': true } };
  const contentBase = { jwt, moduleName: 'contentEngine', moduleType: 'core', decodedJWT };
  const mediaBase = { jwt, moduleName: 'mediaManager', moduleType: 'core', decodedJWT };
  const commentBase = { jwt, moduleName: 'commentsManager', moduleType: 'core', decodedJWT };
  const applied = {
    contentTypes: [],
    collections: [],
    pageEntries: [],
    entries: [],
    attachments: [],
    comments: [],
    warnings: []
  };
  const entryIds = new Map();
  const entryPageIds = new Map();

  const collectionPages = await createCollectionPages(plan, options, decodedJWT);
  applied.collections.push(...collectionPages.applied);
  applied.warnings.push(...collectionPages.warnings);

  const contentTypes = new Set(plan.entries.map(entry => entry.contentType));
  for (const contentType of contentTypes) {
    const result = await emitAsync(motherEmitter, 'registerContentType', {
      ...contentBase,
      key: contentType,
      label: contentType.replace(/[_-]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()),
      description: 'Imported from WordPress WXR',
      settings: { source: 'wordpress' }
    });
    applied.contentTypes.push({ key: contentType, result });
  }

  for (const attachment of plan.attachments) {
    const result = await emitAsync(motherEmitter, 'createMediaAttachment', {
      ...mediaBase,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      url: attachment.originalUrl,
      storagePath: '',
      title: attachment.title,
      altText: attachment.title,
      caption: attachment.caption,
      description: attachment.description,
      status: attachment.status === 'deleted' ? 'archived' : 'active',
      visibility: attachment.status === 'private' ? 'private' : 'public',
      sourceModule: 'wordpress',
      sourceId: attachment.sourceId,
      meta: {
        ...attachment.metadata,
        originalUrl: attachment.originalUrl,
        parentSourceId: attachment.parentSourceId
      }
    });
    applied.attachments.push({ sourceId: attachment.sourceId, result });
  }

  for (const entry of plan.entries) {
    const result = await emitAsync(motherEmitter, 'createContentEntry', {
      ...contentBase,
      contentType: entry.contentType,
      title: entry.title,
      slug: entry.slug,
      permalink: entry.permalink,
      status: entry.status,
      publishedAt: entry.publishedAt,
      language: entry.language || 'en',
      parentId: entry.parentSourceId ? entryIds.get(entry.parentSourceId) || null : null,
      sourceModule: 'wordpress',
      sourceId: entry.sourceId,
      excerpt: entry.excerpt,
      content: entry.content,
      meta: {
        ...entry.metadata,
        blogposter: {
          ...(entry.metadata.blogposter || {}),
          primaryCollection: (() => {
            const collection = primaryCollectionForEntry(entry, plan.collections);
            return collection
              ? { slug: collection.slug, title: collection.title, sourceId: collection.sourceId }
              : null;
          })()
        }
      }
    });
    const entryId = resultId(result, ['entryId', 'id'], entry.sourceId);
    entryIds.set(entry.sourceId, entryId);
    applied.entries.push({ sourceId: entry.sourceId, result });
    try {
      const pageProjection = await createEntryPageProjection(entry, {
        motherEmitter,
        jwt,
        decodedJWT,
        entryId,
        collections: plan.collections,
        collectionPageIds: collectionPages.collectionPageIds,
        entryPageIds,
        options
      });
      if (pageProjection) applied.pageEntries.push(pageProjection);
    } catch (err) {
      applied.warnings.push(`WORDPRESS_ENTRY_PAGE_CREATE_FAILED: ${entry.sourceId} - ${err.message}`);
    }
  }

  for (const comment of plan.comments) {
    const targetId = entryIds.get(comment.postSourceId);
    if (!targetId) continue;
    const result = await emitAsync(motherEmitter, 'createComment', {
      ...commentBase,
      entryId: targetId,
      authorName: comment.authorName,
      authorEmail: comment.authorEmail,
      authorUrl: comment.authorUrl,
      content: comment.content,
      status: comment.status,
      parentId: comment.parentSourceId || null,
      meta: {
        ...comment.meta,
        source: 'wordpress',
        sourceId: comment.sourceId,
        authorIp: comment.authorIp,
        createdAt: comment.createdAt
      }
    });
    applied.comments.push({ sourceId: comment.sourceId, result });
  }

  return { applied: true, ...applied };
}

module.exports = {
  name: 'wordpress',
  description: 'Import a WordPress WXR export into the Blogposter content engine.',

  async import(options = {}) {
    const plan = await buildImportPlan(options);
    if (options.dryRun !== false) {
      return { success: true, dryRun: true, plan };
    }

    const applied = await applyImportPlan(plan, options);
    return { success: true, dryRun: false, plan, applied };
  },

  _internals: {
    asArray,
    buildCollectionPlans,
    buildImportPlan,
    primaryCollectionForEntry,
    normalizeAttachment,
    normalizeContentItem,
    detectWordPressLanguage,
    detectWordPressTranslationHints,
    normalizeStatus,
    normalizeWpDate,
    text
  }
};
