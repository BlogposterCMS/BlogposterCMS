export function sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script').forEach(el => el.remove());
  div.querySelectorAll('style').forEach(el => {
    el.textContent = sanitizeCss(el.textContent);
  });
  div.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
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

function sanitizeCss(css: string, inline = false): string {
  const expr = /expression/i;
  const urlPattern = /url\(([^)]*)\)/gi;
  const importPattern = /@import\s+(?:url\(([^)]+)\)|(['"])([^'"]+)\2)/gi;
  const isUnsafeUrl = (url: string): boolean => {
    const val = url.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
    return /^(?:javascript|data|vbscript|file|ftp|chrome|chrome-extension|resource|about|blob):/.test(val);
  };
  const hasUnsafeImport = (rule: string): boolean => {
    const match = rule.match(/@import\s+(?:url\(([^)]+)\)|(['"])([^'"]+)\2)/i);
    if (!match) return false;
    const target = (match[1] || match[3] || '').trim();
    return !target || isUnsafeUrl(target);
  };

  if (inline) {
    return css
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(rule => {
        if (expr.test(rule)) return false;
        if (/@import/i.test(rule) && hasUnsafeImport(rule)) return false;
        const matches = rule.matchAll(urlPattern);
        for (const [, url] of matches) {
          if (isUnsafeUrl(url ?? '')) return false;
        }
        return true;
      })
      .join('; ');
  }

  return css
    .replace(/expression\([^)]*\)/gi, '')
    .replace(importPattern, (match, url: string | undefined, _quote: string | undefined, literal: string | undefined) => {
      const target = (url || literal || '').trim();
      return target && !isUnsafeUrl(target) ? match : '';
    })
    .replace(urlPattern, (match, url: string | undefined) => (isUnsafeUrl(url ?? '') ? '' : match));
}
