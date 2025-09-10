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
  const container = ev.target.closest('.layout-container');
  if (!container) return;
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
  if (!rootEl.querySelector('.layout-container')) {
    showSplitChooser(rootEl);
  }
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
    const workspace = container.querySelector('#workspaceMain');
    if (workspace && !workspace.classList.contains('layout-container')) {
      workspace.classList.add('layout-container');
      workspace.style.flex = '1 1 0';
      workspace.style.minHeight = '100%';
    }
    container.dataset.split = 'true';
    container.dataset.orientation = orientation === 'horizontal' ? 'horizontal' : 'vertical';
    container.style.display = 'flex';
    container.style.flexDirection = container.dataset.orientation === 'horizontal' ? 'column' : 'row';
    const grid = document.createElement('div');
    grid.className = 'layout-container builder-grid canvas-grid';
    grid.style.flex = '1 1 0';
    grid.style.minHeight = '100%';
    grid.id = generateGridId();
    container.appendChild(grid);
    cleanupChooser();
    if (typeof state.onChange === 'function') {
      try { state.onChange(); } catch (e) { console.warn('[splitMode] onChange error', e); }
    }
    return;
  }
  if (alreadySplit) return;
  if (container.id === 'workspaceMain') {
    const parent = container.parentElement;
    if (parent) {
      const grid = document.createElement('div');
      grid.className = 'layout-container builder-grid canvas-grid';
      grid.style.flex = '1 1 0';
      grid.style.minHeight = '100%';
      grid.id = generateGridId();
      parent.appendChild(grid);
      cleanupChooser();
      if (typeof state.onChange === 'function') {
        try { state.onChange(); } catch (e) { console.warn('[splitMode] onChange error', e); }
      }
    }
    return;
  }
  const existing = Array.from(container.childNodes);
  const first = document.createElement('div');
  const second = document.createElement('div');
  first.className = 'layout-container builder-grid canvas-grid';
  second.className = 'layout-container builder-grid canvas-grid';
  first.style.flex = '1 1 0';
  second.style.flex = '1 1 0';
  first.style.minHeight = '100%';
  second.style.minHeight = '100%';
  first.id = generateGridId();
  second.id = generateGridId();
  if (existing.length) {
    first.append(...existing);
  }
  container.dataset.split = 'true';
  container.dataset.orientation = orientation === 'horizontal' ? 'horizontal' : 'vertical';
  container.style.display = 'flex';
  container.style.flexDirection = container.dataset.orientation === 'horizontal' ? 'column' : 'row';
  container.replaceChildren(first, second);
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

export function deserializeLayout(obj, container, workEl = document.getElementById('workspaceMain')) {
  if (!container || !obj) return;
  if (!obj.orientation && (!obj.children || !obj.children.length)) {
    if (workEl && container === document.getElementById('layoutRoot')) {
      container.replaceChildren(workEl);
    } else {
      container.replaceChildren();
    }
    if (obj.workarea && workEl) {
      workEl.dataset.workarea = 'true';
      workEl.classList.add('layout-container', 'builder-grid', 'canvas-grid');
      workEl.style.flex = '1 1 0';
      workEl.style.minHeight = '100%';
    }
    return;
  }
  container.dataset.split = obj.orientation ? 'true' : 'false';
  if (obj.orientation) {
    container.dataset.orientation = obj.orientation;
    container.style.display = 'flex';
    container.style.flexDirection = obj.orientation === 'horizontal' ? 'column' : 'row';
  } else {
    container.style.removeProperty('display');
    container.style.removeProperty('flex-direction');
  }
  const children = [];
  for (const child of obj.children || []) {
    let el;
    if (child.workarea && workEl) {
      el = workEl;
      el.classList.add('layout-container', 'builder-grid', 'canvas-grid');
      el.style.flex = '1 1 0';
      el.style.minHeight = '100%';
    } else {
      el = document.createElement('div');
      el.className = 'layout-container builder-grid canvas-grid';
      el.style.flex = '1 1 0';
      el.style.minHeight = '100%';
      el.id = generateGridId();
    }
    deserializeLayout(child, el, workEl && el === workEl ? workEl : null);
    children.push(el);
  }
  container.replaceChildren(...children);
  if (obj.workarea && container === workEl) {
    container.dataset.workarea = 'true';
  }
}
