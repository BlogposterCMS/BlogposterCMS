import { createColorPicker } from './colorPicker.js';
import {
  state,
  setApplyHandlers,
  applyColor,
  applySize,
  applyFont,
  toggleStyle,
  getRegisteredEditable,
  applyToolbarChange
} from '../core/editor.js';
import { saveSelection, restoreSelection, isSelectionStyled, initSelectionTracking } from '../core/selection.js';

let updateButtonStates = () => {};

let toolbarPositionListenersAttached = false;

export function updateToolbarPosition() {
  if (!state.toolbar) return;
  const header = document.querySelector('.builder-header');
  if (!header) return;
  const rect = header.getBoundingClientRect();
  state.toolbar.style.top = rect.bottom + 'px';
}

function parseColor(val) {
  val = String(val || '').trim();
  if (val.startsWith('#')) {
    if (val.length === 4) {
      val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
    }
    const int = parseInt(val.slice(1), 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }
  const m = val.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3] };
  }
  return null;
}

function setActiveButtonAppearance(btn, active) {
  if (!btn) return;
  btn.classList.toggle('active', active);
  if (!active) {
    btn.style.color = '';
    return;
  }
  const userColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--user-color')
    .trim();
  const rgb = parseColor(userColor);
  let luminance = 0;
  if (rgb) {
    luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  }
  btn.style.color = luminance > 0.6 ? 'var(--color-text)' : 'var(--color-white)';
}

function splitRangeBoundaries(range) {
  if (range.startContainer.nodeType === 3) {
    const txt = range.startContainer;
    if (range.startOffset > 0 && range.startOffset < txt.length) {
      txt.splitText(range.startOffset);
      range.setStart(txt.nextSibling, 0);
    }
  }
  if (range.endContainer.nodeType === 3) {
    const txt = range.endContainer;
    if (range.endOffset > 0 && range.endOffset < txt.length) {
      txt.splitText(range.endOffset);
    }
  }
}

function applyStyleInternal(prop, value) {
  restoreSelection();
  if (!state.activeEl) return;
  const sel = window.getSelection();
  let range = null;
  if (sel && sel.rangeCount && !sel.isCollapsed && state.activeEl.contains(sel.anchorNode) && state.activeEl.contains(sel.focusNode)) {
    range = sel.getRangeAt(0);
  } else if (state.preservedRange && !state.preservedRange.collapsed) {
    range = state.preservedRange.cloneRange();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  const hasRange = !!range;
  const normalizeSize = v => parseFloat(v).toFixed(2);

  const touch = el => {
    const computedVal = getComputedStyle(el)[prop];
    const inlineVal = el.style[prop];
    let isAlreadySet;
    if (prop === 'fontSize') {
      isAlreadySet = normalizeSize(computedVal) === normalizeSize(value);
    } else {
      isAlreadySet = inlineVal === value || computedVal === value;
    }
    if (isAlreadySet) {
      el.style[prop] = '';
    } else {
      el.style[prop] = value;
    }
    if (el.tagName === 'SPAN' && !el.getAttribute('style')) {
      el.replaceWith(...el.childNodes);
    }
  };

  if (hasRange) {
    splitRangeBoundaries(range);
    let walkerRoot = range.commonAncestorContainer;
    if (walkerRoot.nodeType === 3) {
      walkerRoot = walkerRoot.parentNode;
    }
    const walker = document.createTreeWalker(
      walkerRoot,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: n => range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      }
    );
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(text => {
      let carrier = text.parentElement;
      if (carrier.tagName !== 'SPAN') {
        const span = document.createElement('span');
        carrier.insertBefore(span, text);
        span.appendChild(text);
        carrier = span;
      }
      touch(carrier);
    });
  } else {
    touch(state.activeEl);
  }

  state.preservedRange = hasRange ? range.cloneRange() : null;
  saveSelection();
  updateButtonStates();
}

