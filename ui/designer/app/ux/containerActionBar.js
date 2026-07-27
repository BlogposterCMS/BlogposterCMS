import { STRINGS } from '../i18n.js';

let activeContainer = null;

function safeContainerAction(action, el, handler) {
  try {
    const result = handler?.();
    if (result && typeof result.catch === 'function') {
      result.catch(err => {
        console.warn('[Designer] DESIGNER_CONTAINER_ACTION_FAILED', {
          action,
          nodeId: el?.dataset?.nodeId || null,
          mode: el?.dataset?.layoutMode || null
        }, err);
      });
    }
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

function visibleMode(el) {
  const mode = currentMode(el);
  return mode === 'stack' || mode === 'row' ? 'auto' : mode;
}

function nextMode(el) {
  const mode = visibleMode(el);
  if (mode === 'free') {
    return el.dataset.layoutAutoDirection === 'horizontal' ? 'row' : 'stack';
  }
  if (mode === 'auto') return 'grid';
  return 'free';
}

function modePresentation(el) {
  const mode = visibleMode(el);
  if (mode === 'auto') return { icon: 'rows-3', title: 'Auto layout' };
  if (mode === 'grid') return { icon: 'grid-3x3', title: STRINGS.containerModeGrid };
  return { icon: 'mouse-pointer-2', title: STRINGS.containerModeFree };
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

export function attachContainerBar(el, ctx) {
  if (!el) return;
  if (
    el.classList.contains('layout-page-root') ||
    el.classList.contains('layout-section')
  ) {
    // Sections use their compact, section-owned toolbar. Reusing the nested
    // Container bar here would expose two competing mode/background controls.
    el.querySelector(':scope > .container-actionbar')?.remove();
    return;
  }
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
    input.max = key === 'minHeight' ? '2400' : '96';
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
  const duplicateBtn = makeBtn('bar-duplicate', 'copy', 'Duplicate', () => {
    return actions.duplicateContainer?.(el, { linked: false });
  });
  const linkedDuplicateBtn = makeBtn('bar-duplicate-linked', 'link-2', 'Linked copy', () => {
    return actions.duplicateContainer?.(el, { linked: true });
  });
  const modeState = modePresentation(el);
  const modeBtn = makeBtn('bar-mode bar-mode-cycle', modeState.icon, `${modeState.title} · click to change`, () => {
    actions.setContainerLayoutMode?.(el, nextMode(el));
  });
  modeBtn.dataset.containerMode = visibleMode(el);
  modeBtn.classList.add('active');
  const directionBtn = makeBtn('bar-auto-direction', 'arrow-right', 'Auto layout direction', () => {
    const horizontal = currentMode(el) !== 'row';
    el.dataset.layoutAutoDirection = horizontal ? 'horizontal' : 'vertical';
    actions.setContainerLayoutMode?.(el, horizontal ? 'row' : 'stack');
  });
  directionBtn.hidden = currentMode(el) !== 'stack' && currentMode(el) !== 'row';
  const gapInput = makeNumberInput('gap', 'space', STRINGS.containerGap, el.dataset.layoutGap);
  const paddingInput = makeNumberInput('padding', 'panel-top', STRINGS.containerPadding, el.dataset.layoutPadding);
  const minHeightInput = makeNumberInput('minHeight', 'ruler', STRINGS.containerMinHeight, el.dataset.layoutMinHeight);
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
  const isStyleFollower = Boolean(el.dataset.styleSourceId) && el.dataset.styleSourceEnabled !== 'false';
  const styleSourceBtn = isStyleFollower
    ? makeBtn('bar-style-source', 'unlink', 'Style linked · unlink', () => actions.unlinkContainerStyleSource?.(el))
    : null;
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
  if (styleSourceBtn) styleSourceBtn.classList.add('active');
  if (el.classList.contains('layout-root') || el.classList.contains('layout-section')) {
    delBtn.disabled = true;
  }

  bar.append(
    addBtn,
    duplicateBtn,
    linkedDuplicateBtn,
    modeBtn,
    directionBtn,
    gapInput,
    paddingInput,
    minHeightInput,
    bgInput,
    ...(styleSourceBtn ? [styleSourceBtn] : []),
    hostBtn,
    designBtn,
    delBtn
  );
  el.prepend(bar);
}
