// public/plainspace/main/script-utils.js
// Utilities for executing user-provided JavaScript with CSP nonce support
export function executeJs(code, wrapper, root, context = 'App') {
  if (!code) return;
  const nonce = window.NONCE;
  if (!nonce) {
    console.error(`[${context}] missing nonce`);
    return;
  }
  code = code.trim();
  if (/^import\s|^export\s/m.test(code)) {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    import(/* webpackIgnore: true */ url).then(m => {
      if (typeof m.render === 'function') {
        try { m.render.call(wrapper, root); } catch (err) {
          console.error(`[${context}] module render error`, err);
        }
      }
      URL.revokeObjectURL(url);
    }).catch(err => {
      console.error(`[${context}] module import error`, err);
      URL.revokeObjectURL(url);
    });
    return;
  }
  window.__scriptRoot = root;
  window.__scriptWrapper = wrapper;
  const script = document.createElement('script');
  script.setAttribute('nonce', nonce);
  script.textContent = `(function(root){\n${code}\n}).call(window.__scriptWrapper, window.__scriptRoot);`;
  document.body.appendChild(script);
  script.remove();
  delete window.__scriptRoot;
  delete window.__scriptWrapper;
}
