import { sanitizeHtml } from '../../shared/sanitize/sanitizer.js';
import { executeJs } from '../../shared/scripts/executeJs.js';

export type WidgetRenderData = {
  html?: string;
  css?: string;
  js?: string;
  meta?: unknown;
  metadata?: unknown;
};

export function hasInlineWidgetCode(data: WidgetRenderData | null | undefined): data is WidgetRenderData {
  return Boolean(data && [data.html, data.css, data.js].some(
    value => typeof value === 'string' && value.trim()
  ));
}

function parseWidgetMetadata(value: unknown): Record<string, any> {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any> : {};
}

/** Saved instance overrides win over legacy metadata in every rendering surface. */
export function instanceMetadataFromCode(data: WidgetRenderData | null | undefined): Record<string, any> {
  return { ...parseWidgetMetadata(data?.metadata), ...parseWidgetMetadata(data?.meta) };
}

export function renderWidgetInlineCode(
  wrapper: HTMLElement,
  content: HTMLElement | ShadowRoot,
  container: HTMLElement,
  data: WidgetRenderData,
  context = 'Widgets',
  onHtmlRendered?: (container: HTMLElement) => void
): void {
  if (data.css) {
    const customStyle = document.createElement('style');
    customStyle.textContent = data.css;
    content.appendChild(customStyle);
  }
  if (data.html) {
    container.innerHTML = sanitizeHtml(data.html);
  }
  // Studio registers editable roots before authored scripts run, as before.
  onHtmlRendered?.(container);
  if (data.js) {
    try {
      executeJs(data.js, wrapper, content, context);
    } catch (err) {
      console.error(`[${context}] custom js error`, err);
    }
  }
}
