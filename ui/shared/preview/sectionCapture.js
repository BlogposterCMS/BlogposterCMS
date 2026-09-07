/** Capture only the first canonical Section, independent of editor pan/zoom. */
export function firstSectionCapture(root, options = {}) {
  const target = root.querySelector(':scope > .layout-section[data-section-id]')
    || root.querySelector('.layout-section[data-section-id]') || root;
  const width = Math.max(1, target.offsetWidth || target.clientWidth || 1440);
  const height = Math.min(target.scrollHeight || target.offsetHeight || width * 9 / 16, width * 9 / 16);
  const outputWidth = Math.min(960, width);
  return { target, options: {
    width, height: Math.max(1, height), canvasWidth: outputWidth,
    canvasHeight: Math.max(1, Math.round(outputWidth * height / width)),
    pixelRatio: 1,
    filter: element => !element.hasAttribute?.('data-designer-edit-overlay')
      && !element.classList?.contains('widget-remove')
      && !element.classList?.contains('widget-resize')
      && !element.classList?.contains('widget-menu')
      && !element.classList?.contains('resize-handle')
      && !element.hasAttribute?.('data-section-action'),
    style: { transform: 'none', translate: 'none', scale: 'none', zoom: '1', margin: '0', transformOrigin: 'top left' },
    ...options
  } };
}
