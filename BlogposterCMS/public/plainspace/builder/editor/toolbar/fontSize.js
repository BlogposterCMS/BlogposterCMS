// toolbar/fontSize.js
// Handle font size adjustments for the text editor toolbar
export function increaseFontSize(input, step = 1) {
  const current = parseFloat(input.value) || 16;
  const newSize = current + step;
  input.value = newSize;
  return newSize;
}

export function decreaseFontSize(input, step = 1) {
  const current = parseFloat(input.value) || 16;
  const newSize = Math.max(current - step, 1);
  input.value = newSize;
  return newSize;
}

export function parseSize(value) {
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}
