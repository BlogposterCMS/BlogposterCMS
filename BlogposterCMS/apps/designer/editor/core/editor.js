import { sanitizeHtml } from './sanitizer.js';
import { isSelectionStyled, restoreSelection, saveSelection, bindActiveElementGetter } from './selection.js';

// Debug helper (enable with window.DEBUG_TEXT_EDITOR = true)
function DBG(...args) {
  try { if (window.DEBUG_TEXT_EDITOR) console.log('[TE/core]', ...args); } catch (e) {}
}
import { recordChange } from './history.js';
import { initToolbar, showToolbar, hideToolbar } from '../toolbar/toolbar.js';
import { isValidTag } from './allowedTags.js';
import { initGlobalEvents, onGlobalEvent } from '/plainspace/grid-core/globalEvents.js';

export const state = {
  toolbar: null,
  activeEl: null,
  initPromise: null,
  autoHandler: null,
  currentColor: '#000000',
  colorPicker: null,
  pendingSelectionUpdate: null,
  preservedRange: null
};

bindActiveElementGetter(() => state.activeEl);

let toggleStyleInternal;
let applyFontInternal;
let applySizeInternal;
let applyColorInternal;
export let updateButtonStates = () => {};

export function setApplyHandlers(handlers) {
  toggleStyleInternal = handlers.toggle;
  applyFontInternal = handlers.font;
  applySizeInternal = handlers.size;
  applyColorInternal = handlers.color;
}

function dispatchHtmlUpdate(el) {
  if (!el) return;
  const widget = findWidget(el);
  const instanceId = widget?.dataset.instanceId;
  if (!instanceId) return;
  const html = el.outerHTML.trim();
  document.dispatchEvent(
    new CustomEvent('widgetHtmlUpdate', {
      detail: { instanceId, html }
    })
  );
}

function updateAndDispatch(el) {
  if (!el) return;
  const html = el.outerHTML.trim();
  el.__onSave?.(html);
  dispatchHtmlUpdate(el);
  const widget = findWidget(el);
  const grid = widget?.closest('.pixel-grid, .canvas-grid')?.__grid;
  grid?.emitChange?.(widget, { contentOnly: true });
  document.dispatchEvent(new Event('designerContentChanged'));
}

export function toggleStyle(prop, value) {
  if (!state.activeEl) return;
  const prev = state.activeEl.outerHTML;
  DBG('toggleStyle', { prop, value, activeId: state.activeEl?.id, ce: state.activeEl?.getAttribute?.('contenteditable') });
  toggleStyleInternal(prop, value);
  recordChange(state.activeEl, prev, updateAndDispatch);
}

export function applyFont(font) {
  if (!state.activeEl) return;
  const prev = state.activeEl.outerHTML;
  DBG('applyFont', { font, activeId: state.activeEl?.id });
  applyFontInternal(font);
  recordChange(state.activeEl, prev, updateAndDispatch);
}

export function applySize(size) {
  if (!state.activeEl) return;
  const prev = state.activeEl.outerHTML;
  DBG('applySize', { size, activeId: state.activeEl?.id });
  applySizeInternal(size);
  recordChange(state.activeEl, prev, updateAndDispatch);
}

export function applyColor(color) {
  if (!state.activeEl) return;
  const prev = state.activeEl.outerHTML;
  DBG('applyColor', { color, activeId: state.activeEl?.id });
  applyColorInternal(color);
  recordChange(state.activeEl, prev, updateAndDispatch);
}

function isEditableElement(el) {
  if (!el || el.nodeType !== 1) return false;
  const ignore = ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'SVG', 'VIDEO', 'AUDIO', 'CANVAS'];
  if (ignore.includes(el.tagName)) return false;
  if (!el.textContent.trim()) return false;
  const tag = el.tagName.toLowerCase();
  if (isValidTag(tag)) return true;
  if (el.dataset.textEditable !== undefined) return true;
  return el.children.length === 0;
}

function withinGridItem(el) {
  let node = el;
  while (node && node !== document.body) {
    if (node.classList && node.classList.contains('canvas-item')) return true;
    node = node.parentElement || (node.getRootNode && node.getRootNode().host);
  }
  return false;
}

function findWidget(node) {
  let n = node;
  while (n && n !== document.body) {
    if (n.classList && n.classList.contains('canvas-item')) return n;
    n = n.parentElement || (n.getRootNode && n.getRootNode().host);
  }
  return null;
}

function findEditable(target) {
  let t = target;
  while (t && t !== document.body) {
    if (isEditableElement(t) && withinGridItem(t)) {
      return t;
    }
    t = t.parentElement || (t.getRootNode && t.getRootNode().host);
  }
  return null;
}

function findEditableFromEvent(ev) {
  if (typeof ev.composedPath === 'function') {
    const path = ev.composedPath();
    for (const node of path) {
      if (node instanceof Element && isEditableElement(node) && withinGridItem(node)) {
        return node;
      }
    }
  }
  return findEditable(ev.target);
}

