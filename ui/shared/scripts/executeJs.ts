// Utilities for executing user-provided JavaScript with CSP nonce support.
const MODULE_STATEMENT_RE = /^\s*(?:import|export)\s/m;

interface ModuleScript {
  render?: (this: HTMLElement, root: HTMLElement | ShadowRoot) => void;
}

async function importModuleScript(
  code: string,
  wrapper: HTMLElement,
  root: HTMLElement | ShadowRoot,
  context: string
): Promise<void> {
  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);

  try {
    const module = await import(/* webpackIgnore: true */ url) as ModuleScript;
    if (typeof module.render !== 'function') return;

    try {
      module.render.call(wrapper, root);
    } catch (err) {
      console.error(`[${context}] module render error`, err);
    }
  } catch (err) {
    console.error(`[${context}] module import error`, err);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function runInlineScript(
  code: string,
  nonce: string,
  wrapper: HTMLElement,
  root: HTMLElement | ShadowRoot
): void {
  window.__scriptRoot = root;
  window.__scriptWrapper = wrapper;

  const script = document.createElement('script');
  script.setAttribute('nonce', nonce);
  script.textContent = `(function(root){\n${code}\n}).call(window.__scriptWrapper, window.__scriptRoot);`;

  try {
    document.body.appendChild(script);
  } finally {
    script.remove();
    delete window.__scriptRoot;
    delete window.__scriptWrapper;
  }
}

export function executeJs(
  code: string | null | undefined,
  wrapper: HTMLElement,
  root: HTMLElement | ShadowRoot,
  context = 'App'
): void {
  if (!code) return;
  const nonce = window.NONCE;
  if (!nonce) {
    console.error(`[${context}] missing nonce`);
    return;
  }

  const trimmedCode = code.trim();
  if (MODULE_STATEMENT_RE.test(trimmedCode)) {
    void importModuleScript(trimmedCode, wrapper, root, context);
    return;
  }

  runInlineScript(trimmedCode, nonce, wrapper, root);
}
