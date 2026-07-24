let _toPng;
const DEFAULT_VIEWPORT_THUMBNAIL_MAX_WIDTH = 960;
const DEFAULT_VIEWPORT_THUMBNAIL_MAX_HEIGHT = 540;

async function loadToPng() {
  if (_toPng) return _toPng;
  try {
    const mod = await import('html-to-image');
    _toPng = mod.toPng;
  } catch (err) {
    console.warn('[Designer] Failed to load html-to-image from package', err);
    try {
      const mod = await import('/ui/shared/vendor/html-to-img.js');
      _toPng = mod.toPng;
    } catch (err2) {
      console.warn('[Designer] html-to-image unavailable', err2);
      _toPng = async () => '';
    }
  }
  return _toPng;
}

async function getFontEmbedCss() {
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  const cssChunks = await Promise.all(links.map(async link => {
    try {
      const url = new URL(link.href, window.location.href);
      const allowed = url.origin === window.location.origin || url.origin === 'https://fonts.googleapis.com';
      if (!allowed) return '';
      const res = await fetch(url.href, { mode: 'cors' });
      if (!res.ok) return '';
      return await res.text();
    } catch {
      return '';
    }
  }));
  return cssChunks.filter(Boolean).join('\n');
}

function positiveNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function canReadStyleSheetsForPreview() {
  try {
    Array.from(document.styleSheets || []).forEach(sheet => {
      if ('cssRules' in sheet) void sheet.cssRules;
    });
    return true;
  } catch {
    return false;
  }
}

function structuralPreviewDataUrl(gridEl, options = {}) {
  const rootRect = gridEl.getBoundingClientRect?.() || {};
  const width = Math.max(1, Math.round(rootRect.width || gridEl.clientWidth || 960));
  const height = Math.max(1, Math.round(rootRect.height || gridEl.clientHeight || 540));
  const maxWidth = positiveNumber(options.maxWidth, DEFAULT_VIEWPORT_THUMBNAIL_MAX_WIDTH);
  const maxHeight = positiveNumber(options.maxHeight, DEFAULT_VIEWPORT_THUMBNAIL_MAX_HEIGHT);
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    console.warn('DESIGNER_STRUCTURAL_PREVIEW_CONTEXT_UNAVAILABLE');
    return '';
  }

  context.scale(scale, scale);
  context.fillStyle = '#f2f4f7';
  context.fillRect(0, 0, width, height);
  context.font = '12px sans-serif';
  context.textBaseline = 'top';
  Array.from(gridEl.querySelectorAll('.canvas-item')).forEach((item, index) => {
    const rect = item.getBoundingClientRect?.() || {};
    const x = Math.max(0, Math.round((rect.left || 0) - (rootRect.left || 0)));
    const y = Math.max(0, Math.round((rect.top || 0) - (rootRect.top || 0)));
    const boxWidth = Math.max(1, Math.round(rect.width || 80));
    const boxHeight = Math.max(1, Math.round(rect.height || 40));
    const label = String(
      item.dataset.elementName || item.dataset.widgetId || `Element ${index + 1}`
    );
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#98a2b3';
    context.lineWidth = 1;
    context.fillRect(x, y, boxWidth, boxHeight);
    context.strokeRect(x, y, boxWidth, boxHeight);
    context.fillStyle = '#344054';
    context.fillText(label.slice(0, 80), x + 8, y + 7, Math.max(1, boxWidth - 16));
  });
  try {
    // AgentManager intentionally accepts only raster previews. Drawing the
    // structural fallback here avoids widening the server's SVG/XSS surface.
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.warn('DESIGNER_STRUCTURAL_PREVIEW_ENCODE_FAILED', error);
    return '';
  }
}

function elementSize(gridEl, rect) {
  return {
    width: positiveNumber(rect?.width, gridEl.scrollWidth || gridEl.clientWidth || 1),
    height: positiveNumber(rect?.height, gridEl.scrollHeight || gridEl.clientHeight || 1)
  };
}

function viewportSize(rect) {
  return {
    width: positiveNumber(window.innerWidth, document.documentElement?.clientWidth || rect?.width || 1),
    height: positiveNumber(window.innerHeight, document.documentElement?.clientHeight || rect?.height || 1)
  };
}

function resolveViewportCapture(gridEl, options = {}) {
  const rect = typeof gridEl.getBoundingClientRect === 'function'
    ? gridEl.getBoundingClientRect()
    : null;
  const fallbackSize = elementSize(gridEl, rect);
  const viewport = viewportSize(rect);
  const rectLeft = Number.isFinite(rect?.left) ? rect.left : 0;
  const rectTop = Number.isFinite(rect?.top) ? rect.top : 0;
  const rectRight = Number.isFinite(rect?.right) ? rect.right : rectLeft + fallbackSize.width;
  const rectBottom = Number.isFinite(rect?.bottom) ? rect.bottom : rectTop + fallbackSize.height;
  const visibleLeft = Math.max(0, rectLeft);
  const visibleTop = Math.max(0, rectTop);
  const visibleRight = Math.min(viewport.width, rectRight);
  const visibleBottom = Math.min(viewport.height, rectBottom);
  const visibleWidth = visibleRight > visibleLeft ? visibleRight - visibleLeft : Math.min(fallbackSize.width, viewport.width);
  const visibleHeight = visibleBottom > visibleTop ? visibleBottom - visibleTop : Math.min(fallbackSize.height, viewport.height);
  const width = Math.max(1, Math.ceil(visibleWidth));
  const height = Math.max(1, Math.ceil(visibleHeight));
  const maxWidth = positiveNumber(options.maxWidth, DEFAULT_VIEWPORT_THUMBNAIL_MAX_WIDTH);
  const maxHeight = positiveNumber(options.maxHeight, DEFAULT_VIEWPORT_THUMBNAIL_MAX_HEIGHT);
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  const offsetX = Math.max(0, Math.round(-rectLeft));
  const offsetY = Math.max(0, Math.round(-rectTop));
  const style = { transformOrigin: 'top left' };

  if (offsetX || offsetY) {
    style.transform = `translate(${-offsetX}px, ${-offsetY}px)`;
  }

  return {
    width,
    height,
    canvasWidth: Math.max(1, Math.round(width * scale)),
    canvasHeight: Math.max(1, Math.round(height * scale)),
    style
  };
}

function resolvePreviewOptions(gridEl, options = {}) {
  if (!options.viewport) return {};
  return resolveViewportCapture(gridEl, options);
}

export async function capturePreview(gridEl, options = {}) {
  if (!gridEl) return '';
  if (!canReadStyleSheetsForPreview()) {
    return options.structuralFallback ? structuralPreviewDataUrl(gridEl, options) : '';
  }
  try {
    const toPng = await loadToPng();
    const fontEmbedCss = await getFontEmbedCss();
    return await toPng(gridEl, {
      cacheBust: true,
      fontEmbedCss,
      ...resolvePreviewOptions(gridEl, options)
    });
  } catch (err) {
    console.error('[Designer] DESIGNER_PREVIEW_CAPTURE_FAILED', err);
    return options.structuralFallback ? structuralPreviewDataUrl(gridEl, options) : '';
  }
}
