export function positionFloatingEl(el, anchor, offset = 8) {
  if (!el || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const x = rect.left + window.scrollX + rect.width / 2 - el.offsetWidth / 2;
  const y = rect.top + window.scrollY - el.offsetHeight - offset;
  el.style.position = 'absolute';
  el.style.left = `${Math.max(0, x)}px`;
  el.style.top = `${Math.max(0, y)}px`;
}
