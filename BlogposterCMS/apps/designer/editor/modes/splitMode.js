const state = {
  rootEl: null,
  onChange: null,
  escHandler: null,
  clickHandler: null,
  chooserEl: null
};

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
  const container = ev.target.closest('.layout-container');
  if (!container) return;
  ev.stopPropagation();
  showSplitChooser(container, ev.clientX, ev.clientY);
}

export function enterSplitMode({ rootEl, onChange } = {}) {
  if (!rootEl) return;
  state.rootEl = rootEl;
  state.onChange = typeof onChange === 'function' ? onChange : () => {};
  if (!rootEl.querySelector('.layout-container')) {
    const root = document.createElement('div');
    root.className = 'layout-container';
    root.style.minHeight = '100%';
    root.style.flex = '1 1 auto';
    rootEl.appendChild(root);
  }
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
  if (!container || container.dataset.split === 'true') return;
  const hasWorkspace = container.querySelector('#workspaceMain');
  if (hasWorkspace && container.id !== 'layoutRoot') {
    const parent = container.parentElement;
    if (parent) {
      const div = document.createElement('div');
      div.className = 'layout-container';
      div.style.flex = '1 1 0';
      const grid = document.createElement('div');
      grid.className = 'builder-grid';
      div.appendChild(grid);
      parent.appendChild(div);
      cleanupChooser();
      if (typeof state.onChange === 'function') {
        try { state.onChange(); } catch (e) { console.warn('[splitMode] onChange error', e); }
      }
    }
    return;
  }
  const existing = Array.from(container.childNodes);
  const frag = document.createDocumentFragment();
  let existingGrid = null;
  existing.forEach(ch => {
    if (ch.classList && ch.classList.contains('builder-grid')) {
      existingGrid = existingGrid || ch;
      container.removeChild(ch);
    } else {
      frag.appendChild(ch);
    }
  });
  const isWorkarea = container.dataset.workarea === 'true';
  container.dataset.split = 'true';
  container.dataset.orientation = orientation === 'horizontal' ? 'horizontal' : 'vertical';
  container.classList.add('layout-container');
  container.style.display = 'flex';
  container.style.flexDirection = container.dataset.orientation === 'horizontal' ? 'column' : 'row';
  const childA = document.createElement('div');
  const childB = document.createElement('div');
  childA.className = 'layout-container';
  childB.className = 'layout-container';
  childA.style.flex = '1 1 0';
  childB.style.flex = '1 1 0';
  container.appendChild(childA);
  container.appendChild(childB);
  childA.appendChild(frag);
  const gridA = existingGrid || document.createElement('div');
  gridA.classList.add('builder-grid');
  childA.appendChild(gridA);
  const gridB = document.createElement('div');
  gridB.className = 'builder-grid';
  childB.appendChild(gridB);
  if (isWorkarea) {
    childA.dataset.workarea = 'true';
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
  const vBtn = document.createElement('button');
  vBtn.type = 'button';
  vBtn.className = 'split-vertical';
  vBtn.innerHTML = '<img src="/assets/icons/square-split-vertical.svg" alt="vertical" />';
  const hBtn = document.createElement('button');
  hBtn.type = 'button';
  hBtn.className = 'split-horizontal';
  hBtn.innerHTML = '<img src="/assets/icons/square-split-horizontal.svg" alt="horizontal" />';
  vBtn.addEventListener('click', ev => {
    ev.stopPropagation();
    splitContainer(container, 'vertical');
  });
  hBtn.addEventListener('click', ev => {
    ev.stopPropagation();
    splitContainer(container, 'horizontal');
  });
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
  const orientation = container.dataset.orientation || null;
  const children = Array.from(container.children)
    .filter(ch => ch.classList.contains('layout-container'))
    .map(ch => serializeLayout(ch));
  const workarea = container.dataset.workarea === 'true';
  return { orientation, workarea, children };
}

export function deserializeLayout(obj, container) {
  if (!container || !obj) return;
  container.replaceChildren();
  if (obj.orientation) {
    container.dataset.split = 'true';
    container.dataset.orientation = obj.orientation;
    container.style.display = 'flex';
    container.style.flexDirection = obj.orientation === 'horizontal' ? 'column' : 'row';
    for (const child of obj.children || []) {
      const div = document.createElement('div');
      div.className = 'layout-container';
      div.style.flex = '1 1 0';
      container.appendChild(div);
      deserializeLayout(child, div);
    }
  }
  if (obj.workarea) {
    container.dataset.workarea = 'true';
  }
}
