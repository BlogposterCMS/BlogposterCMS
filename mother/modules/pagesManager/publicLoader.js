import { executeJs } from '/ui/runtime/main/script-utils.js';
const LOADER_CONTEXT = 'HTML Loader';
const SANITIZER_PLACEHOLDER_CLASS = 'bp-page-html bp-page-html--blocked';
let sanitizeHtml;
let sanitizerUnavailable = false;
let sanitizerLoadPromise = null;
let sanitizerImporter = () => import(/* webpackIgnore: true */ '/ui/shared/sanitize/sanitizer.js');
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error || '');
}
function logStructuredError(event, error, extra = {}) {
    console.error(`[${LOADER_CONTEXT}] ${event}`, {
        event,
        module: 'pagesManager/publicLoader',
        message: errorMessage(error),
        ...extra,
    });
}
async function ensureSanitizer() {
    if (sanitizeHtml || sanitizerUnavailable)
        return;
    if (!sanitizerLoadPromise) {
        sanitizerLoadPromise = sanitizerImporter()
            .then((mod) => {
            if (typeof mod?.sanitizeHtml !== 'function') {
                throw new Error('sanitizeHtml export missing');
            }
            sanitizeHtml = mod.sanitizeHtml;
        })
            .catch((error) => {
            sanitizerUnavailable = true;
            logStructuredError('SANITIZER_IMPORT_FAILED', error);
        })
            .finally(() => {
            sanitizerLoadPromise = null;
        });
    }
    await sanitizerLoadPromise;
}
function appendBlockedPlaceholder(root) {
    const placeholder = document.createElement('div');
    placeholder.className = SANITIZER_PLACEHOLDER_CLASS;
    placeholder.setAttribute('data-blocked-reason', 'sanitizer-unavailable');
    placeholder.textContent = 'Content unavailable.';
    root.appendChild(placeholder);
}
function hasActiveDesignLayout(ctx) {
    const scopedLayout = ctx && typeof ctx === 'object'
        ? ctx.activeLayout
        : undefined;
    const layout = scopedLayout;
    return Boolean(layout &&
        typeof layout === 'object' &&
        Array.isArray(layout.items) &&
        (layout.items || []).length > 0);
}
export async function loadHtml(descriptor = {}, ctx) {
    if (descriptor.fallbackOnly && hasActiveDesignLayout(ctx)) {
        return;
    }
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
        }
        else {
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
        }
        catch (error) {
            logStructuredError('INLINE_JS_EXECUTION_ERROR', error, { hasNonce: Boolean(window.NONCE) });
        }
    }
}
export function registerLoaders(register) {
    register('html', loadHtml);
}
export function __setLoaderTestDeps(deps = {}) {
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
        sanitizerImporter = () => import(/* webpackIgnore: true */ '/ui/shared/sanitize/sanitizer.js');
    }
}
