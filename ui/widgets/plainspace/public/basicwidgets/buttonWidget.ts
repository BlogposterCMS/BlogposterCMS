import {
  normalizeLinkUrl,
  readBoolean,
  readString,
  renderWidgetMessage,
  sharedStyle,
  widgetSettings,
  type PublicWidgetContext
} from './publicWidgetHelpers.js';

function buttonStyle(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
.bp-public-widget.bp-button-widget {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: min(100%, 10rem);
  min-height: 44px;
  padding: 0.75rem 1.15rem;
  border: 1px solid var(--studio-border-strong);
  border-radius: var(--studio-radius-control);
  background: var(--bp-color-default-1, var(--studio-text));
  color: var(--bp-color-default-3, var(--studio-surface-solid));
  font-family: var(--bp-type-button-font-family, inherit);
  font-size: var(--bp-type-button-font-size, inherit);
  font-weight: var(--bp-type-button-font-weight, 700);
  line-height: var(--bp-type-button-line-height, 1);
  text-align: center;
  text-decoration: var(--bp-type-button-text-decoration, none);
  text-transform: var(--bp-type-button-text-transform, none);
  font-style: var(--bp-type-button-font-style, normal);
  letter-spacing: var(--bp-type-button-letter-spacing, 0);
}
.bp-public-widget.bp-button-widget--secondary {
  background: var(--bp-color-default-3, var(--studio-surface-solid));
  color: var(--bp-color-default-1, var(--studio-text));
}
.bp-public-widget.bp-button-widget--plain {
  min-width: 0;
  min-height: 0;
  padding: 0;
  border-color: transparent;
  border-radius: 0;
  background: transparent;
  color: var(--bp-type-link-color, var(--bp-color-default-5, var(--color-primary)));
  text-decoration: underline;
  text-underline-offset: 0.18em;
}
.bp-public-widget.bp-button-widget:focus-visible {
  outline: 0;
  box-shadow: var(--studio-focus-ring);
}
  `.trim();
  return style;
}

export function render(el: HTMLElement | null, ctx: PublicWidgetContext = {}): void {
  if (!el) return;
  const settings = widgetSettings(ctx, {
    label: 'Start now',
    href: '#'
  });
  const rawHref = readString(settings, ['href', 'link', 'url'], '#');
  const href = normalizeLinkUrl(rawHref);
  if (!href) {
    renderWidgetMessage(el, 'BP_WIDGET_BUTTON_UNSAFE_URL', 'Button link blocked', 'Use a safe internal, http, https, mailto or tel link.');
    return;
  }

  const link = document.createElement('a');
  const variant = readString(settings, ['variant', 'style'], 'primary');
  link.className = `bp-public-widget bp-button-widget bp-button-widget--${['secondary', 'plain'].includes(variant) ? variant : 'primary'}`;
  link.href = href;
  link.textContent = readString(settings, ['label', 'text', 'title'], 'Start now');
  if (readBoolean(settings, ['targetBlank', 'newTab'], false)) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  el.replaceChildren(sharedStyle(), buttonStyle(), link);
}
