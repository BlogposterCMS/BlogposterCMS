export {
  initTextEditor,
  editElement,
  registerElement,
  enableAutoEdit,
  setActiveElement,
  applyToolbarChange,
  getRegisteredEditable
} from './editor-core.js';

export { showToolbar, hideToolbar, initToolbar } from './toolbar.js';
export { undoTextCommand, redoTextCommand, recordChange } from './history.js';
export { sanitizeHtml } from './sanitizer.js';
export {
  saveSelection,
  restoreSelection,
  isSelectionStyled,
  initSelectionTracking
} from './selection.js';
