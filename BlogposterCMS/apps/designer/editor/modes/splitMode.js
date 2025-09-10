const state = {
  rootEl: null,
  onChange: null,
  escHandler: null,
  clickHandler: null,
  chooserEl: null
};

function generateGridId() {
  return `canvasGrid-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanupChooser() {
  if (state.chooserEl && state.chooserEl.parentNode) {
    state.chooserEl.parentNode.removeChild(state.chooserEl);
  }
  state.chooserEl = null;
}

function handleEsc(ev) {
  if (ev.key === 'Escape') {
    ev.stopPropagation();
    exitSplitMode();
  }
}

function handleClick(ev) {
  let container = ev.target.closest('.layout-container, #workspaceMain, #layoutRoot');
  if (!container) return;
  if (container.id === 'workspaceMain' && !container.classList.contains('layout-container')) {
    container = container.parentElement; // layoutRoot
  }
  ev.stopPropagation();
  showSplitChooser(container, ev.clientX, ev.clientY);
}

export function enterSplitMode({ rootEl, onChange } = {}) {
  if (!rootEl) return;
  state.rootEl = rootEl;
  state.onChange = typeof onChange === 'function' ? onChange : () => {};
  rootEl.classList.add('split-mode');
  state.escHandler = handleEsc;
  state.clickHandler = handleClick;
  document.addEventListener('keydown', state.escHandler, true);
  rootEl.addEventListener('click', state.clickHandler, true);
}

export function exitSplitMode() {
  if (state.rootEl) {
    state.rootEl.classList.remove('split-mode');
    state.rootEl.removeEventListener('click', state.clickHandler, true);
  }
  document.removeEventListener('keydown', state.escHandler, true);
  cleanupChooser();
  state.rootEl = null;
  state.onChange = null;
  state.escHandler = null;
  state.clickHandler = null;
}

export function splitContainer(container, orientation) {
  if (!container) return;
  const alreadySplit = container.dataset.split === 'true';
  if (container.id === 'layoutRoot') {
    if (alreadySplit) return;
    const workspace = container.querySelector('#workspaceMain');
    if (workspace && !workspace.classList.contains('layout-container')) {
      workspace.classList.add('layout-container');
      ['position', 'top', 'right', 'bottom', 'left', 'width', 'height', 'transform'].forEach(p => {
        workspace.style.removeProperty(p);
      });
      Object.assign(workspace.style, {
        display: 'flex',
        flex: '1 1 0',
        minWidth: '0',
        minHeight: '0'
      });
    }
    container.dataset.split = 'true';
    container.dataset.orientation = orientation === 'horizontal' ? 'horizontal' : 'vertical';
    container.style.display = 'flex';
    container.style.flexDirection = container.dataset.orientation === 'horizontal' ? 'column' : 'row';

    const sibling = document.createElement('div');
    sibling.className = 'layout-container builder-grid canvas-grid';
    sibling.style.flex = '1 1 0';
    sibling.id = generateGridId();
    container.appendChild(sibling);

    cleanupChooser();
    try { state.onChange?.(); } catch (e) { console.warn('[splitMode] onChange error', e); }
    return;
  }
  if (alreadySplit) return;

  const existingChildren = Array.from(container.childNodes);
  const frag = document.createDocumentFragment();
  existingChildren.forEach(ch => frag.appendChild(ch));

  const wasWorkarea = container.dataset.workarea === 'true';

  container.dataset.split = 'true';
  container.dataset.orientation = orientation === 'horizontal' ? 'horizontal' : 'vertical';
  container.style.display = 'flex';
  container.style.flexDirection = container.dataset.orientation === 'horizontal' ? 'column' : 'row';
  container.classList.add('layout-container');
  container.replaceChildren();

  const first = document.createElement('div');
  first.className = 'layout-container builder-grid canvas-grid';
  first.style.flex = '1 1 0';
  first.id = generateGridId();
  first.appendChild(frag);

  const second = document.createElement('div');
  second.className = 'layout-container builder-grid canvas-grid';
  second.style.flex = '1 1 0';
  second.id = generateGridId();

  container.appendChild(first);
  container.appendChild(second);

  if (wasWorkarea) {
    first.dataset.workarea = 'true';
    container.removeAttribute('data-workarea');
  }

  cleanupChooser();
  if (typeof state.onChange === 'function') {
    try { state.onChange(); } catch (e) { console.warn('[splitMode] onChange error', e); }
  }
}

export function showSplitChooser(container, x, y) {
  cleanupChooser();
  const chooser = document.createElement('div');
  chooser.className = 'split-chooser';
  const makeBtn = (cls, icon, label, orient) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    const img = document.createElement('img');
    img.src = `/assets/icons/${icon}`;
    img.alt = label;
    const span = document.createElement('span');
    span.textContent = label;
    btn.appendChild(img);
    btn.appendChild(span);
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      splitContainer(container, orient);
    });
    return btn;
  };
  const vBtn = makeBtn('split-vertical', 'square-split-vertical.svg', 'Side by side', 'vertical');
  const hBtn = makeBtn('split-horizontal', 'square-split-horizontal.svg', 'Stacked', 'horizontal');
  chooser.appendChild(vBtn);
  chooser.appendChild(hBtn);
  document.body.appendChild(chooser);
  const rect = container.getBoundingClientRect();
  chooser.style.left = (x || rect.left + rect.width / 2) + 'px';
  chooser.style.top = (y || rect.top + rect.height / 2) + 'px';
  state.chooserEl = chooser;
}

export function serializeLayout(container) {
  if (!container) return {};
  const isSplit = container.dataset.split === 'true';
  const workarea = container.dataset.workarea === 'true';
  if (isSplit) {
    const orientation = container.dataset.orientation || 'vertical';
    const children = Array.from(container.children)
      .filter(ch => ch.classList.contains('layout-container'))
      .map(ch => serializeLayout(ch));
    return { type: 'split', orientation, workarea, children };
  }
  return { type: 'leaf', workarea };
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
    for (const child of obj.children || []) {
      const div = document.createElement('div');
      div.style.flex = '1 1 0';
      container.appendChild(div);
      deserializeLayout(child, div);
    }
    container.classList.add('layout-container');
  } else {
    container.className = 'layout-container builder-grid canvas-grid';
    container.style.flex = '1 1 0';
  }
  if (obj.workarea) {
    container.dataset.workarea = 'true';
  }
}
