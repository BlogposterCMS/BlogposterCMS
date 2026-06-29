import { normalizeLinkUrl, normalizeMediaUrl, readArray, readNumber, readString, renderWidgetMessage, sharedStyle, widgetSettings } from './publicWidgetHelpers.js';
function collectionArchiveStyle() {
    const style = document.createElement('style');
    style.textContent = `
.bp-collection-archive {
  display: grid;
  gap: 18px;
  min-height: 100%;
}
.bp-collection-archive__grid {
  display: grid;
  grid-template-columns: repeat(var(--bp-collection-columns, 3), minmax(0, 1fr));
  gap: var(--bp-collection-gap, 18px);
}
.bp-collection-archive__card {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--studio-border);
  border-radius: 8px;
  background: var(--studio-surface);
}
.bp-collection-archive__media {
  display: block;
  aspect-ratio: 16 / 9;
  background: var(--studio-surface-muted);
  overflow: hidden;
}
.bp-collection-archive__media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.bp-collection-archive__body {
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 14px;
}
.bp-collection-archive__title {
  margin: 0;
  color: var(--studio-text);
  font-family: var(--font-heading);
  font-size: 1.05rem;
  line-height: 1.2;
  letter-spacing: 0;
}
.bp-collection-archive__description {
  margin: 0;
  color: var(--studio-text-muted);
  font-size: 0.925rem;
  line-height: 1.45;
}
.bp-collection-archive__action {
  justify-self: start;
  margin: 0 14px 14px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--color-primary);
  color: var(--color-on-primary, #fff);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
}
@media (max-width: 760px) {
  .bp-collection-archive__grid {
    grid-template-columns: 1fr;
  }
}
  `.trim();
    return style;
}
function parseMeta(page) {
    if (!page.meta)
        return {};
    if (typeof page.meta === 'object' && !Array.isArray(page.meta))
        return page.meta;
    if (typeof page.meta !== 'string')
        return {};
    try {
        const parsed = JSON.parse(page.meta);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
function normalizeSlug(value) {
    return String(value || '').replace(/^\/+/, '').replace(/\/+$/, '');
}
function firstString(...values) {
    for (const value of values) {
        const text = typeof value === 'string' ? value.trim() : '';
        if (text)
            return text;
    }
    return '';
}
function normalizePageItem(page) {
    if (!page || page.status === 'deleted')
        return null;
    const meta = parseMeta(page);
    const slug = normalizeSlug(page.slug || meta.slug);
    const href = normalizeLinkUrl(firstString(page.url, page.href, meta.url, slug ? `/${slug}` : ''));
    const title = firstString(page.title, meta.title, meta.seoTitle, 'Untitled page');
    const description = firstString(page.description, page.excerpt, page.summary, meta.seoDescription, meta.description, meta.excerpt, meta.summary);
    const image = normalizeMediaUrl(firstString(page.image, page.imageUrl, page.featuredImage, page.featured_image, meta.image, meta.imageUrl, meta.featuredImage, meta.featuredImageUrl, meta.featured_media_url));
    return {
        id: String(page.id ?? page._id ?? slug ?? title),
        title,
        description,
        href: href || (slug ? `/${slug}` : '#'),
        image,
        imageAlt: firstString(page.alt, page.altText, meta.alt, meta.altText, title)
    };
}
function toPages(value) {
    if (Array.isArray(value))
        return value.filter((item) => Boolean(item) && typeof item === 'object');
    if (value && typeof value === 'object' && Array.isArray(value.data)) {
        return (value.data || []).filter((item) => Boolean(item) && typeof item === 'object');
    }
    return [];
}
function styleSourceIdFor(ctx) {
    const raw = String(ctx.id || ctx.widgetId || 'default').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
    return `collection-card-template-${raw || 'default'}`;
}
function resolveEmit(ctx) {
    return typeof ctx.emit === 'function'
        ? ctx.emit
        : (typeof window !== 'undefined' && typeof window.meltdownEmit === 'function' ? window.meltdownEmit : undefined);
}
async function loadArchiveItems(settings, ctx) {
    const manualItems = readArray(settings, ['items', 'pages']);
    if (manualItems.length) {
        return toPages(manualItems).map(normalizePageItem).filter((item) => Boolean(item));
    }
    const parentId = readString(settings, ['collectionId', 'parentId', 'pageId']);
    if (!parentId) {
        throw new Error('BP_COLLECTION_ARCHIVE_COLLECTION_MISSING');
    }
    const emit = resolveEmit(ctx);
    if (!emit) {
        throw new Error('BP_COLLECTION_ARCHIVE_EMIT_UNAVAILABLE');
    }
    const response = await emit('getChildPages', {
        parentId,
        lane: 'public',
        moduleName: 'pagesManager',
        moduleType: 'core'
    });
    return toPages(response).map(normalizePageItem).filter((item) => Boolean(item));
}
function renderArchiveCard(item, index, buttonLabel, styleSourceId) {
    const card = document.createElement('article');
    card.className = 'bp-collection-archive__card';
    card.dataset.itemId = item.id;
    card.dataset.styleSourceRole = index === 0 ? 'source' : 'follower';
    card.dataset.styleSourceEnabled = 'true';
    card.dataset.styleSyncLayout = 'true';
    card.dataset.styleSyncDesign = 'true';
    if (index === 0)
        card.id = styleSourceId;
    if (index > 0)
        card.dataset.styleSourceId = styleSourceId;
    const media = document.createElement(item.href ? 'a' : 'span');
    media.className = 'bp-collection-archive__media';
    if (item.href)
        media.href = item.href;
    if (item.image) {
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.imageAlt;
        img.loading = 'lazy';
        img.decoding = 'async';
        media.appendChild(img);
    }
    const body = document.createElement('div');
    body.className = 'bp-collection-archive__body';
    const title = document.createElement('h3');
    title.className = 'bp-collection-archive__title';
    title.textContent = item.title;
    const description = document.createElement('p');
    description.className = 'bp-collection-archive__description';
    description.textContent = item.description;
    body.append(title, description);
    const action = document.createElement('a');
    action.className = 'bp-collection-archive__action';
    action.href = item.href;
    action.textContent = buttonLabel || 'Read more';
    card.append(media, body, action);
    return card;
}
export async function render(el, ctx = {}) {
    if (!el)
        return;
    const settings = widgetSettings(ctx, {
        columns: 3,
        gap: '18px',
        buttonLabel: 'Read more'
    });
    let items;
    try {
        items = await loadArchiveItems(settings, ctx);
    }
    catch (err) {
        const code = err instanceof Error && err.message.startsWith('BP_COLLECTION_ARCHIVE_')
            ? err.message
            : 'BP_COLLECTION_ARCHIVE_LOAD_FAILED';
        renderWidgetMessage(el, code, 'Collection archive unavailable', err instanceof Error ? err.message : String(err));
        return;
    }
    if (!items.length) {
        renderWidgetMessage(el, 'BP_COLLECTION_ARCHIVE_EMPTY', 'No pages found', 'The selected collection has no public child pages.');
        return;
    }
    const wrapper = document.createElement('section');
    wrapper.className = 'bp-public-widget bp-collection-archive';
    const columns = Math.max(1, Math.min(6, Math.round(readNumber(settings, ['columns'], 3))));
    wrapper.style.setProperty('--bp-collection-columns', String(columns));
    const gap = readString(settings, ['gap'], '18px');
    if (/^\d+(?:\.\d+)?(?:px|rem|em|%)$/i.test(gap)) {
        wrapper.style.setProperty('--bp-collection-gap', gap);
    }
    const grid = document.createElement('div');
    grid.className = 'bp-collection-archive__grid';
    const buttonLabel = readString(settings, ['buttonLabel', 'ctaLabel'], 'Read more');
    const styleSourceId = styleSourceIdFor(ctx);
    items.forEach((item, index) => grid.appendChild(renderArchiveCard(item, index, buttonLabel, styleSourceId)));
    wrapper.appendChild(grid);
    el.replaceChildren(sharedStyle(), collectionArchiveStyle(), wrapper);
}
