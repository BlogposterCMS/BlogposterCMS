import { STRINGS } from '../i18n.js';
import { generateNodeId } from '../renderer/renderUtils.js';

export function setDefaultWorkarea(root) {
  if (!root) return;
  if (root.querySelector('.layout-container[data-workarea="true"]')) return;
  const all = Array.from(root.querySelectorAll('.layout-container'));
  const candidates = all.filter(el => el.dataset.split !== 'true');
  const containers = candidates.length ? candidates : all.slice(0, 1);
  let largest = null;
  let maxArea = 0;
  for (const el of containers) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      largest = el;
    }
  }
  if (!largest && containers.length) {
    largest = containers[0];
  }
  if (largest) {
    largest.dataset.workarea = 'true';
    largest.dataset.workareaLabel = STRINGS.workareaLabel;
  }
}

export function ensureLayoutRootContainer(layoutRoot) {
  if (!layoutRoot) return null;
  layoutRoot.classList.add('layout-root');
  let rootContainer = layoutRoot;
  if (!layoutRoot.classList.contains('layout-container')) {
    rootContainer = layoutRoot.querySelector(':scope > .layout-container');
  }
  if (!rootContainer) {
    layoutRoot.classList.add('layout-container', 'builder-grid', 'canvas-grid');
    layoutRoot.dataset.emptyHint = STRINGS.splitHint;
    layoutRoot.dataset.nodeId = layoutRoot.dataset.nodeId || generateNodeId();
    rootContainer = layoutRoot;
  } else {
    if (!rootContainer.dataset.nodeId) {
      rootContainer.dataset.nodeId = generateNodeId();
    }
    if (!rootContainer.dataset.emptyHint) {
      rootContainer.dataset.emptyHint = STRINGS.splitHint;
    }
  }
  return rootContainer;
}

export function createLeaf() {
  const div = document.createElement('div');
  div.className = 'layout-container builder-grid canvas-grid';
  div.style.flex = '1 1 0';
  div.dataset.emptyHint = STRINGS.splitHint;
  div.dataset.nodeId = generateNodeId();
  return div;
}

export function setDynamicHost(layoutRoot, el) {
  if (!layoutRoot) return;
  layoutRoot.querySelectorAll('.layout-container[data-workarea="true"]').forEach(node => {
    node.removeAttribute('data-workarea');
    node.removeAttribute('data-workarea-label');
  });
  if (el) {
    el.dataset.workarea = 'true';
    el.dataset.workareaLabel = STRINGS.workareaLabel;
  }
}

export function setDesignRef(el, designId) {
  if (!el) return;
  if (designId) el.dataset.designRef = designId;
  else delete el.dataset.designRef;
}

export function placeContainer(targetEl, position, { layoutRoot, onAfterChange } = {}) {
  if (!targetEl) return;
  const orientation = (position === 'left' || position === 'right') ? 'vertical'
    : (position === 'top' || position === 'bottom') ? 'horizontal'
    : 'horizontal';
  const newLeaf = createLeaf();
  if (position === 'inside') {
    if (targetEl.dataset.split === 'true') {
      targetEl.appendChild(newLeaf);
    } else {
      const frag = document.createDocumentFragment();
      while (targetEl.firstChild) frag.appendChild(targetEl.firstChild);
      targetEl.dataset.split = 'true';
      targetEl.dataset.orientation = orientation;
      targetEl.style.display = 'flex';
      targetEl.style.flexDirection = orientation === 'horizontal' ? 'column' : 'row';
      const existing = createLeaf();
      existing.appendChild(frag);
      targetEl.append(existing, newLeaf);
    }
  } else {
    const parent = targetEl.parentElement;
    if (parent && parent.dataset.split === 'true' && parent.dataset.orientation === orientation) {
      if (position === 'left' || position === 'top') parent.insertBefore(newLeaf, targetEl);
      else parent.insertBefore(newLeaf, targetEl.nextSibling);
    } else {
      const wrapper = document.createElement('div');
      wrapper.className = 'layout-container';
      wrapper.dataset.split = 'true';
      wrapper.dataset.orientation = orientation;
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = orientation === 'horizontal' ? 'column' : 'row';
      wrapper.dataset.emptyHint = STRINGS.splitHint;
      wrapper.dataset.nodeId = generateNodeId();
      if (parent) parent.replaceChild(wrapper, targetEl);
      wrapper.appendChild(targetEl);
      targetEl.style.flex = '1 1 0';
      if (position === 'left' || position === 'top') wrapper.insertBefore(newLeaf, targetEl);
      else wrapper.appendChild(newLeaf);
    }
  }
  if (typeof onAfterChange === 'function') {
    onAfterChange({ layoutRoot: layoutRoot || targetEl.closest('.layout-root') });
  }
}

