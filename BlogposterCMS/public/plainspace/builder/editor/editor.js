export {
  initTextEditor,
  editElement,
  registerElement,
  enableAutoEdit,
  setActiveElement,
  applyToolbarChange,
  getRegisteredEditable
} from './core/editor.js';

export { showToolbar, hideToolbar, initToolbar } from './toolbar/toolbar.js';
export { undoTextCommand, redoTextCommand, recordChange } from './core/history.js';
export { sanitizeHtml } from './core/sanitizer.js';
export {
  saveSelection,
  restoreSelection,
  isSelectionStyled,
  initSelectionTracking
} from './core/selection.js';
