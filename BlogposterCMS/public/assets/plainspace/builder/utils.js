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
  widget.style.position = 'relative';
  widget.appendChild(shield);
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
  const theme = window.ACTIVE_THEME || 'default';
  try {
    const res = await window.fetchWithTimeout(`/themes/${theme}/theme.css`);
    if (!res.ok) throw new Error('theme css fetch failed');
    const css = await res.text();
    const scoped = scopeThemeCss(css, '#builderGrid', '#builderGrid .builder-themed');
    const style = document.createElement('style');
    style.dataset.builderTheme = theme;
    style.textContent = scoped;
    document.head.appendChild(style);
  } catch (err) {
    console.error('[Builder] failed to apply theme', err);
  }
}

export function wrapCss(css, selector) {
  const trimmed = css.trim();
  if (!trimmed) return '';
  if (!selector || /\{[^}]*\}/.test(trimmed)) return trimmed;
  return `${selector} {\n${trimmed}\n}`;
}

export function executeJs(code, wrapper, root) {
  if (!code) return;
  const nonce = window.NONCE;
  if (!nonce) {
    console.error('[Builder] missing nonce');
    return;
  }
  code = code.trim();
  if (/^import\s|^export\s/m.test(code)) {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    import(url).then(m => {
      if (typeof m.render === 'function') {
        try { m.render.call(wrapper, root); } catch (err) {
          console.error('[Builder] module render error', err);
        }
      }
      URL.revokeObjectURL(url);
    }).catch(err => {
      console.error('[Builder] module import error', err);
      URL.revokeObjectURL(url);
    });
    return;
  }
  window.__builderRoot = root;
  window.__builderWrapper = wrapper;
  const script = document.createElement('script');
  script.setAttribute('nonce', nonce);
  script.textContent = `(function(root){\n${code}\n}).call(window.__builderWrapper, window.__builderRoot);`;
  document.body.appendChild(script);
  script.remove();
  delete window.__builderRoot;
  delete window.__builderWrapper;
}
