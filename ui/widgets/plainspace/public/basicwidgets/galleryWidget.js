import { normalizeAspectRatio, normalizeMediaItems, readArray, readBoolean, readNumber, readString, renderWidgetMessage, sharedStyle, widgetSettings } from './publicWidgetHelpers.js';
const OBJECT_FITS = ['cover', 'contain', 'fill', 'none', 'scale-down'];
const GALLERY_MODES = ['grid', 'masonry', 'carousel'];
const HEIGHT_MODES = ['ratio', 'natural', 'smallest', 'largest'];
const ANIMATIONS = ['slide', 'fade', 'instant'];
function galleryStyle() {
    const style = document.createElement('style');
    style.textContent = `
.bp-gallery-widget {
  display: grid;
  gap: var(--bp-gallery-gap, 10px);
  min-height: 100%;
  --bp-gallery-gap: 10px;
  --bp-gallery-columns: 3;
  --bp-gallery-ratio: 1 / 1;
  --bp-gallery-slides-to-show: 1;
  --bp-gallery-duration: 360ms;
}
.bp-gallery-widget__items {
  display: grid;
  grid-template-columns: repeat(var(--bp-gallery-columns, 3), minmax(0, 1fr));
  gap: var(--bp-gallery-gap, 10px);
}
.bp-gallery-widget__items.is-row-limited {
  overflow-y: auto;
  scrollbar-gutter: stable;
}
.bp-gallery-widget__item {
  display: grid;
  gap: 6px;
  margin: 0;
}
.bp-gallery-widget__frame {
  display: block;
  overflow: hidden;
  border-radius: 8px;
  background: var(--studio-surface-muted);
}
.bp-gallery-widget[data-height-mode="ratio"] .bp-gallery-widget__frame {
  aspect-ratio: var(--bp-gallery-ratio, 1 / 1);
}
.bp-gallery-widget[data-height-mode="smallest"] .bp-gallery-widget__frame,
.bp-gallery-widget[data-height-mode="largest"] .bp-gallery-widget__frame {
  height: var(--bp-gallery-measured-height, auto);
}
.bp-gallery-widget img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 50%;
}
.bp-gallery-widget[data-height-mode="natural"] img {
  height: auto;
}
.bp-gallery-widget figcaption {
  color: var(--studio-text-muted);
  font-size: 0.8rem;
  line-height: 1.35;
}
.bp-gallery-widget--masonry .bp-gallery-widget__items {
  display: block;
  column-count: var(--bp-gallery-columns, 3);
  column-gap: var(--bp-gallery-gap, 10px);
}
.bp-gallery-widget--masonry .bp-gallery-widget__item {
  break-inside: avoid;
  margin-bottom: var(--bp-gallery-gap, 10px);
}
.bp-gallery-widget--carousel .bp-gallery-widget__items {
  display: flex;
  gap: var(--bp-gallery-gap, 10px);
  overflow: visible;
  transition: transform var(--bp-gallery-duration, 360ms) ease;
  will-change: transform;
}
.bp-gallery-widget--carousel .bp-gallery-widget__item {
  flex: 0 0 calc((100% - (var(--bp-gallery-slides-to-show, 1) - 1) * var(--bp-gallery-gap, 10px)) / var(--bp-gallery-slides-to-show, 1));
}
.bp-gallery-widget--carousel[data-animation="instant"] .bp-gallery-widget__items {
  transition-duration: 0ms;
}
.bp-gallery-widget--carousel[data-animation="fade"] {
  overflow: hidden;
}
.bp-gallery-widget--carousel[data-animation="fade"] .bp-gallery-widget__items {
  display: grid;
  transform: none !important;
}
.bp-gallery-widget--carousel[data-animation="fade"] .bp-gallery-widget__item {
  grid-area: 1 / 1;
  opacity: 0;
  pointer-events: none;
  transform: scale(0.985);
  transition:
    opacity var(--bp-gallery-duration, 360ms) ease,
    transform var(--bp-gallery-duration, 360ms) ease;
}
.bp-gallery-widget--carousel[data-animation="fade"] .bp-gallery-widget__item.is-active {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1);
}
.bp-gallery-widget__controls {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.bp-gallery-widget__controls button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--studio-border);
  border-radius: var(--studio-radius-control);
  background: var(--studio-surface-solid);
  color: var(--studio-text);
  font: inherit;
}
.bp-gallery-widget__dots {
  display: flex;
  justify-content: center;
  gap: 6px;
}
.bp-gallery-widget__dots button {
  width: 7px;
  height: 7px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--studio-border);
}
.bp-gallery-widget__dots button.is-active {
  background: var(--studio-text);
}
  `.trim();
    return style;
}
function clampNumber(value, min, max, fallback) {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
    const number = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
}
function normalizeChoice(value, allowed, fallback) {
    const normalized = String(value || '').trim().toLowerCase();
    return allowed.includes(normalized) ? normalized : fallback;
}
function normalizeMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['slider', 'slideshow'].includes(normalized))
        return 'carousel';
    return normalizeChoice(normalized, GALLERY_MODES, 'grid');
}
function normalizeHeightMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['shortest', 'min', 'minimum'].includes(normalized))
        return 'smallest';
    if (['tallest', 'max', 'maximum'].includes(normalized))
        return 'largest';
    return normalizeChoice(normalized, HEIGHT_MODES, 'ratio');
}
function normalizeAnimation(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'none')
        return 'instant';
    return normalizeChoice(normalized, ANIMATIONS, 'slide');
}
function normalizeFit(value, fallback = 'cover') {
    const normalized = String(value || '').trim().toLowerCase();
    return OBJECT_FITS.includes(normalized) ? normalized : fallback;
}
function nextFrame(callback) {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(callback);
        return;
    }
    window.setTimeout(callback, 0);
}
function normalizeObjectPosition(item, fallbackX, fallbackY, fallback = '') {
    const direct = readString(item, ['objectPosition', 'position']);
    if (direct)
        return direct;
    const x = clampNumber(item.focalX, 0, 100, fallbackX);
    const y = clampNumber(item.focalY, 0, 100, fallbackY);
    return `${x}% ${y}%` || fallback;
}
function setRowLimit(root, list, rows) {
    if (!rows)
        return;
    const firstFrame = list.querySelector('.bp-gallery-widget__frame');
    const gap = clampNumber(getComputedStyle(root).getPropertyValue('--bp-gallery-gap'), 0, 64, 10);
    const apply = () => {
        const frameHeight = firstFrame?.getBoundingClientRect().height || 0;
        if (!frameHeight)
            return;
        list.classList.add('is-row-limited');
        list.style.maxHeight = `${Math.round((frameHeight * rows) + (gap * Math.max(0, rows - 1)))}px`;
    };
    nextFrame(apply);
    list.querySelectorAll('img').forEach(image => image.addEventListener('load', apply, { once: true }));
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(apply);
        observer.observe(root);
    }
}
function setMeasuredHeight(root, mode) {
    if (!['smallest', 'largest'].includes(mode))
        return;
    const images = Array.from(root.querySelectorAll('img'));
    const measure = () => {
        const heights = images
            .map(image => {
            if (!image.naturalWidth || !image.naturalHeight)
                return 0;
            const frame = image.closest('.bp-gallery-widget__frame');
            const width = frame?.clientWidth || image.clientWidth || 0;
            return width ? (width * image.naturalHeight) / image.naturalWidth : 0;
        })
            .filter(height => height > 0);
        if (!heights.length)
            return;
        const next = mode === 'largest' ? Math.max(...heights) : Math.min(...heights);
        root.style.setProperty('--bp-gallery-measured-height', `${Math.round(next)}px`);
    };
    nextFrame(measure);
    images.forEach(image => image.addEventListener('load', measure, { once: true }));
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(measure);
        observer.observe(root);
    }
}
function renderImage(item, defaults) {
    const figure = document.createElement('figure');
    figure.className = 'bp-gallery-widget__item';
    const frame = document.createElement(item.href ? 'a' : 'span');
    frame.className = 'bp-gallery-widget__frame';
    if (item.href)
        frame.href = item.href;
    const image = document.createElement('img');
    image.src = item.src;
    image.alt = item.alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.style.objectFit = normalizeFit(item.objectFit || item.fit, defaults.fit);
    image.style.objectPosition = normalizeObjectPosition(item, defaults.focalX, defaults.focalY, defaults.objectPosition);
    frame.appendChild(image);
    figure.appendChild(frame);
    if (item.caption) {
        const caption = document.createElement('figcaption');
        caption.textContent = item.caption;
        figure.appendChild(caption);
    }
    return figure;
}
function appendCarouselControls(root, list, itemCount, options) {
    let index = 0;
    let timer = null;
    const items = Array.from(list.querySelectorAll('.bp-gallery-widget__item'));
    const maxIndex = options.animation === 'fade'
        ? Math.max(0, itemCount - 1)
        : Math.max(0, itemCount - options.slidesToShow);
    const dots = document.createElement('div');
    dots.className = 'bp-gallery-widget__dots';
    const dotCount = maxIndex + 1;
    for (let i = 0; i < dotCount; i += 1) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', `Show gallery image ${i + 1}`);
        dot.addEventListener('click', () => goTo(i));
        dots.appendChild(dot);
    }
    function apply() {
        const nextIndex = Math.max(0, Math.min(maxIndex, index));
        index = nextIndex;
        if (options.animation === 'fade') {
            items.forEach((item, itemIndex) => item.classList.toggle('is-active', itemIndex === nextIndex));
        }
        else {
            const offset = items[nextIndex]?.offsetLeft || 0;
            list.style.transform = `translate3d(${-offset}px, 0, 0)`;
        }
        Array.from(dots.children).forEach((dot, dotIndex) => {
            dot.classList.toggle('is-active', dotIndex === nextIndex);
        });
    }
    function goTo(next) {
        if (options.loop) {
            index = next < 0 ? maxIndex : next > maxIndex ? 0 : next;
        }
        else {
            index = Math.max(0, Math.min(maxIndex, next));
        }
        apply();
    }
    function step(direction) {
        goTo(index + (options.slidesToScroll * direction));
    }
    if (options.showControls) {
        const controls = document.createElement('div');
        controls.className = 'bp-gallery-widget__controls';
        const previous = document.createElement('button');
        previous.type = 'button';
        previous.textContent = 'Prev';
        const next = document.createElement('button');
        next.type = 'button';
        next.textContent = 'Next';
        previous.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        controls.append(previous, next);
        root.appendChild(controls);
    }
    if (options.showDots && dotCount > 1)
        root.appendChild(dots);
    if (options.autoplay && itemCount > 1) {
        const start = () => {
            if (timer != null)
                window.clearInterval(timer);
            timer = window.setInterval(() => step(1), options.autoplayDelay);
        };
        const stop = () => {
            if (timer != null)
                window.clearInterval(timer);
            timer = null;
        };
        start();
        if (options.pauseOnHover) {
            root.addEventListener('mouseenter', stop);
            root.addEventListener('mouseleave', start);
            root.addEventListener('focusin', stop);
            root.addEventListener('focusout', start);
        }
    }
    nextFrame(apply);
    window.addEventListener('resize', apply);
}
export function render(el, ctx = {}) {
    if (!el)
        return;
    const settings = widgetSettings(ctx);
    const items = normalizeMediaItems(readArray(settings, ['items', 'images', 'media']));
    if (!items.length) {
        renderWidgetMessage(el, 'BP_WIDGET_GALLERY_EMPTY', 'Gallery empty', 'Add one or more media items.');
        return;
    }
    const mode = normalizeMode(readString(settings, ['mode', 'layout'], 'grid'));
    const heightMode = normalizeHeightMode(readString(settings, ['heightMode', 'heightStrategy'], 'ratio'));
    const animation = normalizeAnimation(readString(settings, ['sliderAnimation', 'animation', 'effect'], 'slide'));
    const columns = clampNumber(readNumber(settings, ['columns'], 3), 1, 8, 3);
    const rows = clampNumber(readNumber(settings, ['rows', 'rowCount'], 0), 0, 12, 0);
    const gap = clampNumber(readNumber(settings, ['gap'], 10), 0, 48, 10);
    const focalX = clampNumber(readNumber(settings, ['focalX', 'objectX', 'positionX'], 50), 0, 100, 50);
    const focalY = clampNumber(readNumber(settings, ['focalY', 'objectY', 'positionY'], 50), 0, 100, 50);
    const fit = normalizeFit(readString(settings, ['fit', 'objectFit'], 'cover'));
    const objectPosition = readString(settings, ['objectPosition', 'position'], `${focalX}% ${focalY}%`);
    const ratio = normalizeAspectRatio(readString(settings, ['aspectRatio', 'ratio'], 'square'));
    const slidesToShow = clampNumber(readNumber(settings, ['slidesToShow', 'slidesPerView'], 1), 1, 4, 1);
    const duration = clampNumber(readNumber(settings, ['animationSpeed', 'duration', 'speed'], 360), 0, 5000, 360);
    const autoplayDelay = clampNumber(readNumber(settings, ['autoplayDelay', 'autoplaySpeed'], 4000), 500, 30000, 4000);
    const slidesToScroll = clampNumber(readNumber(settings, ['slidesToScroll'], 1), 1, 4, 1);
    const root = document.createElement('section');
    root.className = `bp-public-widget bp-gallery-widget bp-gallery-widget--${mode}`;
    root.dataset.heightMode = heightMode;
    if (mode === 'carousel')
        root.dataset.animation = animation;
    root.style.setProperty('--bp-gallery-columns', String(columns));
    root.style.setProperty('--bp-gallery-gap', `${gap}px`);
    root.style.setProperty('--bp-gallery-ratio', ratio || '1 / 1');
    root.style.setProperty('--bp-gallery-slides-to-show', String(mode === 'carousel' && animation !== 'fade' ? slidesToShow : 1));
    root.style.setProperty('--bp-gallery-duration', `${duration}ms`);
    const list = document.createElement('div');
    list.className = 'bp-gallery-widget__items';
    items.forEach(item => list.appendChild(renderImage(item, {
        fit,
        focalX,
        focalY,
        objectPosition
    })));
    root.appendChild(list);
    setMeasuredHeight(root, heightMode);
    if (mode !== 'carousel')
        setRowLimit(root, list, rows);
    if (mode === 'carousel') {
        appendCarouselControls(root, list, items.length, {
            animation,
            autoplay: readBoolean(settings, ['autoplay'], false),
            autoplayDelay,
            loop: readBoolean(settings, ['loop'], true),
            pauseOnHover: readBoolean(settings, ['pauseOnHover'], true),
            showControls: readBoolean(settings, ['showControls', 'controls'], true),
            showDots: readBoolean(settings, ['showDots', 'dots'], true),
            slidesToShow,
            slidesToScroll
        });
    }
    el.replaceChildren(sharedStyle(), galleryStyle(), root);
}
