import { initGlobalEvents, onGlobalEvent } from '/plainspace/grid-core/globalEvents.js';
import { styleMatches, elementHasStyle } from '../utils/styleUtils.js';

const preservedRanges = new WeakMap();
let activeEl = null; // placeholder, will be set by editor-core
export function bindActiveElementGetter(getter) {
  activeEl = getter;
}

export function saveSelection() {
  const ae = document.activeElement;
  if (ae && (
        ae.closest('.text-block-editor-toolbar') ||
        ae.closest('.text-color-picker')))
    return;

  const sel = window.getSelection();
  const el = activeEl && activeEl();
  if (sel && el && sel.rangeCount && !sel.isCollapsed && el.contains(sel.anchorNode) && el.contains(sel.focusNode)) {
    preservedRanges.set(el, sel.getRangeAt(0).cloneRange());
  }
}

export function restoreSelection() {
  const el = activeEl && activeEl();
  const range = el && preservedRanges.get(el);
  if (range) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

export function initSelectionTracking() {
  initGlobalEvents(document);
  onGlobalEvent('mouseup', saveSelection);
  onGlobalEvent('keyup', saveSelection);
  onGlobalEvent('touchend', saveSelection);
  onGlobalEvent('selectionchange', saveSelection);
}

export function isSelectionStyled(prop, value) {
  if (!activeEl()) return false;
  const el = activeEl();
  const sel = window.getSelection();
  if (
    !sel ||
    sel.isCollapsed ||
    !el.contains(sel.anchorNode) ||
    !el.contains(sel.focusNode)
  ) {
    return elementHasStyle(el, prop, value);
  }
  const range = sel.getRangeAt(0);
  if (sel.anchorNode === sel.focusNode) {
    const node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    return elementHasStyle(node, prop, value);
  }
  let walkerRoot = range.commonAncestorContainer;
  if (walkerRoot.nodeType === 3) {
    walkerRoot = walkerRoot.parentNode;
  }
  const walker = document.createTreeWalker(
    walkerRoot,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(n) {
        return range.intersectsNode(n)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );
  const carriers = new Set();
  carriers.add(el);
  while (walker.nextNode()) {
    carriers.add(walker.currentNode.parentElement);
  }
  return [...carriers].every(elm => elementHasStyle(elm, prop, value));
}

