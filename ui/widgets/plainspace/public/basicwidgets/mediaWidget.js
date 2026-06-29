import { normalizeAspectRatio, normalizeLinkUrl, normalizeMediaUrl, readString, renderWidgetMessage, sharedStyle, widgetSettings } from './publicWidgetHelpers.js';
function mediaStyle() {
    const style = document.createElement('style');
    style.textContent = `
.bp-media-widget {
  display: grid;
  gap: 8px;
  min-height: 100%;
}
.bp-media-widget__frame {
  display: block;
  min-height: 100%;
  overflow: hidden;
  border-radius: 8px;
  background: var(--studio-surface-muted);
}
.bp-media-widget__image {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 100%;
  object-fit: cover;
}
.bp-media-widget__caption {
  color: var(--studio-text-muted);
  font-size: 0.875rem;
  line-height: 1.4;
}
  `.trim();
    return style;
}
export function render(el, ctx = {}) {
    if (!el)
        return;
    const settings = widgetSettings(ctx);
    const src = normalizeMediaUrl(readString(settings, ['src', 'mediaUrl', 'url', 'image']));
    if (!src) {
        renderWidgetMessage(el, 'BP_WIDGET_MEDIA_EMPTY', 'Media missing', 'Add an image or media URL.');
        return;
    }
    const figure = document.createElement('figure');
    figure.className = 'bp-public-widget bp-media-widget';
    const frame = document.createElement('span');
    frame.className = 'bp-media-widget__frame';
    const ratio = normalizeAspectRatio(readString(settings, ['aspectRatio', 'ratio']));
    if (ratio)
        frame.style.aspectRatio = ratio;
    const img = document.createElement('img');
    img.className = 'bp-media-widget__image';
    img.src = src;
    img.alt = readString(settings, ['alt', 'altText']);
    img.loading = 'lazy';
    img.decoding = 'async';
    const fit = readString(settings, ['fit', 'objectFit'], 'cover');
    img.style.objectFit = ['cover', 'contain', 'fill', 'none', 'scale-down'].includes(fit) ? fit : 'cover';
    frame.appendChild(img);
    const href = normalizeLinkUrl(readString(settings, ['href', 'link']));
    if (href) {
        const link = document.createElement('a');
        link.href = href;
        link.appendChild(frame);
        figure.appendChild(link);
    }
    else {
        figure.appendChild(frame);
    }
    const caption = readString(settings, ['caption', 'description']);
    if (caption) {
        const captionNode = document.createElement('figcaption');
        captionNode.className = 'bp-media-widget__caption';
        captionNode.textContent = caption;
        figure.appendChild(captionNode);
    }
    el.replaceChildren(sharedStyle(), mediaStyle(), figure);
}
