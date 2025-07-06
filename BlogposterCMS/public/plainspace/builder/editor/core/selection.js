import { initGlobalEvents, onGlobalEvent } from '../../../main/globalEvents.js';

let preservedRange = null;
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
  if (sel && sel.rangeCount && !sel.isCollapsed) {
    preservedRange = sel.getRangeAt(0).cloneRange();
  }
}

export function restoreSelection() {
  if (preservedRange) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(preservedRange);
  }
}

export function initSelectionTracking() {
  initGlobalEvents(document);
  onGlobalEvent('mouseup', saveSelection);
  onGlobalEvent('keyup', saveSelection);
  onGlobalEvent('touchend', saveSelection);
  onGlobalEvent('selectionchange', saveSelection);
}

function styleMatches(val, prop, target, styleObj = null) {
   switch (prop) {
     case 'textDecoration': {
       const hasUnderline = String(val).includes('underline');
       const wavy = styleObj && styleObj.textDecorationStyle === 'wavy';
       return hasUnderline && !wavy;
     }
     case 'fontWeight': {
       const num = parseInt(val, 10);
       return val === 'bold' || (!isNaN(num) && num >= 600);
     }
     case 'fontStyle':
       return /(italic|oblique)/.test(val);
     default:
       return String(val) === String(target);
   }
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
    const current = getComputedStyle(el)[prop];
    return styleMatches(current, prop, value);
  }
  const range = sel.getRangeAt(0);
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
  return [...carriers].every(elm =>
    styleMatches(getComputedStyle(elm)[prop], prop, value)
  );
}

