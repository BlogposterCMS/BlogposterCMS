import { executeJs as exec } from '../../public/plainspace/main/script-utils.js';

export function addHitLayer(widget) {
  const shield = document.createElement('div');
  shield.className = 'hit-layer';
  Object.assign(shield.style, {
    position: 'absolute',
    inset: '0',
    background: 'transparent',
    cursor: 'move',
    pointerEvents: 'auto', // default
    zIndex: '5'
  });
  widget.style.position = 'relative';
  widget.appendChild(shield);

  // Toggle hit-layer interactivity based on widget state
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

export function scopeThemeCss(css, rootPrefix, contentPrefix) {
  return css.replace(/(^|\})([^@{}]+)\{/g, (m, brace, selectors) => {
    selectors = selectors.trim();
    if (!selectors || selectors.startsWith('@')) return m;
    const scoped = selectors.split(',').map(s => {
      s = s.trim();
      if ([':root', 'html', 'body'].includes(s)) return rootPrefix;
      return `${contentPrefix} ${s}`;
    }).join(', ');
    return `${brace}${scoped}{`;
  });
}

export async function applyBuilderTheme() {
  const theme = window.ACTIVE_THEME;
  if (!theme) return; // no active theme
  try {
    const res = await window.fetchWithTimeout(`/themes/${theme}/theme.css`);
    if (!res.ok) {
      console.warn(`[Builder] missing theme "${theme}" css (${res.status})`);
      return;
    }
    const css = await res.text();
    const scoped = scopeThemeCss(css, '#builderGrid', '#builderGrid .builder-themed');
    const style = document.createElement('style');
    style.dataset.builderTheme = theme;
    style.textContent = scoped;
    document.head.appendChild(style);
  } catch (err) {
    console.warn('[Builder] failed to apply theme', err);
  }
}

export function wrapCss(css, selector) {
  const trimmed = css.trim();
  if (!trimmed) return '';
  if (!selector || /\{[^}]*\}/.test(trimmed)) return trimmed;
  return `${selector} {\n${trimmed}\n}`;
}

export function executeJs(code, wrapper, root) {
  exec(code, wrapper, root, 'Builder');
}