export function deleteContainer(targetEl, { onAfterChange } = {}) {
  if (!targetEl) return;
  const parent = targetEl.parentElement;
  targetEl.remove();
  if (parent && parent.dataset && parent.dataset.split === 'true') {
    const children = Array.from(parent.children);
    if (children.length === 1) {
      const only = children[0];
      if (parent.dataset.workarea === 'true') {
        only.dataset.workarea = 'true';
        only.dataset.workareaLabel = STRINGS.workareaLabel;
      }
      parent.replaceWith(only);
    }
  }
  if (typeof onAfterChange === 'function') {
    onAfterChange({ layoutRoot: parent?.closest?.('.layout-root') || parent });
  }
}

export function moveContainer(srcEl, targetEl, position, { onAfterChange } = {}) {
  if (!srcEl || !targetEl || srcEl === targetEl) return;
  const orientation = (position === 'left' || position === 'right') ? 'vertical'
    : (position === 'top' || position === 'bottom') ? 'horizontal'
    : targetEl.dataset.orientation || 'horizontal';
  const srcParent = srcEl.parentElement;
  if (position === 'inside') {
    if (targetEl.dataset.split === 'true') {
      targetEl.appendChild(srcEl);
    } else {
      const frag = document.createDocumentFragment();
      while (targetEl.firstChild) frag.appendChild(targetEl.firstChild);
      targetEl.dataset.split = 'true';
      targetEl.dataset.orientation = orientation;
      targetEl.style.display = 'flex';
      targetEl.style.flexDirection = orientation === 'horizontal' ? 'column' : 'row';
      const existing = createLeaf();
      existing.appendChild(frag);
      targetEl.append(existing, srcEl);
    }
  } else {
    const parent = targetEl.parentElement;
    if (parent && parent.dataset.split === 'true' && parent.dataset.orientation === orientation) {
      if (position === 'left' || position === 'top') parent.insertBefore(srcEl, targetEl);
      else parent.insertBefore(srcEl, targetEl.nextSibling);
    } else {
      const wrapper = document.createElement('div');
      wrapper.className = 'layout-container';
      wrapper.dataset.split = 'true';
      wrapper.dataset.orientation = orientation;
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = orientation === 'horizontal' ? 'column' : 'row';
      wrapper.dataset.emptyHint = STRINGS.splitHint;
      wrapper.dataset.nodeId = generateNodeId();
      if (parent) parent.replaceChild(wrapper, targetEl);
      wrapper.appendChild(targetEl);
      targetEl.style.flex = '1 1 0';
      if (position === 'left' || position === 'top') wrapper.insertBefore(srcEl, targetEl);
      else wrapper.appendChild(srcEl);
    }
  }
  if (srcParent && srcParent.dataset && srcParent.dataset.split === 'true') {
    const kids = Array.from(srcParent.children);
    if (kids.length === 1) {
      const only = kids[0];
      if (srcParent.dataset.workarea === 'true') {
        only.dataset.workarea = 'true';
        only.dataset.workareaLabel = STRINGS.workareaLabel;
      }
      srcParent.replaceWith(only);
    }
  }
  if (typeof onAfterChange === 'function') {
    onAfterChange({ layoutRoot: targetEl.closest('.layout-root') });
  }
}
