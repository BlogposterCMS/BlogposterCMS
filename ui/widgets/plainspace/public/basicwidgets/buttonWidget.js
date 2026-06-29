import { normalizeLinkUrl, readBoolean, readString, renderWidgetMessage, sharedStyle, widgetSettings } from './publicWidgetHelpers.js';
function buttonStyle() {
    const style = document.createElement('style');
    style.textContent = `
.bp-button-widget {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: min(100%, 10rem);
  min-height: 44px;
  padding: 0.75rem 1.15rem;
  border: 1px solid var(--studio-border-strong);
  border-radius: var(--studio-radius-control);
  background: var(--studio-text);
  color: var(--studio-surface-solid);
  font-weight: 700;
  line-height: 1;
  text-align: center;
  text-decoration: none;
  letter-spacing: 0;
}
.bp-button-widget--secondary {
  background: var(--studio-surface-solid);
  color: var(--studio-text);
}
.bp-button-widget--plain {
  min-width: 0;
  min-height: 0;
  padding: 0;
  border-color: transparent;
  border-radius: 0;
  background: transparent;
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 0.18em;
}
.bp-button-widget:focus-visible {
  outline: 0;
  box-shadow: var(--studio-focus-ring);
}
  `.trim();
    return style;
}
export function render(el, ctx = {}) {
    if (!el)
        return;
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
