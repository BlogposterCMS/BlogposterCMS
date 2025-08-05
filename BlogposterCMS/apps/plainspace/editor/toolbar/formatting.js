// toolbar/formatting.js
// Basic text formatting helpers
export function toggleBold(target) {
  target.style.fontWeight = target.style.fontWeight === 'bold' ? '' : 'bold';
}

export function toggleItalic(target) {
  target.style.fontStyle = target.style.fontStyle === 'italic' ? '' : 'italic';
}

export function toggleUnderline(target) {
  const cur = target.style.textDecoration;
  const isUnder = cur && cur.includes('underline');
  target.style.textDecoration = isUnder ? '' : 'underline';
}
