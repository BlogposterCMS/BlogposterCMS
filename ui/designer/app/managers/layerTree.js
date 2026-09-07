/** List authored children only; widget internals are not separate design objects. */
export function layerTreeChildren(surface) {
  return Array.from(surface?.children || []).filter(child =>
    child.matches('.canvas-item, .layout-container')
  );
}
