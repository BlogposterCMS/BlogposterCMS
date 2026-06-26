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
  const publishedAt = normalizeWpDate(item['wp:post_date_gmt'] || item.pubDate);
  const slug = normalizeSlug(text(item['wp:post_name']) || title, sourceId ? `${postType}-${sourceId}` : postType);

  return {
    sourceId,
    contentType: postType === 'page' ? 'page' : postType,
    title,
    slug,
    permalink: text(item.link).trim(),
    status,
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
        terms: wordpressTerms
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

function emptyPlan(warnings = []) {
  return {
    source: 'wordpress',
    dryRun: true,
    site: {},
    authors: [],
    legacyWordPressTerms: [],
    entries: [],
    attachments: [],
    comments: [],
    skipped: [],
    totals: {
      authors: 0,
      legacyWordPressTerms: 0,
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

  const legacyWordPressTerms = Array.from(wordpressTermMap.values()).sort((a, b) =>
    `${a.wpDomain}:${a.slug}`.localeCompare(`${b.wpDomain}:${b.slug}`)
  );
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
    legacyWordPressTerms,
    entries,
    attachments,
    comments,
    skipped,
    totals: {
      authors: authors.length,
      legacyWordPressTerms: legacyWordPressTerms.length,
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
    entries: [],
    attachments: [],
    comments: []
  };
  const entryIds = new Map();

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
      parentId: entry.parentSourceId ? entryIds.get(entry.parentSourceId) || null : null,
      sourceModule: 'wordpress',
      sourceId: entry.sourceId,
      excerpt: entry.excerpt,
      content: entry.content,
      meta: entry.metadata
    });
    const entryId = resultId(result, ['entryId', 'id'], entry.sourceId);
    entryIds.set(entry.sourceId, entryId);
    applied.entries.push({ sourceId: entry.sourceId, result });
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
    buildImportPlan,
    normalizeAttachment,
    normalizeContentItem,
    normalizeStatus,
    normalizeWpDate,
    text
  }
};
