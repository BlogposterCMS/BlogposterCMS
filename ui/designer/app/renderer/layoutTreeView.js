import { STRINGS } from '../i18n.js';

function directContainers(node) {
  return Array.from(node?.children || []).filter(child => (
    child instanceof HTMLElement &&
    child.classList.contains('layout-container')
  ));
}

function visibleMode(node) {
  const mode = node.dataset.layoutMode || 'free';
  if (mode === 'stack' || mode === 'row') return 'Auto';
  if (mode === 'grid') return 'Grid';
  return 'Free';
}

function nodeLabel(node) {
  if (node.classList.contains('layout-section')) {
    return node.dataset.sectionTitle || node.dataset.sectionId || 'Section';
  }
  return node.dataset.elementName || STRINGS.layoutTreeContainer || 'Container';
}

/**
 * Renders the canonical recursive layout hierarchy. Structural reparenting is
 * deliberately isolated to this tree so normal CanvasGrid dragging continues
 * to mean "move on this surface", never "silently change parent".
 */
export function renderLayoutTreeSidebar(panelEl, rootEl, onSelect, onMove) {
  if (!panelEl || !rootEl) return;
  const treeEl = panelEl.querySelector('.layout-tree');
  if (!treeEl) return;
  treeEl.replaceChildren();
  let draggedNode = null;

  const clearDropState = () => {
    treeEl.querySelectorAll('.layout-tree-item--drop-target').forEach(item => {
      item.classList.remove('layout-tree-item--drop-target');
    });
  };

  function walk(node, depth) {
    if (!node.classList.contains('layout-container')) return;
    const isSection = node.classList.contains('layout-section');
    const item = document.createElement('div');
    item.className = 'layout-tree-item';
    item.dataset.nodeId = node.dataset.nodeId || node.dataset.sectionId || '';
    item.dataset.nodeRole = isSection ? 'section' : 'container';
    item.style.setProperty('--layout-tree-depth', String(depth));
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-level', String(depth + 1));
    item.draggable = !isSection;

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'layout-tree-select';
    selectButton.setAttribute('aria-label', `Select ${nodeLabel(node)}`);
    const icon = document.createElement('img');
    icon.className = 'icon';
    icon.src = `/assets/icons/${isSection ? 'rows-3' : 'box'}.svg`;
    icon.alt = '';
    const copy = document.createElement('span');
    copy.className = 'layout-tree-copy';
    const title = document.createElement('span');
    title.className = 'layout-tree-title';
    title.textContent = nodeLabel(node);
    const mode = document.createElement('span');
    mode.className = 'layout-tree-mode';
    mode.textContent = visibleMode(node);
    copy.append(title, mode);
    selectButton.append(icon, copy);

    if (!isSection) {
      const handle = document.createElement('span');
      handle.className = 'layout-tree-drag-handle';
      handle.title = 'Drag into another Section or Container';
      handle.setAttribute('aria-hidden', 'true');
      handle.innerHTML = '<img src="/assets/icons/grip-vertical.svg" alt="" class="icon" />';
      item.append(handle);
    }
    item.append(selectButton);

    selectButton.addEventListener('click', () => {
      treeEl.querySelectorAll('.layout-tree-item.selected').forEach(element => {
        element.classList.remove('selected');
      });
      item.classList.add('selected');
      onSelect?.(node);
    });

    item.addEventListener('dragstart', event => {
      if (isSection) {
        event.preventDefault();
        return;
      }
      draggedNode = node;
      item.classList.add('layout-tree-item--dragging');
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', node.dataset.nodeId || 'layout-container');
      } catch {
        // Some test/browser surfaces expose a read-only DataTransfer shim.
      }
    });
    item.addEventListener('dragover', event => {
      if (
        !draggedNode ||
        draggedNode === node ||
        draggedNode.contains(node)
      ) return;
      event.preventDefault();
      clearDropState();
      item.classList.add('layout-tree-item--drop-target');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    item.addEventListener('drop', event => {
      if (
        !draggedNode ||
        draggedNode === node ||
        draggedNode.contains(node)
      ) return;
      event.preventDefault();
      const source = draggedNode;
      clearDropState();
      onMove?.(source, node, 'inside');
      draggedNode = null;
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('layout-tree-item--dragging');
      clearDropState();
      draggedNode = null;
    });

    treeEl.appendChild(item);
    directContainers(node).forEach(child => walk(child, depth + 1));
  }

  directContainers(rootEl).forEach(child => walk(child, 0));
}
