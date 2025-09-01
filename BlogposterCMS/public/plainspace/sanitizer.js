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
  const banned = /(expression|url\([^)]*javascript)/i;
  if (inline) {
    return css
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(rule => !banned.test(rule))
      .join('; ');
  }
  return css.replace(/expression\([^)]*\)/gi, '').replace(/url\(([^)]*javascript[^)]*)\)/gi, '');
}
