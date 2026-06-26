import { sanitizeHtml } from '../../shared/sanitize/sanitizer.js';
import { executeJs } from '../../shared/scripts/executeJs.js';

export type RuntimeRenderCode = {
  html?: string;
  css?: string;
  js?: string;
  meta?: unknown;
  metadata?: unknown;
} | null;

export function renderInlineWidgetCode(
  wrapper: HTMLElement,
  root: ShadowRoot,
  container: HTMLElement,
  code: NonNullable<RuntimeRenderCode>
): void {
  if (code.css) {
    const customStyle = document.createElement('style');
    customStyle.textContent = code.css;
    root.appendChild(customStyle);
  }
  if (code.html) {
    container.innerHTML = sanitizeHtml(code.html);
  }
  if (code.js) {
    try {
      executeJs(code.js, wrapper, root, 'Renderer');
    } catch (e) {
      console.error('[Renderer] custom js error', e);
    }
  }
}
