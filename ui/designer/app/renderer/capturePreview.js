import { capturePreview as captureDomPreview } from '../../../shared/preview/domCapture.js';

/** Designer chooses its document; shared capture owns rasterization. */
export function capturePreview(gridEl, options = {}) {
  const root = options.firstSection ? gridEl?.closest?.('#layoutRoot') || gridEl : gridEl;
  return captureDomPreview(root, options);
}
