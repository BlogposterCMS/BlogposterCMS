export function sanitizeHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script').forEach(el => el.remove());
  div.querySelectorAll('style').forEach(el => {
    el.textContent = sanitizeCss(el.textContent);
  });
  div.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (name === 'style') {
        const sanitized = sanitizeCss(attr.value, true);
        if (sanitized) {
          el.setAttribute('style', sanitized);
        } else {
          el.removeAttribute('style');
        }
      }
    });
  });
  return div.innerHTML;
}

function sanitizeCss(css, inline = false) {
  const expr = /expression/i;
  const urlPattern = /url\(([^)]*)\)/gi;
  const isUnsafeUrl = url => {
    const val = url.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
    return /^(?:javascript|data|vbscript|file|ftp|chrome|chrome-extension|resource|about|blob):/.test(val);
  };
  if (inline) {
    return css
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(rule => {
        if (expr.test(rule)) return false;
        const matches = rule.matchAll(urlPattern);
        for (const [, url] of matches) {
          if (isUnsafeUrl(url)) return false;
        }
        return true;
      })
      .join('; ');
  }
  return css
    .replace(/expression\([^)]*\)/gi, '')
    .replace(urlPattern, (match, url) => (isUnsafeUrl(url) ? '' : match));
}
