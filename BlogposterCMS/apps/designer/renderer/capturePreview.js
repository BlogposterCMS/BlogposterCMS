let _toPng;
async function loadToPng() {
  if (_toPng) return _toPng;
  try {
    const mod = await import('html-to-image');
    _toPng = mod.toPng;
  } catch (err) {
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

export async function capturePreview(gridEl) {
  if (!gridEl) return '';
  try {
    const toPng = await loadToPng();
    return await toPng(gridEl, { cacheBust: true });
  } catch (err) {
    console.error('[Designer] preview capture error', err);
    return '';
  }
}
