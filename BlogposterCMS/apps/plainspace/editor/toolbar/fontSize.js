// toolbar/fontSize.js
// Handle font size adjustments for the text editor toolbar
const BASE_FONT_SIZE = parseFloat(
  getComputedStyle(document.documentElement).fontSize
) || 16;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 72;

function clampSize(size) {
  return Math.min(Math.max(size, MIN_FONT_SIZE), MAX_FONT_SIZE);
}

function parseValue(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(-?\d*(?:\.\d+)?)([a-z%]*)$/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = match[2] || 'px';
  if (isNaN(num)) return null;
  return { size: num, unit };
}

function formatSize(size, unit) {
  return `${size}${unit}`;
}

export function getCurrentSize(input) {
  const parsed = parseValue(input.value);
  return parsed || { size: BASE_FONT_SIZE, unit: 'px' };
}

export function increaseFontSize(input, step = 1) {
    const { size, unit } = getCurrentSize(input);
  const newSize = clampSize(size + step);
  input.value = formatSize(newSize, unit);
    return newSize;
}

export function decreaseFontSize(input, step = 1) {
    const { size, unit } = getCurrentSize(input);
  const newSize = clampSize(size - step);
  input.value = formatSize(newSize, unit);
  return newSize;
}

export function parseSize(value) {
  const parsed = parseValue(value);
  return parsed ? parsed.size : null;
}
