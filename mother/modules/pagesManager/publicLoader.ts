import { executeJs } from '/ui/runtime/main/script-utils.js';

const LOADER_CONTEXT = 'HTML Loader';
const SANITIZER_PLACEHOLDER_CLASS = 'bp-page-html bp-page-html--blocked';

type Sanitizer = (html: string) => string;
type SanitizerModule = {
  sanitizeHtml?: Sanitizer;
};
type SanitizerImporter = () => Promise<SanitizerModule>;

type HtmlDescriptor = {
  inline?: {
    html?: string;
    css?: string;
    js?: string;
  };
};

type LoaderTestDeps = {
  sanitizerImporter?: SanitizerImporter;
  sanitizeHtml?: Sanitizer;
  reset?: boolean;
};

let sanitizeHtml: Sanitizer | undefined;
let sanitizerUnavailable = false;
let sanitizerLoadPromise: Promise<void> | null = null;
let sanitizerImporter: SanitizerImporter = () =>
  import(/* webpackIgnore: true */ '/ui/shared/sanitize/sanitizer.js');

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

function logStructuredError(
  event: string,
  error: unknown,
  extra: Record<string, unknown> = {}
): void {
  console.error(`[${LOADER_CONTEXT}] ${event}`, {
    event,
    module: 'pagesManager/publicLoader',
    message: errorMessage(error),
    ...extra,
  });
}

async function ensureSanitizer(): Promise<void> {
  if (sanitizeHtml || sanitizerUnavailable) return;
  if (!sanitizerLoadPromise) {
    sanitizerLoadPromise = sanitizerImporter()
      .then((mod) => {
        if (typeof mod?.sanitizeHtml !== 'function') {
          throw new Error('sanitizeHtml export missing');
        }
        sanitizeHtml = mod.sanitizeHtml;
      })
      .catch((error: unknown) => {
        sanitizerUnavailable = true;
        logStructuredError('SANITIZER_IMPORT_FAILED', error);
      })
      .finally(() => {
        sanitizerLoadPromise = null;
      });
  }
  await sanitizerLoadPromise;
}

function appendBlockedPlaceholder(root: HTMLElement): void {
  const placeholder = document.createElement('div');
  placeholder.className = SANITIZER_PLACEHOLDER_CLASS;
  placeholder.setAttribute('data-blocked-reason', 'sanitizer-unavailable');
  placeholder.textContent = 'Content unavailable.';
  root.appendChild(placeholder);
}

export async function loadHtml(
  descriptor: HtmlDescriptor = {},
  ctx?: unknown
): Promise<void> {
  void ctx;
  await ensureSanitizer();

  const inline = descriptor.inline || {};
  const html = inline.html || '';
  const css = inline.css || '';
  const js = inline.js || '';

  if (css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  const root = document.getElementById('app') || document.body;

  if (html) {
    if (!sanitizeHtml || sanitizerUnavailable) {
      logStructuredError('UNTRUSTED_HTML_BLOCKED', new Error('Sanitizer unavailable'));
      appendBlockedPlaceholder(root);
    } else {
      const wrapper = document.createElement('div');
      wrapper.className = 'bp-page-html';
      wrapper.innerHTML = sanitizeHtml(html);
      root.appendChild(wrapper);
    }
  }

  if (js) {
    if (!window.NONCE) {
      logStructuredError('INLINE_JS_BLOCKED_MISSING_NONCE', new Error('Nonce missing'));
      return;
    }
    try {
      executeJs(js, root, root, LOADER_CONTEXT);
    } catch (error: unknown) {
      logStructuredError('INLINE_JS_EXECUTION_ERROR', error, { hasNonce: Boolean(window.NONCE) });
    }
  }
}

export function registerLoaders(
  register: (loaderName: 'html', loader: typeof loadHtml) => void
): void {
  register('html', loadHtml);
}

export function __setLoaderTestDeps(deps: LoaderTestDeps = {}): void {
  if (typeof deps.sanitizerImporter === 'function') {
    sanitizerImporter = deps.sanitizerImporter;
  }
  if (typeof deps.sanitizeHtml === 'function') {
    sanitizeHtml = deps.sanitizeHtml;
    sanitizerUnavailable = false;
  }
  if (deps.reset) {
    sanitizeHtml = undefined;
    sanitizerUnavailable = false;
    sanitizerLoadPromise = null;
    sanitizerImporter = () =>
      import(/* webpackIgnore: true */ '/ui/shared/sanitize/sanitizer.js');
  }
}