export function initToolbar(stateObj, applyHandlerSetter, updateBtnStates) {
  state.toolbar = stateObj.toolbar;
  state.preservedRange = stateObj.preservedRange || null;
  updateButtonStates = updateBtnStates;
  if (state.toolbar) return Promise.resolve();
  state.toolbar = document.body.querySelector('.text-block-editor-toolbar');
  if (!state.toolbar) {
    state.toolbar = document.createElement('div');
    state.toolbar.className = 'text-block-editor-toolbar';
    state.toolbar.style.display = 'none';
    state.toolbar.innerHTML = [
      '<div class="font-family-control">' +
        '<div class="ff-dropdown">' +
          '<button type="button" class="ff-btn"><span class="ff-label">Font</span></button>' +
          '<div class="ff-options"></div>' +
        '</div>' +
      '</div>',
      '<button type="button" class="tb-btn" data-cmd="bold">' + window.featherIcon('bold') + '</button>',
      '<button type="button" class="tb-btn" data-cmd="italic">' + window.featherIcon('italic') + '</button>',
      '<button type="button" class="tb-btn" data-cmd="underline">' + window.featherIcon('underline') + '</button>',
      '<select class="heading-select" style="display:none">' +
        ['h1','h2','h3','h4','h5','h6'].map(h => `<option value="${h}">${h.toUpperCase()}</option>`).join('') +
      '</select>',
      '<div class="font-size-control">' +
        '<button type="button" class="tb-btn fs-dec">-</button>' +
        '<div class="fs-dropdown">' +
          '<button type="button" class="fs-btn"><span>' +
            '<input type="number" class="fs-input" value="16" min="1" max="800" step="0.1" pattern="\\d*" tabindex="-1" placeholder="--" />' +
          '</span></button>' +
          '<div class="fs-options">' +
            [12,14,16,18,24,36].map(s => `<span data-size="${s}">${s}</span>`).join('') +
          '</div>' +
        '</div>' +
        '<button type="button" class="tb-btn fs-inc">+</button>' +
      '</div>'
    ].join('');
    document.body.appendChild(state.toolbar);
  }
  state.toolbar.style.display = 'none';

  state.toolbar.addEventListener('pointerdown', ev => {
    saveSelection();
    ev.preventDefault();
    ev.stopPropagation();
  }, true);

  const fsInput = state.toolbar.querySelector('.fs-input');

  function updateFontSizeInput() {
    if (!state.activeEl || !fsInput) return;
    const computedSize = window.getComputedStyle(state.activeEl).fontSize;
    fsInput.value = parseFloat(computedSize);
  }

  updateButtonStates = function() {
    if (!state.toolbar || !state.activeEl) return;
    const map = {
      bold: ['fontWeight', 'bold'],
      italic: ['fontStyle', 'italic'],
      underline: ['textDecoration', 'underline']
    };
    for (const [cmd, [prop, val]] of Object.entries(map)) {
      const btn = state.toolbar.querySelector(`[data-cmd="${cmd}"]`);
      if (!btn) continue;
      const active = isSelectionStyled(prop, val);
      setActiveButtonAppearance(btn, active);
    }
    updateFontSizeInput();
  };

  document.addEventListener('selectionchange', () => {
    if (state.pendingSelectionUpdate) return;
    state.pendingSelectionUpdate = requestAnimationFrame(() => {
      updateButtonStates();
      state.pendingSelectionUpdate = null;
    });
  });

  applyHandlerSetter({
    toggle: applyStyleInternal,
    font: font => applyStyleInternal('fontFamily', font),
    size: size => applyStyleInternal('fontSize', parseFloat(size) + 'px'),
    color: color => applyStyleInternal('color', color)
  });

  state.toolbar.addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-cmd]');
    if (!btn) return;
    ev.preventDefault();
    if (!state.activeEl || !document.body.contains(state.activeEl)) {
      const w = document.querySelector('.canvas-item.selected');
      state.activeEl = w ? getRegisteredEditable(w) : null;
    }
    if (!state.activeEl) return;
    const cmd = btn.dataset.cmd;
    if (cmd === 'bold') toggleStyle('fontWeight', 'bold');
    if (cmd === 'italic') toggleStyle('fontStyle', 'italic');
    if (cmd === 'underline') toggleStyle('textDecoration', 'underline');
  });

  const colorWrapper = document.createElement('div');
  colorWrapper.className = 'text-color-picker';
  const colorBtn = document.createElement('button');
  colorBtn.type = 'button';
  colorBtn.className = 'color-picker-toggle tb-btn';
  const colorIcon = document.createElement('span');
  colorIcon.className = 'color-icon';
  colorIcon.textContent = 'A';
  colorIcon.style.textDecorationColor = state.currentColor;
  colorBtn.appendChild(colorIcon);
  const themeColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent-color')
    .trim();
  state.colorPicker = createColorPicker({
    presetColors: [
      '#FF0000', '#FF4040', '#FFC0CB', '#FF00FF', '#800080', '#8A2BE2',
      '#00CED1', '#00FFFF', '#40E0D0', '#ADD8E6', '#4169E1', '#0047AB',
      '#008000', '#7CFC00', '#BFFF00', '#FFFF00', '#FFDAB9', '#FFA500',
      '#000000', '#A9A9A9', '#808080'
    ],
    themeColors: themeColor ? [themeColor] : [],
    initialColor: state.currentColor,
    onSelect: c => {
      applyColor(c);
      colorIcon.style.textDecorationColor = c;
    },
    onClose: () => colorBtn.focus()
  });
  state.colorPicker.el.classList.add('floating', 'hidden');
  document.body.appendChild(state.colorPicker.el);
  state.colorPicker.el.addEventListener('pointerdown', ev => {
    if (ev.target.classList.contains('swatch')) {
      saveSelection();
      ev.preventDefault();
      ev.stopPropagation();
    }
  }, true);
  colorBtn.addEventListener('click', () => {
    saveSelection();
    if (state.colorPicker.el.classList.contains('hidden')) {
      const rect = colorBtn.getBoundingClientRect();
      state.colorPicker.showAt(
        rect.left + window.scrollX,
        rect.bottom + window.scrollY
      );
    } else {
      state.colorPicker.hide();
    }
  });
  document.addEventListener('selected', () => state.colorPicker.hide());
  colorWrapper.appendChild(colorBtn);
  state.toolbar.appendChild(colorWrapper);

  const ffControl = state.toolbar.querySelector('.font-family-control');
  const ffDropdown = state.toolbar.querySelector('.ff-dropdown');
  const ffOptions = state.toolbar.querySelector('.ff-options');
  const ffBtn = state.toolbar.querySelector('.ff-btn');
  const ffLabel = state.toolbar.querySelector('.ff-label');
  const fsDropdown = state.toolbar.querySelector('.fs-dropdown');
  const fsOptions = state.toolbar.querySelector('.fs-options');
  const fsBtn = state.toolbar.querySelector('.fs-btn');

  const populateFonts = () => {
    const fonts = Array.isArray(window.AVAILABLE_FONTS) ? window.AVAILABLE_FONTS : [];
    ffOptions.innerHTML = fonts
      .map(f => `<span data-font="${f}" style="font-family:'${f}'">${f}</span>`)
      .join('');
    if (fonts.length) ffLabel.textContent = fonts[0];
  };
  populateFonts();
  document.addEventListener('fontsUpdated', populateFonts);

  state.toolbar.querySelector('.fs-inc').addEventListener('click', () => {
    saveSelection();
    const input = state.toolbar.querySelector('.fs-input');
    const newSize = (parseFloat(input.value) || 16) + 1;
    input.value = newSize;
    applySize(newSize);
    if (state.activeEl) {
      state.activeEl.dispatchEvent(new Event('input'));
    }
  });

  state.toolbar.querySelector('.fs-dec').addEventListener('click', () => {
    saveSelection();
    const input = state.toolbar.querySelector('.fs-input');
    const newSize = Math.max((parseFloat(input.value) || 16) - 1, 1);
    input.value = newSize;
    applySize(newSize);
    if (state.activeEl) {
      state.activeEl.dispatchEvent(new Event('input'));
    }
  });

  const filterOptions = val => {
    fsOptions.querySelectorAll('span[data-size]').forEach(span => {
      span.style.display = !val || span.textContent.startsWith(val)
        ? 'block' : 'none';
    });
  };

  fsBtn.addEventListener('click', () => {
    fsDropdown.classList.toggle('open');
    const input = state.toolbar.querySelector('.fs-input');
    input.focus();
  });

  ffBtn.addEventListener('click', () => {
    ffControl.classList.toggle('open');
  });

  document.addEventListener('click', ev => {
    if (!ffControl.contains(ev.target)) ffControl.classList.remove('open');
  });

  ffOptions.addEventListener('click', ev => {
    const opt = ev.target.closest('span[data-font]');
    if (!opt) return;
    applyFont(opt.dataset.font);
    ffControl.classList.remove('open');
  });

  ['pointerdown', 'click'].forEach(evt => {
    fsInput.addEventListener(evt, ev => ev.stopPropagation());
  });

  const fsInputHandler = () => {
    fsDropdown.classList.add('open');
    filterOptions(fsInput.value);
  };
  fsInput.addEventListener('focus', fsInputHandler);
  fsInput.addEventListener('input', fsInputHandler);
  fsInput.addEventListener('change', () => applySize(fsInput.value));
  fsInput.addEventListener('blur', () => {
    setTimeout(() => fsDropdown.classList.remove('open'), 150);
  });

  fsOptions.addEventListener('click', ev => {
    const opt = ev.target.closest('span[data-size]');
    if (!opt) return;
    applySize(opt.dataset.size);
    fsDropdown.classList.remove('open');
  });

  state.toolbar.addEventListener('input', e => {
    const target = e.target;
    if (!state.activeEl) return;
    if (target.matches('.fs-input')) {
      if (state.activeEl.getAttribute('contenteditable') !== 'true') {
        applyToolbarChange(state.activeEl, 'fontSize', target.value + 'px');
      }
    }
  });

  initSelectionTracking();
}

export function showToolbar() {
  if (!state.toolbar) return;
  const content = document.getElementById('content');
  if (content && state.toolbar.parentElement !== content) {
    content.prepend(state.toolbar);
  }
  updateToolbarPosition();
  if (!toolbarPositionListenersAttached) {
    window.addEventListener('scroll', updateToolbarPosition);
    window.addEventListener('resize', updateToolbarPosition);
    toolbarPositionListenersAttached = true;
  }
  state.toolbar.style.display = 'flex';
  updateButtonStates();
}

export function hideToolbar() {
  if (!state.toolbar) return;
  state.toolbar.style.display = 'none';
  const headingSelect = state.toolbar.querySelector('.heading-select');
  if (headingSelect) {
    headingSelect.style.display = 'none';
    headingSelect.onchange = null;
  }
  if (toolbarPositionListenersAttached) {
    window.removeEventListener('scroll', updateToolbarPosition);
    window.removeEventListener('resize', updateToolbarPosition);
    toolbarPositionListenersAttached = false;
  }
}


