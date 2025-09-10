let currentRoot = null;
let moveCtx = null;
let dragEl = null;
let placeholder = null;

function computePos(e, target) {
  const rect = target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const w = rect.width;
  const h = rect.height;
  const bw = w * 0.25;
  const bh = h * 0.25;
  if (y < bh) return 'top';
  if (y > h - bh) return 'bottom';
  if (x < bw) return 'left';
  if (x > w - bw) return 'right';
  return 'inside';
}

function insertPlaceholder(target, pos) {
  if (!placeholder) return;
  if (pos === 'inside') target.appendChild(placeholder);
  else if (pos === 'top' || pos === 'left') target.parentNode.insertBefore(placeholder, target);
  else target.parentNode.insertBefore(placeholder, target.nextSibling);
}

function onDragStart(e) {
  const el = e.target.closest('.layout-container');
  if (!el || el.dataset.split === 'true') {
    e.preventDefault();
    return;
  }
  dragEl = el;
  dragEl.classList.add('drag-ghost');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', ''); } catch (_) {}
}

function onDragOver(e) {
  if (!dragEl) return;
  const target = e.target.closest('.layout-container');
  if (!target || target === dragEl) return;
  e.preventDefault();
  const pos = computePos(e, target);
  insertPlaceholder(target, pos);
}

function onDrop(e) {
  if (!dragEl) return;
  const target = e.target.closest('.layout-container');
  if (!target || target === dragEl) return;
  e.preventDefault();
  const pos = computePos(e, target);
  if (moveCtx && typeof moveCtx.moveContainer === 'function') {
    moveCtx.moveContainer(dragEl, target, pos);
  }
  cleanup();
}

function onDragEnd() {
  cleanup();
}

function cleanup() {
  if (placeholder && placeholder.parentNode) placeholder.remove();
  if (dragEl) dragEl.classList.remove('drag-ghost');
  dragEl = null;
}

export function activateArrange(root, ctx = {}) {
  if (!root) return;
  currentRoot = root;
  moveCtx = ctx;
  placeholder = document.createElement('div');
  placeholder.className = 'layout-placeholder';
  root.addEventListener('dragstart', onDragStart);
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('drop', onDrop);
  root.addEventListener('dragend', onDragEnd);
  root.querySelectorAll('.layout-container').forEach(el => {
    el.draggable = true;
  });
}

export function deactivateArrange(root = currentRoot) {
  if (!root) return;
  root.removeEventListener('dragstart', onDragStart);
  root.removeEventListener('dragover', onDragOver);
  root.removeEventListener('drop', onDrop);
  root.removeEventListener('dragend', onDragEnd);
  root.querySelectorAll('.layout-container').forEach(el => {
    el.draggable = false;
  });
  cleanup();
  currentRoot = null;
  moveCtx = null;
}

