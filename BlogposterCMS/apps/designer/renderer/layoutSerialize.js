import { STRINGS } from '../i18n.js';
import { generateNodeId } from './renderUtils.js';

export function serializeLayout(container) {
  if (!container) return {};
  const isSplit = container.dataset.split === 'true';
  const workarea = container.dataset.workarea === 'true';
  const nodeId = container.dataset.nodeId;
  if (isSplit) {
    const orientation = container.dataset.orientation || 'vertical';
    const children = Array.from(container.children)
      .filter(ch => ch.classList.contains('layout-container'))
      .map(ch => serializeLayout(ch));
    const sizes = Array.from(container.children)
      .filter(ch => ch.classList.contains('layout-container'))
      .map(ch => {
        const flex = parseFloat(ch.style.flex);
        return Number.isFinite(flex) ? flex : 1;
      });
    const obj = { type: 'split', orientation, workarea, children };
    if (nodeId) obj.nodeId = nodeId;
    if (sizes.some(s => s !== 1)) obj.sizes = sizes;
    return obj;
  }
  const leaf = { type: 'leaf', workarea };
  if (nodeId) leaf.nodeId = nodeId;
  const designRef = container.dataset.designRef;
  if (designRef) leaf.designRef = designRef;
  return leaf;
}

export function deserializeLayout(obj, container) {
  if (!container || !obj) return;
  container.replaceChildren();
  const type = obj.type || (obj.orientation ? 'split' : 'leaf');
  if (type === 'split') {
    const orientation = obj.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    container.dataset.split = 'true';
    container.dataset.orientation = orientation;
    container.style.display = 'flex';
    container.style.flexDirection = orientation === 'horizontal' ? 'column' : 'row';
    const sizes = Array.isArray(obj.sizes) ? obj.sizes : [];
    (obj.children || []).forEach((child, i) => {
      const div = document.createElement('div');
      const size = sizes[i];
      div.style.flex = Number.isFinite(size) ? `${size} 1 0` : '1 1 0';
      container.appendChild(div);
      deserializeLayout(child, div);
    });
    container.classList.add('layout-container');
  } else {
    container.className = 'layout-container builder-grid canvas-grid';
    container.style.flex = '1 1 0';
  }
  container.dataset.emptyHint = STRINGS.splitHint;
  if (obj.workarea) {
    container.dataset.workarea = 'true';
    container.dataset.workareaLabel = STRINGS.workareaLabel;
  }
  const id = obj.nodeId || generateNodeId();
  container.dataset.nodeId = String(id);
  if (obj.designRef) container.dataset.designRef = obj.designRef;
}
