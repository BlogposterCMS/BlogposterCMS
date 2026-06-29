import { sanitizeHtml } from '../../../../shared/sanitize/sanitizer.js';
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function recordAt(source, key) {
    const value = source[key];
    return isRecord(value) ? value : {};
}
function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function firstString(source, keys, fallback = '') {
    for (const key of keys) {
        const value = normalizeString(source[key]);
        if (value)
            return value;
    }
    return fallback;
}
export function widgetSettings(context = {}, defaults = {}) {
    const registry = isRecord(context.metadata) ? context.metadata : {};
    const instance = isRecord(context.instanceMetadata) ? context.instanceMetadata : {};
    return {
        ...defaults,
        ...recordAt(registry, 'defaults'),
        ...recordAt(registry, 'settings'),
        ...recordAt(instance, 'defaults'),
        ...recordAt(instance, 'settings'),
        ...instance
    };
}
export function readString(source, keys, fallback = '') {
    return firstString(source, keys, fallback);
}
export function readNumber(source, keys, fallback = 0) {
    for (const key of keys) {
        const value = source[key];
        const number = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
        if (Number.isFinite(number))
            return number;
    }
    return fallback;
}
export function readBoolean(source, keys, fallback = false) {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'boolean')
            return value;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (['1', 'true', 'yes', 'on'].includes(normalized))
                return true;
            if (['0', 'false', 'no', 'off'].includes(normalized))
                return false;
        }
    }
    return fallback;
}
export function readArray(source, keys) {
    for (const key of keys) {
        const value = source[key];
        if (Array.isArray(value))
            return value;
    }
    return [];
}
function serializeSameOrigin(url) {
    return `${url.pathname}${url.search}${url.hash}`;
}
function normalizeUrl(value, protocols) {
    const raw = normalizeString(value);
    if (!raw || raw.startsWith('//') || /[\u0000-\u001f\s]/u.test(raw))
        return '';
    if (raw.startsWith('#'))
        return raw;
    const base = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://example.test';
    try {
        const url = new URL(raw, base);
        const protocol = url.protocol.replace(':', '');
        if (!protocols.includes(protocol))
            return '';
        if (url.origin === base && ['http', 'https'].includes(protocol)) {
            return serializeSameOrigin(url);
        }
        return url.href;
    }
    catch {
        return '';
    }
}
export function normalizeMediaUrl(value) {
    return normalizeUrl(value, ['http', 'https']);
}
export function normalizeLinkUrl(value) {
    return normalizeUrl(value, ['http', 'https', 'mailto', 'tel']);
}
export function normalizeAspectRatio(value) {
    const raw = normalizeString(value).toLowerCase();
    if (raw === 'square')
        return '1 / 1';
    if (raw === 'video')
        return '16 / 9';
    if (raw === 'portrait')
        return '4 / 5';
    return /^\d{1,3}\s*\/\s*\d{1,3}$/u.test(raw) ? raw.replace(/\s+/gu, ' ') : '';
}
export function renderWidgetMessage(container, code, title, detail = '') {
    const message = document.createElement('div');
    message.className = 'bp-public-widget bp-public-widget-message';
    message.dataset.errorCode = code;
    message.setAttribute('role', 'status');
    const strong = document.createElement('strong');
    strong.textContent = title;
    message.appendChild(strong);
    if (detail) {
        const body = document.createElement('span');
        body.textContent = detail;
        message.appendChild(body);
    }
    const codeNode = document.createElement('code');
    codeNode.textContent = code;
    message.appendChild(codeNode);
    container.replaceChildren(sharedStyle(), message);
}
export function sharedStyle() {
    const style = document.createElement('style');
    style.textContent = `
.bp-public-widget {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  color: var(--studio-text);
  font-family: var(--font-body);
}
.bp-public-widget *,
.bp-public-widget *::before,
.bp-public-widget *::after {
  box-sizing: border-box;
}
.bp-public-widget a {
  color: inherit;
}
.bp-public-widget-message {
  display: grid;
  align-content: center;
  gap: 6px;
  min-height: 100%;
  padding: 14px;
  border: 1px solid var(--studio-border);
  border-radius: 8px;
  background: var(--studio-surface-muted);
  color: var(--studio-text-muted);
}
.bp-public-widget-message strong {
  color: var(--studio-text);
}
.bp-public-widget-message code {
  font-family: var(--font-mono);
  font-size: 11px;
}
  `.trim();
    return style;
}
export function sanitizeRichHtml(html) {
    return sanitizeHtml(html);
}
export function normalizeMediaItems(items) {
    return items
        .map((item) => {
        if (typeof item === 'string') {
            return { src: normalizeMediaUrl(item), alt: '', caption: '', href: '' };
        }
        if (!isRecord(item))
            return null;
        const src = normalizeMediaUrl(firstString(item, ['src', 'url', 'mediaUrl', 'image']));
        if (!src)
            return null;
        const focalX = item.focalX ?? item.objectX ?? item.positionX;
        const focalY = item.focalY ?? item.objectY ?? item.positionY;
        return {
            src,
            alt: firstString(item, ['alt', 'altText', 'title']),
            caption: firstString(item, ['caption', 'description']),
            href: normalizeLinkUrl(firstString(item, ['href', 'link', 'urlTarget'])),
            fit: firstString(item, ['fit', 'imageFit']),
            objectFit: firstString(item, ['objectFit']),
            position: firstString(item, ['position', 'imagePosition']),
            objectPosition: firstString(item, ['objectPosition']),
            focalX: typeof focalX === 'string' || typeof focalX === 'number' ? focalX : undefined,
            focalY: typeof focalY === 'string' || typeof focalY === 'number' ? focalY : undefined
        };
    })
        .filter((item) => Boolean(item?.src));
}
export function normalizeNavigationItems(items) {
    return items
        .map((item) => {
        if (!isRecord(item))
            return null;
        const label = firstString(item, ['label', 'title', 'name', 'text']);
        const href = normalizeLinkUrl(firstString(item, ['href', 'url', 'path', 'permalink'])) || '#';
        if (!label)
            return null;
        const meta = isRecord(item.meta) ? item.meta : {};
        const childSource = Array.isArray(item.children)
            ? item.children
            : Array.isArray(item.items)
                ? item.items
                : [];
        return {
            id: item.id,
            parentId: (item.parentId ?? item.parent_id),
            type: firstString(item, ['type']),
            label,
            href,
            target: firstString(item, ['target']),
            rel: firstString(item, ['rel']),
            cssClass: firstString(item, ['cssClass', 'css_class']),
            status: firstString(item, ['status']),
            meta,
            children: normalizeNavigationItems(childSource)
        };
    })
        .filter((item) => Boolean(item));
}
export function currentPathSegments() {
    const pathname = typeof window !== 'undefined' ? window.location?.pathname || '/' : '/';
    return pathname.split('/').filter(Boolean);
}
