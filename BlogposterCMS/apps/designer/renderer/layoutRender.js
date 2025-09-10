export function renderLayoutTree(tree, mountEl) {
  if (!mountEl || !tree) return new Map();
  mountEl.replaceChildren();
  const map = new Map();
  const walk = (node, parent) => {
    const el = document.createElement('div');
    el.className = 'layout-container';
    el.style.flex = '1 1 0';
    if (node.type === 'split') {
      el.dataset.split = 'true';
      const orientation = node.orientation === 'horizontal' ? 'horizontal' : 'vertical';
      el.dataset.orientation = orientation;
      el.style.display = 'flex';
      el.style.flexDirection = orientation === 'horizontal' ? 'column' : 'row';
      const sizes = Array.isArray(node.sizes) ? node.sizes : [];
      (node.children || []).forEach((child, i) => {
        const childEl = walk(child, el);
        const size = sizes[i];
        if (childEl && typeof size === 'number') {
          childEl.style.flex = `${size} 1 0`;
        }
      });
    } else {
      if (node.nodeId != null) {
        el.dataset.nodeId = String(node.nodeId);
        map.set(String(node.nodeId), el);
      }
    }
    parent.appendChild(el);
    return el;
  };
  walk(tree, mountEl);
  return map;
}
