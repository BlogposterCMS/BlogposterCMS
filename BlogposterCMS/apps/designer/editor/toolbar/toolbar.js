import { createColorPicker } from '/assets/js/colorPicker.js';
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
import { fetchPartial } from '../../fetchPartial.js';
import { sanitizeHtml } from '../../../../public/plainspace/sanitizer.js';

// Debug helper (enable with window.DEBUG_TEXT_EDITOR = true)
function DBG(...args) {
  try { if (window.DEBUG_TEXT_EDITOR) console.log('[TE/toolbar]', ...args); } catch (e) {}
}

function ensureActiveEditable() {
  if (state.activeEl && document.body.contains(state.activeEl)) return state.activeEl;
  const w = document.querySelector('.canvas-item.selected');
  let editable = w ? getRegisteredEditable(w) : null;
  if (!editable && w) editable = w.querySelector('[data-text-editable], .editable');
  if (editable) state.activeEl = editable;
  DBG('ensureActiveEditable', { activeId: state.activeEl?.id, widgetId: w?.id });
  return state.activeEl;
}

let updateButtonStates = () => {};

let toolbarPositionListenersAttached = false;

export function updateToolbarPosition() {
  if (!state.toolbar) return;
  const header = document.querySelector('.builder-header');
  if (!header) return;
  const rect = header.getBoundingClientRect();
  state.toolbar.style.top = rect.bottom + 'px';
  // Clear any inline horizontal positioning so CSS can center it
  state.toolbar.style.left = '';
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
  // Ensure target is the inner editable, not a wrapper
  if (!('textEditable' in (state.activeEl.dataset || {}))) {
    const innerEditable = state.activeEl.querySelector?.('[data-text-editable]');
    if (innerEditable) state.activeEl = innerEditable;
  }
  const targetEl = state.activeEl;
  DBG('applyStyleInternal', { prop, value, targetId: targetEl?.id, targetCls: targetEl?.className });
  // Detect mode early and clear any stale ranges when not editing
  const widgetEl = targetEl?.closest?.('.canvas-item');
  const isEditMode =
    (targetEl && targetEl.getAttribute('contenteditable') === 'true') ||
    (widgetEl && widgetEl.classList?.contains('editing'));
  DBG('mode', { isEditMode, contenteditable: targetEl?.getAttribute('contenteditable') });

  if (!isEditMode) {
    const s = window.getSelection?.();
    if (s && s.removeAllRanges) s.removeAllRanges();
    state.preservedRange = null;
    DBG('cleared selection because not edit mode');
  }

  let sel = window.getSelection();
  let range = null;
  if (
    sel &&
    sel.rangeCount &&
    !sel.isCollapsed &&
    targetEl.contains(sel.anchorNode) &&
    targetEl.contains(sel.focusNode)
  ) {
    range = sel.getRangeAt(0);
  } else if (state.preservedRange && !state.preservedRange.collapsed) {
    range = state.preservedRange.cloneRange();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  const hasRange = !!range;
  DBG('selection', { hasRange, preserved: !!state.preservedRange });
  const normalizeSize = v => parseFloat(v).toFixed(2);

  const touch = el => {
    const computedVal = getComputedStyle(el)[prop];
    const inlineVal = el.style[prop];
    let isAlreadySet;
    if (prop === 'fontSize') {
      // For font size, always set the explicit value on the carrier (no toggle)
      isAlreadySet = normalizeSize(computedVal) === normalizeSize(value);
      DBG('touch:fontSize', { elId: el.id, elCls: el.className, from: computedVal, to: value, same: isAlreadySet });
      el.style.fontSize = value;
    } else {
      isAlreadySet = inlineVal === value || computedVal === value;
      DBG('touch', { elId: el.id, elCls: el.className, computedVal, inlineVal, value, isAlreadySet });
      if (isAlreadySet) {
        el.style[prop] = '';
      } else {
        el.style[prop] = value;
      }
    }
    if (el.tagName === 'SPAN' && !el.getAttribute('style')) {
      el.replaceWith(...el.childNodes);
    }
  };

  if (hasRange) {
    splitRangeBoundaries(range);
    // Special handling for fontSize: prefer surroundContents for clean wrapping
    if (prop === 'fontSize') {
      try {
        const wrap = document.createElement('span');
        wrap.style.fontSize = value;
        range.surroundContents(wrap);
        const newRange = document.createRange();
        newRange.selectNodeContents(wrap);
        // Update the actual selection to the new wrapped contents
        const sel2 = window.getSelection();
        sel2.removeAllRanges();
        sel2.addRange(newRange);
        // Keep both preservedRange trackers in sync
        state.preservedRange = newRange.cloneRange();
        saveSelection();
        DBG('range-apply:surroundContents', { wrapped: true });
        updateButtonStates();
        return;
      } catch (e) {
        DBG('range-apply:surroundContents failed -> walker fallback', e?.message || e);
      }
    }
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
    DBG('range-apply', { nodes: nodes.length });
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
    // Edit mode but no active selection: do not style whole element
    // Selection mode (not contenteditable): style whole element
    if (!isEditMode) {
      DBG('whole-element-apply', { targetId: targetEl?.id });
      touch(targetEl);
      try {
        if (window.DEBUG_TEXT_EDITOR) {
          const prevOutline = targetEl.style.outline;
          targetEl.style.outline = '1px dashed magenta';
          setTimeout(() => { try { targetEl.style.outline = prevOutline; } catch(e){} }, 600);
        }
      } catch (e) {}
    } else {
      DBG('edit-mode-no-selection-skip');
    }
  }

  state.preservedRange = hasRange ? range.cloneRange() : null;
  saveSelection();
  DBG('done', { preservedRange: !!state.preservedRange });
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
    const contentEl = document.getElementById('content');
    if (contentEl) {
      contentEl.prepend(state.toolbar);
    } else {
      document.body.appendChild(state.toolbar);
    }
  }
  state.toolbar.style.display = 'none';

  state.toolbar.addEventListener('pointerdown', ev => {
    saveSelection();
    // Allow default for interactive controls so their click fires reliably
    const allowDefault = ev.target.closest?.(
      '.fs-options, .ff-options, .fs-btn, .ff-btn, .tb-btn, .color-picker-toggle, .fs-dec, .fs-inc, input, select, button'
    );
    if (!allowDefault) ev.preventDefault();
    ev.stopPropagation();
  }, true);

  const fsInput = state.toolbar.querySelector('.fs-input');

  function updateFontSizeInput() {
    if (!state.activeEl || !fsInput) return;
    const el = state.activeEl;
    const sel = window.getSelection();
    let useEl = el;
    if (
      sel && sel.rangeCount && !sel.isCollapsed &&
      el.contains(sel.anchorNode) && el.contains(sel.focusNode)
    ) {
      // Find first text node in range and use its parent for size
      const range = sel.getRangeAt(0);
      let walkerRoot = range.commonAncestorContainer;
      if (walkerRoot.nodeType === 3) walkerRoot = walkerRoot.parentNode;
      const walker = document.createTreeWalker(
        walkerRoot,
        NodeFilter.SHOW_TEXT,
        { acceptNode: n => range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
      );
      while (walker.nextNode()) {
        const parent = walker.currentNode?.parentElement;
        if (parent) { useEl = parent; break; }
      }
    }
    const computedSize = window.getComputedStyle(useEl).fontSize;
    const numeric = parseFloat(computedSize);
    if (!Number.isNaN(numeric)) fsInput.value = numeric;
    DBG('updateFontSizeInput', { targetId: useEl?.id, fontSize: computedSize });
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
    updateFontLabelFromSelection();
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

  function rgbToHex(rgb) {
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    const r = parseInt(m[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(m[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(m[3], 10).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toUpperCase();
  }

  function collectDocumentColors() {
    const colors = new Set();
    const grid = document.getElementById('builderGrid');
    if (!grid) return [];
    grid.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      ['color', 'backgroundColor', 'borderColor'].forEach(prop => {
        const val = style[prop];
        if (val && val.startsWith('rgb')) {
          const hex = rgbToHex(val);
          if (hex) colors.add(hex);
        }
      });
    });
    return Array.from(colors);
  }

  state.toolbar.addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-cmd]');
    if (!btn) return;
    ev.preventDefault();
    // Always resolve the editable for the currently selected widget
    // to avoid acting on the wrong element when state gets stale.
    const w = document.querySelector('.canvas-item.selected');
    let editable = w ? getRegisteredEditable(w) : null;
    if (!editable && w) {
      editable = w.querySelector('[data-text-editable], .editable');
    }
    if (editable) state.activeEl = editable;
    // Fallback if no widget is selected, keep existing activeEl if valid
    if (!state.activeEl || !document.body.contains(state.activeEl)) {
      state.activeEl = editable || null;
    }
    if (!state.activeEl) return;
    const cmd = btn.dataset.cmd;
    DBG('toolbar-click', { cmd, widgetId: w?.id, editableId: editable?.id, activeId: state.activeEl?.id });
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
    documentColors: collectDocumentColors(),
    themeColors: themeColor ? [themeColor] : []
  });
  // Prepare color picker for panel usage; keep hidden until panel opens.
  state.colorPicker.el.classList.add('hidden');
  state.colorPicker.el.addEventListener('pointerdown', ev => {
    if (
      ev.target.classList.contains('swatch') ||
      ev.target.classList.contains('color-circle')
    ) {
      saveSelection();
      ev.preventDefault();
      ev.stopPropagation();
    }
  }, true);
  async function openColorSidebar() {
    const sidebar = document.getElementById('sidebar');
    state.colorPicker.updateOptions({ documentColors: collectDocumentColors() });
    const panelContainer = sidebar?.querySelector('#builderPanel');
    if (!panelContainer) return false;

    // Ensure the color panel markup exists; preload by index.js, else fetch lazily
    let colorPanel = panelContainer.querySelector('.color-panel');
    if (!colorPanel) {
      try {
        const html = await fetchPartial('color-panel', 'builder');
        panelContainer.insertAdjacentHTML('beforeend', sanitizeHtml(html));
        colorPanel = panelContainer.querySelector('.color-panel');
      } catch (e) {
        console.warn('[Toolbar] Failed to fetch color panel:', e);
        // Fallback: show floating picker if partial unavailable
        return false;
      }
    }

    // Hide other builder panels (e.g., text-panel) and show color panel only
    panelContainer.querySelectorAll('.builder-panel').forEach(p => {
      p.style.display = p.classList.contains('color-panel') ? '' : 'none';
    });

    // Mount the color picker inside the panel content container
    const host = colorPanel.querySelector('.color-panel-content') || colorPanel;
    if (state.colorPicker.el.parentElement !== host) {
      host.appendChild(state.colorPicker.el);
    }
    state.colorPicker.el.classList.remove('hidden');
    // Reset any floating styles
    state.colorPicker.el.classList.remove('floating');
    state.colorPicker.el.style.position = '';
    state.colorPicker.el.style.left = '';
    state.colorPicker.el.style.top = '';

    // Wire collapse button
    const collapseBtn = colorPanel.querySelector('.collapse-btn');
    if (collapseBtn && !collapseBtn.__bpBound) {
      collapseBtn.__bpBound = true;
      collapseBtn.addEventListener('click', () => closeColorSidebar());
    }

    document.body.classList.add('panel-open', 'panel-opening');
    setTimeout(() => document.body.classList.remove('panel-opening'), 200);
    return true;
  }

  function closeColorSidebar() {
    const sidebar = document.getElementById('sidebar');
    const panelContainer = sidebar?.querySelector('#builderPanel');
    // Hide color panel and show other panels back (e.g., text-panel)
    panelContainer?.querySelectorAll('.builder-panel').forEach(p => {
      if (p.classList.contains('color-panel')) {
        p.style.display = 'none';
      } else {
        p.style.display = '';
      }
    });
    // Hide picker content
    state.colorPicker.el.classList.add('hidden');
    document.body.classList.add('panel-closing');
    document.body.classList.remove('panel-open');
    setTimeout(() => document.body.classList.remove('panel-closing'), 200);
    try { colorBtn.focus(); } catch (e) {}
  }

  colorBtn.addEventListener('click', async () => {
    saveSelection();
    state.colorPicker.updateOptions({
      initialColor: state.currentColor,
      onSelect: c => {
        applyColor(c);
        colorIcon.style.textDecorationColor = c;
      },
      onClose: () => closeColorSidebar()
    });
    // If color sidebar already open -> close it (toggle)
    const sidebar = document.getElementById('sidebar');
    const panelContainer = sidebar?.querySelector('#builderPanel');
    const colorPanel = panelContainer?.querySelector('.color-panel');
    const colorPanelVisible = !!(
      colorPanel &&
      colorPanel.style.display !== 'none' &&
      document.body.classList.contains('panel-open') &&
      !state.colorPicker.el.classList.contains('hidden')
    );
    if (colorPanelVisible) { closeColorSidebar(); return; }
    // Prefer sidebar panel if available; otherwise fall back to floating picker
    if (!(await openColorSidebar())) {
      // Fallback: ensure picker is attached to body for floating mode
      if (!document.body.contains(state.colorPicker.el)) {
        state.colorPicker.el.classList.add('floating');
        document.body.appendChild(state.colorPicker.el);
      }
      if (state.colorPicker.el.classList.contains('hidden')) {
        const rect = colorBtn.getBoundingClientRect();
        state.colorPicker.showAt(
          rect.left + window.scrollX,
          rect.bottom + window.scrollY
        );
      } else {
        state.colorPicker.hide();
      }
    }
  });

  // When selection changes to a new widget, close/hide picker and panel
  document.addEventListener('selected', () => {
    state.colorPicker.hide();
  });
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
  let fsPortal = null;
  let fsOriginalParent = null;
  let ffPortal = null;
  let ffOriginalParent = null;

  function positionFsOptions() {
    if (!fsDropdown.classList.contains('open')) return;
    const btnRect = fsBtn.getBoundingClientRect();
    Object.assign(fsOptions.style, {
      position: 'fixed',
      left: Math.round(btnRect.left + btnRect.width / 2) + 'px',
      top: Math.round(btnRect.bottom + 6) + 'px',
      transform: 'translateX(-50%)',
      zIndex: '100000',
      display: 'block',
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      padding: '4px',
      maxHeight: '240px',
      overflowY: 'auto',
      minWidth: '120px',
    });
    DBG('fs-dropdown position', { left: fsOptions.style.left, top: fsOptions.style.top });
  }

  function openFsDropdown() {
    fsDropdown.classList.add('open');
    // Create portal container once
    if (!fsPortal) {
      fsPortal = document.createElement('div');
      fsPortal.className = 'fs-options-portal';
      fsPortal.style.position = 'fixed';
      fsPortal.style.left = '0';
      fsPortal.style.top = '0';
      fsPortal.style.zIndex = '100000';
      document.body.appendChild(fsPortal);
    }
    // Move options into portal to escape any overflow clipping
    if (fsOptions.parentElement !== fsPortal) {
      fsOriginalParent = fsOptions.parentElement;
      fsPortal.appendChild(fsOptions);
    }
    positionFsOptions();
  }

  function closeFsDropdown() {
    fsDropdown.classList.remove('open');
    // Return options to original parent
    if (fsOriginalParent && fsOptions.parentElement === fsPortal) {
      fsOriginalParent.appendChild(fsOptions);
    }
    fsOptions.removeAttribute('style');
  }

  function positionFfOptions() {
    if (!ffDropdown.classList.contains('open')) return;
    const btnRect = ffBtn.getBoundingClientRect();
    Object.assign(ffOptions.style, {
      position: 'fixed',
      left: Math.round(btnRect.left + btnRect.width / 2) + 'px',
      top: Math.round(btnRect.bottom + 6) + 'px',
      transform: 'translateX(-50%)',
      zIndex: '100000',
      display: 'block',
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      maxHeight: '240px',
      overflowY: 'auto',
      minWidth: '200px'
    });
    DBG('ff-dropdown position', { left: ffOptions.style.left, top: ffOptions.style.top });
  }

  function openFfDropdown() {
    ffDropdown.classList.add('open');
    if (!ffPortal) {
      ffPortal = document.createElement('div');
      ffPortal.className = 'ff-options-portal';
      ffPortal.style.position = 'fixed';
      ffPortal.style.left = '0';
      ffPortal.style.top = '0';
      ffPortal.style.zIndex = '100000';
      document.body.appendChild(ffPortal);
    }
    if (ffOptions.parentElement !== ffPortal) {
      ffOriginalParent = ffOptions.parentElement;
      ffPortal.appendChild(ffOptions);
    }
    positionFfOptions();
  }

  function closeFfDropdown() {
    ffDropdown.classList.remove('open');
    if (ffOriginalParent && ffOptions.parentElement === ffPortal) {
      ffOriginalParent.appendChild(ffOptions);
    }
    ffOptions.removeAttribute('style');
  }

  function extractFirstFontFamily(val) {
    const s = String(val || '');
    const m = s.match(/^\s*("([^"]+)"|'([^']+)'|([^,]+))/);
    let name = m ? (m[2] || m[3] || m[4] || '') : '';
    return name.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }

  function resolveActiveFontCarrier() {
    if (!state.activeEl) return null;
    const el = state.activeEl;
    const sel = window.getSelection();
    let useEl = el;
    if (
      sel && sel.rangeCount && !sel.isCollapsed &&
      el.contains(sel.anchorNode) && el.contains(sel.focusNode)
    ) {
      const range = sel.getRangeAt(0);
      let walkerRoot = range.commonAncestorContainer;
      if (walkerRoot.nodeType === 3) walkerRoot = walkerRoot.parentNode;
      const walker = document.createTreeWalker(
        walkerRoot,
        NodeFilter.SHOW_TEXT,
        { acceptNode: n => range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
      );
      while (walker.nextNode()) {
        const parent = walker.currentNode?.parentElement;
        if (parent) { useEl = parent; break; }
      }
    }
    return useEl;
  }

  function updateFontLabelFromSelection() {
    try {
      const carrier = resolveActiveFontCarrier();
      if (!carrier) return;
      const fam = getComputedStyle(carrier).fontFamily;
      const name = extractFirstFontFamily(fam) || 'Font';
      ffLabel.textContent = name;
    } catch (_) {}
  }

  const populateFonts = () => {
    const fonts = Array.isArray(window.AVAILABLE_FONTS) ? window.AVAILABLE_FONTS : [];
    ffOptions.innerHTML = fonts
      .map(f => `<span data-font="${f}" style="font-family:'${f}'">${f}</span>`)
      .join('');
    if (!fonts.length) {
      ffLabel.textContent = 'No fonts';
      ffBtn.disabled = true;
      ffBtn.title = 'No font providers configured. Add one in Font Manager.';
      closeFfDropdown();
    } else {
      ffBtn.disabled = false;
      ffBtn.title = '';
      // Prefer current selection font if present; otherwise first available
      const carrier = resolveActiveFontCarrier();
      const fam = carrier ? getComputedStyle(carrier).fontFamily : '';
      const current = extractFirstFontFamily(fam);
      const pick = fonts.find(f => f.toLowerCase() === String(current || '').toLowerCase());
      ffLabel.textContent = pick || fonts[0];
    }
  };
  populateFonts();
  document.addEventListener('fontsUpdated', populateFonts);
  document.addEventListener('fontsError', populateFonts);

  state.toolbar.querySelector('.fs-inc').addEventListener('click', () => {
    ensureActiveEditable();
    saveSelection();
    const input = state.toolbar.querySelector('.fs-input');
    const newSize = (parseFloat(input.value) || 16) + 1;
    input.value = newSize;
    DBG('fs-inc', { newSize, activeId: state.activeEl?.id, ce: state.activeEl?.getAttribute?.('contenteditable') });
    applySize(newSize);
    if (state.activeEl) {
      state.activeEl.dispatchEvent(new Event('input'));
    }
  });

  state.toolbar.querySelector('.fs-dec').addEventListener('click', () => {
    ensureActiveEditable();
    saveSelection();
    const input = state.toolbar.querySelector('.fs-input');
    const newSize = Math.max((parseFloat(input.value) || 16) - 1, 1);
    input.value = newSize;
    DBG('fs-dec', { newSize, activeId: state.activeEl?.id, ce: state.activeEl?.getAttribute?.('contenteditable') });
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
    if (fsDropdown.classList.contains('open')) {
      closeFsDropdown();
    } else {
      openFsDropdown();
      const input = state.toolbar.querySelector('.fs-input');
      input.focus();
    }
  });

  ffBtn.addEventListener('click', () => {
    if (ffBtn.disabled) {
      alert('No fonts available. Configure a provider in Font Manager.');
      return;
    }
    if (ffDropdown.classList.contains('open')) {
      closeFfDropdown();
    } else {
      openFfDropdown();
    }
  });

  document.addEventListener('click', ev => {
    if (!(ffControl.contains(ev.target) || ffOptions.contains(ev.target))) closeFfDropdown();
  });

  ffOptions.addEventListener('click', ev => {
    const opt = ev.target.closest('span[data-font]');
    if (!opt) return;
    try { window.loadFontCss?.(opt.dataset.font); } catch (_) {}
    applyFont(opt.dataset.font);
    ffLabel.textContent = opt.dataset.font;
    closeFfDropdown();
  });

  // Preserve selection when picking a font from portalized options
  ffOptions.addEventListener('pointerdown', ev => {
    const opt = ev.target.closest('span[data-font]');
    if (!opt) return;
    ensureActiveEditable();
    saveSelection();
    ev.preventDefault();
    ev.stopPropagation();
    try { window.loadFontCss?.(opt.dataset.font); } catch (_) {}
    applyFont(opt.dataset.font);
    ffLabel.textContent = opt.dataset.font;
    closeFfDropdown();
  }, true);

  ['pointerdown', 'click'].forEach(evt => {
    fsInput.addEventListener(evt, ev => ev.stopPropagation());
  });

  const fsInputHandler = () => {
    openFsDropdown();
    filterOptions(fsInput.value);
    positionFsOptions();
  };
  fsInput.addEventListener('focus', fsInputHandler);
  fsInput.addEventListener('input', fsInputHandler);
  fsInput.addEventListener('change', () => { ensureActiveEditable(); saveSelection(); DBG('fs-input-change', { value: fsInput.value, activeId: state.activeEl?.id, ce: state.activeEl?.getAttribute?.('contenteditable') }); applySize(fsInput.value); });
  fsInput.addEventListener('blur', () => {
    setTimeout(() => closeFsDropdown(), 150);
  });

  fsOptions.addEventListener('click', ev => {
    const opt = ev.target.closest('span[data-size]');
    if (!opt) return;
    ensureActiveEditable();
    saveSelection();
    DBG('fs-option', { size: opt.dataset.size, activeId: state.activeEl?.id, ce: state.activeEl?.getAttribute?.('contenteditable') });
    applySize(opt.dataset.size);
    closeFsDropdown();
  });
  // Ensure selection is preserved and apply works even if click is canceled
  fsOptions.addEventListener('pointerdown', ev => {
    const opt = ev.target.closest('span[data-size]');
    if (!opt) return;
    ensureActiveEditable();
    saveSelection();
    DBG('fs-option(pointerdown)', { size: opt.dataset.size, activeId: state.activeEl?.id, ce: state.activeEl?.getAttribute?.('contenteditable') });
    ev.preventDefault();
    ev.stopPropagation();
    applySize(opt.dataset.size);
    closeFsDropdown();
  }, true);

  const repositionFs = () => positionFsOptions();
  window.addEventListener('scroll', repositionFs);
  window.addEventListener('resize', repositionFs);
  const repositionFf = () => positionFfOptions();
  window.addEventListener('scroll', repositionFf);
  window.addEventListener('resize', repositionFf);

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


