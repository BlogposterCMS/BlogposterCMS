let _toPng;
async function loadToPng() {
  if (_toPng) return _toPng;
  try {
    const mod = await import('html-to-image');
    _toPng = mod.toPng;
  } catch (err) {
    console.warn('[Designer] Failed to load html-to-image from package', err);
    try {
      const mod = await import('/assets/js/html-to-img.js');
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

export async function capturePreview(gridEl) {
  if (!gridEl) return '';
  try {
    const toPng = await loadToPng();
    const fontEmbedCss = await getFontEmbedCss();
    return await toPng(gridEl, { cacheBust: true, fontEmbedCss });
  } catch (err) {
    console.error('[Designer] preview capture error', err);
    return '';
  }
}
