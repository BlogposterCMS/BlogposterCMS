import { renderWidgetInlineCode } from './widgetRuntimeGateway.js';

export type RuntimeRenderCode = {
  html?: string;
  css?: string;
  js?: string;
  meta?: unknown;
  metadata?: unknown;
} | null;

/** Keep the runtime entry point while sharing HTML/CSS/script handling with Studio. */
export function renderInlineWidgetCode(
  wrapper: HTMLElement,
  root: ShadowRoot,
  container: HTMLElement,
  code: NonNullable<RuntimeRenderCode>
): void {
  renderWidgetInlineCode(wrapper, root, container, code, 'Renderer');
}
