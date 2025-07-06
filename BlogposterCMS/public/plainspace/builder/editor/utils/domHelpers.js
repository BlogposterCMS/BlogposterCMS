// utils/domHelpers.js
// Tiny DOM utility functions used by the editor
export function closest(element, selector) {
  while (element) {
    if (element.matches && element.matches(selector)) return element;
    element = element.parentElement;
  }
  return null;
}
