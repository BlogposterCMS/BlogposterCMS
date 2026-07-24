import { executeJs as exec } from '/ui/runtime/main/script-utils.js';

export function addHitLayer(widget) {
  const shield = document.createElement('div');
  shield.className = 'hit-layer';
  Object.assign(shield.style, {
    position: 'absolute',
    inset: '0',
    background: 'transparent',
    cursor: 'move',
    pointerEvents: 'auto',
    zIndex: '5'
  });
  if (!widget.classList.contains('canvas-item')) {
    const position = window.getComputedStyle?.(widget).position || widget.style.position;
    if (!position || position === 'static') {
      widget.style.position = 'relative';
    }
  }
  widget.appendChild(shield);

  const toggle = () => {
    const editing  = widget.classList.contains('editing');
    const selected = widget.classList.contains('selected');
    shield.style.pointerEvents = editing || selected ? 'none' : 'auto';
    shield.style.cursor = editing ? 'text' : 'move';
  };
  widget.addEventListener('editStart', toggle);
  widget.addEventListener('editEnd', toggle);
  widget.addEventListener('selected', toggle);
  widget.addEventListener('deselected', toggle);
}

export function wrapCss(css, selector) {
  const trimmed = css.trim();
  if (!trimmed) return '';
  if (!selector || /\{[^}]*\}/.test(trimmed)) return trimmed;
  return `${selector} {\n${trimmed}\n}`;
}

export function executeJs(code, wrapper, root) {
  exec(code, wrapper, root, 'Designer');
}