export function setCaretFromEvent(el, ev) {
  if (!el || !ev) return;
  let range = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(ev.clientX, ev.clientY);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
  }
  if (range) {
    range.collapse(true);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

export function editElement(el, onSave, clickEvent = null) {
  const widget = el.closest('.canvas-item');
  if (!widget) return;

  const getHitLayer = w =>
    w.querySelector('.hit-layer') ||
    w.querySelector('.canvas-item-content .hit-layer') ||
    null;

  const hitLayer = getHitLayer(widget);

  const prevLayer = +widget.dataset.layer || 0;
  widget.dataset.layer = 9999;
  widget.style.zIndex = '9999';
  widget.classList.add('editing');
  widget.dispatchEvent(new Event('editStart'));

  widget.setAttribute('gs-locked', 'true');
  const grid = widget.closest('.pixel-grid, .canvas-grid')?.__grid;
  grid?.update(widget, { locked: true, noMove: true, noResize: true });

  if (hitLayer) hitLayer.style.pointerEvents = 'none';

  el.setAttribute('contenteditable', 'true');
  el.focus();
  if (clickEvent) {
    setCaretFromEvent(el, clickEvent);
  }
  state.activeEl = el;

  const inputHandler = () => dispatchHtmlUpdate(el);
  el.addEventListener('input', inputHandler);
  el.__inputHandler = inputHandler;

  showToolbar();

  function finish(save) {
    if (save) {
      el.innerHTML = sanitizeHtml(el.innerHTML.trim());
      updateAndDispatch(el);
    }
    state.activeEl = null;

    el.removeAttribute('contenteditable');

    widget.dataset.layer = prevLayer;
    widget.style.zIndex = String(prevLayer);
    widget.setAttribute('gs-locked', 'false');
    grid?.update(widget, { locked: false, noMove: false, noResize: false });
    if (el.__inputHandler) {
      el.removeEventListener('input', el.__inputHandler);
      delete el.__inputHandler;
    }

    if (hitLayer) hitLayer.style.pointerEvents = 'auto';

    widget.classList.remove('editing');
    widget.dispatchEvent(new Event('editEnd'));
    if (widget.classList.contains('selected')) {
      showToolbar();
    } else {
      hideToolbar();
    }
    removeOutside();
  }

  const outsideClick = ev => {
    if (
      widget.contains(ev.target) ||
      grid?.bbox?.contains(ev.target) ||
      state.toolbar?.contains(ev.target)
    ) return;
    finish(true);
  };
  const removeOutside = onGlobalEvent('mousedown', outsideClick);
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
}

const editableMap = new WeakMap();

export function registerElement(editable, onSave) {
  if (!editable) return;
  if (!editable.id || (document.getElementById(editable.id) && document.getElementById(editable.id) !== editable)) {
    editable.id = `editable-${Math.random().toString(36).slice(2,8)}`;
  }
  if (editable.__registered) return;
  editable.__registered = true;
  editable.__onSave = onSave;
  const widget = findWidget(editable);
  if (widget) {
    editableMap.set(widget, editable);
    DBG('registerElement', { widgetId: widget.id, editableId: editable.id, class: editable.className });
  }
}

export function getRegisteredEditable(widget) {
  const el = editableMap.get(widget) || null;
  DBG('getRegisteredEditable', { widgetId: widget?.id, editableId: el?.id });
  return el;
}

export function enableAutoEdit() {
  if (state.autoHandler) return;
  initGlobalEvents(document);
  state.autoHandler = ev => {
    if (!document.body.classList.contains('builder-mode')) return;
    if (state.toolbar && state.toolbar.contains(ev.target)) return;
    const widget = findWidget(ev.target);
    if (!widget || !widget.classList.contains('selected')) return;
    let el = findEditableFromEvent(ev);
    if (!el) el = getRegisteredEditable(widget);
    if (!el) {
      setTimeout(() => widget.dispatchEvent(new Event('dblclick')), 30);
      return;
    }
    ev.stopPropagation();
    ev.preventDefault();
    editElement(el, el.__onSave, ev);
  };
  onGlobalEvent('dblclick', state.autoHandler);
}

export async function initTextEditor() {
  await initToolbar(state, setApplyHandlers, updateButtonStates);
  enableAutoEdit();
  saveSelection();
}

export function setActiveElement(el) {
  state.activeEl = el;
  DBG('setActiveElement', { id: el?.id, cls: el?.className, ce: el?.getAttribute?.('contenteditable') });
}

export function applyToolbarChange(el, styleProp, value) {
  if (!el) return;
  el.style[styleProp] = value;
  DBG('applyToolbarChange', { id: el?.id, prop: styleProp, value });
  updateAndDispatch(el);
}

