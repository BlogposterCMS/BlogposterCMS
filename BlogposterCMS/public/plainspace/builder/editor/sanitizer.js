export function sanitizeHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script, style').forEach(el => el.remove());
  div.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (name === 'style') {
        const allowed = [
          'font-size',
          'font-family',
          'text-decoration',
          'font-weight',
          'font-style',
          'color',
          'background-color'
        ];
        const sanitized = attr.value
          .split(';')
          .map(s => s.trim())
          .filter(Boolean)
          .map(s => {
            const [prop, value] = s.split(':').map(p => p.trim());
            if (
              allowed.includes(prop.toLowerCase()) &&
              !/(expression|url\(|javascript)/i.test(value)
            ) {
              return `${prop}:${value}`;
            }
            return null;
          })
          .filter(Boolean)
          .join('; ');
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
