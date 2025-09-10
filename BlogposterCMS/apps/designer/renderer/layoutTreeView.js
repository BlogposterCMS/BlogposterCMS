import { STRINGS } from '../i18n.js';

export function renderLayoutTreeSidebar(panelEl, rootEl, onSelect) {
  if (!panelEl || !rootEl) return;
  const treeEl = panelEl.querySelector('.layout-tree');
  if (!treeEl) return;
  treeEl.innerHTML = '';

  function walk(node, depth) {
    if (!node.classList.contains('layout-container')) return;
    const item = document.createElement('div');
    item.className = 'layout-tree-item';
    item.style.paddingLeft = `${depth * 12}px`;
    if (node.dataset.split === 'true') {
      const isRow = node.dataset.orientation === 'horizontal';
      item.textContent = isRow ? STRINGS.layoutTreeRow : STRINGS.layoutTreeColumn;
    } else {
      item.textContent = STRINGS.layoutTreeContainer;
      item.addEventListener('click', () => {
        treeEl.querySelectorAll('.layout-tree-item.selected').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        if (onSelect) onSelect(node);
      });
    }
    treeEl.appendChild(item);
    if (node.dataset.split === 'true') {
      Array.from(node.children).forEach(ch => walk(ch, depth + 1));
    }
  }

  Array.from(rootEl.children).forEach(ch => walk(ch, 0));
}
