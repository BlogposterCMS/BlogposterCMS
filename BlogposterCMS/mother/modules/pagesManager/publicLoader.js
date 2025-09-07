let sanitizeHtml;

async function loadHtml(descriptor = {}, ctx) {
  if (!sanitizeHtml) {
    try {
      const mod = await import(/* webpackIgnore: true */ '/plainspace/sanitizer.js');
      sanitizeHtml = mod.sanitizeHtml;
    } catch (e) {
      console.error('[HTML Loader] sanitizer missing', e);
      sanitizeHtml = (s) => s;
    }
  }
  const inline = descriptor.inline || {};
  let html = inline.html || '';
  let css = inline.css || '';
  let js = inline.js || '';

  if (css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }
  if (html) {
    const root = document.getElementById('app') || document.body;
    const wrapper = document.createElement('div');
    wrapper.className = 'bp-page-html';
    wrapper.innerHTML = sanitizeHtml(html);
    root.appendChild(wrapper);
  }
  if (js) {
    try {
      const blob = new Blob([js], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const script = document.createElement('script');
      script.src = url;
      document.body.appendChild(script);
    } catch (e) {
      console.error('[HTML Loader] inline js error', e);
    }
  }
}

export function registerLoaders(register) {
  register('html', loadHtml);
}

export { loadHtml };
