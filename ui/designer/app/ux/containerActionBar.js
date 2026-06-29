import { STRINGS } from '../i18n.js';
import { showPlacementPicker } from './placementPicker.js';

let activeContainer = null;

function safeContainerAction(action, el, handler) {
  try {
    handler?.();
  } catch (err) {
    // A broken container action should never take down the Designer shell.
    console.warn('[Designer] DESIGNER_CONTAINER_ACTION_FAILED', {
      action,
      nodeId: el?.dataset?.nodeId || null,
      mode: el?.dataset?.layoutMode || null
    }, err);
  }
}

function selectContainer(el) {
  if (!el || activeContainer === el) return;
  activeContainer?.classList?.remove('layout-container--active');
  activeContainer = el;
  el.classList.add('layout-container--active');
}

function currentMode(el) {
  if (el.dataset.layoutMode) return el.dataset.layoutMode;
  if (el.dataset.split === 'true') {
    return el.dataset.orientation === 'vertical' ? 'row' : 'stack';
  }
  return 'free';
}

function pxNumber(value, fallback = 0) {
  const raw = String(value || '').trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function colorValue(value) {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : '#ffffff';
}

function styleSourceTitle(el) {
  if (el.dataset.styleSourceEnabled === 'false') return STRINGS.containerStyleSourceEnable;
  if (el.dataset.styleSourceId) return STRINGS.containerStyleSourceDisable;
  if (el.dataset.styleSourceRole === 'source') return STRINGS.containerStyleSourceActive;
  return STRINGS.containerStyleSourceEnable;
}

export function attachContainerBar(el, ctx) {
  if (!el) return;
  const actions = ctx && typeof ctx === 'object' ? ctx : {};
  if (!el.__layoutContainerSelectBound) {
    el.__layoutContainerSelectBound = true;
    el.addEventListener('pointerdown', event => {
      if (event.target?.closest?.('.container-actionbar')) return;
      if (event.target?.closest?.('.layout-container') !== el) return;
      selectContainer(el);
    });
  }
  let bar = el.querySelector('.container-actionbar');
  if (bar) bar.remove();
  bar = document.createElement('div');
  bar.className = 'container-actionbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', STRINGS.containerToolbar);

  const makeBtn = (cls, icon, title, handler) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    if (title) {
      btn.title = title;
      btn.setAttribute('aria-label', title);
    }
    const img = document.createElement('img');
    img.src = `/assets/icons/${icon}.svg`;
    img.alt = title || icon;
    img.className = 'icon';
    btn.appendChild(img);
    if (handler) btn.addEventListener('click', ev => {
      ev.stopPropagation();
      ev.preventDefault();
      safeContainerAction(cls, el, () => handler(ev));
    });
    return btn;
  };

  const makeModeBtn = (mode, icon, title) => {
    const btn = makeBtn(`bar-mode bar-mode-${mode}`, icon, title, () => {
      actions.setContainerLayoutMode?.(el, mode);
    });
    btn.dataset.containerMode = mode;
    const disabled = mode === 'free' && el.dataset.split === 'true';
    btn.disabled = disabled;
    if (currentMode(el) === mode) btn.classList.add('active');
    return btn;
  };

  const makeNumberInput = (key, icon, title, value) => {
    const wrap = document.createElement('label');
    wrap.className = `bar-field bar-field-${key}`;
    wrap.title = title;
    const img = document.createElement('img');
    img.src = `/assets/icons/${icon}.svg`;
    img.alt = '';
    img.className = 'icon';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '96';
    input.step = '1';
    input.value = String(pxNumber(value));
    input.setAttribute('aria-label', title);
    input.addEventListener('change', () => {
      safeContainerAction(`setting:${key}`, el, () => {
        actions.setContainerSettings?.(el, { [key]: `${pxNumber(input.value)}px` });
      });
    });
    wrap.append(img, input);
    return wrap;
  };

  const addBtn = makeBtn('bar-add', 'plus', STRINGS.containerAdd, () => {
    actions.placeContainer?.(el, 'auto');
  });
  const placeBtn = makeBtn('bar-place', 'move', STRINGS.containerPlace, () => {
    showPlacementPicker(el, pos => {
      safeContainerAction(`place:${pos}`, el, () => actions.placeContainer?.(el, pos));
    });
  });
  const stackBtn = makeModeBtn('stack', 'rows-3', STRINGS.containerModeStack);
  const rowBtn = makeModeBtn('row', 'columns-3', STRINGS.containerModeRow);
  const freeBtn = makeModeBtn('free', 'mouse-pointer-2', STRINGS.containerModeFree);
  const gapInput = makeNumberInput('gap', 'space', STRINGS.containerGap, el.dataset.layoutGap);
  const paddingInput = makeNumberInput('padding', 'panel-top', STRINGS.containerPadding, el.dataset.layoutPadding);
  const bgInput = document.createElement('input');
  bgInput.type = 'color';
  bgInput.className = 'bar-color';
  bgInput.value = colorValue(el.dataset.layoutBackground);
  bgInput.title = STRINGS.containerBg;
  bgInput.setAttribute('aria-label', STRINGS.containerBg);
  bgInput.addEventListener('change', () => {
    safeContainerAction('setting:background', el, () => {
      actions.setContainerSettings?.(el, { background: bgInput.value });
    });
  });
  const styleSourceBtn = makeBtn('bar-style-source', el.dataset.styleSourceId ? 'unlink' : 'link', styleSourceTitle(el), () => actions.toggleContainerStyleSource?.(el));
  const hostBtn = makeBtn('bar-host', 'star', STRINGS.containerHost, () => actions.setDynamicHost?.(el));
  const designBtn = makeBtn('bar-design', 'file', STRINGS.containerDesign, () => {
    const id = typeof window !== 'undefined' && typeof window.prompt === 'function'
      ? window.prompt(STRINGS.containerDesignPrompt)
      : '';
    if (id) actions.setDesignRef?.(el, id.trim());
  });
  const delBtn = makeBtn('bar-delete', 'trash', STRINGS.containerDelete, () => actions.deleteContainer?.(el));

  if (el.dataset.workarea === 'true') hostBtn.classList.add('active');
  if (el.dataset.designRef) designBtn.classList.add('active');
  if (el.dataset.styleSourceId || el.dataset.styleSourceRole === 'source') styleSourceBtn.classList.add('active');
  if (el.classList.contains('layout-root')) delBtn.disabled = true;

  bar.append(addBtn, placeBtn, stackBtn, rowBtn, freeBtn, gapInput, paddingInput, bgInput, styleSourceBtn, hostBtn, designBtn, delBtn);
  el.prepend(bar);
}
