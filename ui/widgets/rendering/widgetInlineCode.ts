import { sanitizeHtml } from '../../shared/sanitize/sanitizer.js';
import { executeJs } from '../../shared/scripts/executeJs.js';

export type WidgetRenderData = {
  html?: string;
  css?: string;
  js?: string;
  meta?: Record<string, any> | string;
  metadata?: Record<string, any> | string;
};

export function renderWidgetInlineCode(
  wrapper: HTMLElement,
  content: HTMLElement,
  container: HTMLElement,
  data: WidgetRenderData,
  context = 'Widgets'
): void {
  if (data.css) {
    const customStyle = document.createElement('style');
    customStyle.textContent = data.css;
    content.appendChild(customStyle);
  }
  if (data.html) {
    container.innerHTML = sanitizeHtml(data.html);
  }
  if (data.js) {
    try {
      executeJs(data.js, wrapper, content, context);
    } catch (err) {
      console.error(`[${context}] custom js error`, err);
    }
  }
}
