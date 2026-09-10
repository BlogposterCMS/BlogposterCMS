import { sanitizeHtml } from '../sanitize/sanitizer.js';
import { normalizeLinkUrl, normalizeMediaUrl } from '../design-system/publicWidgetHelpers.js';
import { uiError, type UiNode } from '/ui/shared/widget-ui/model.js';

const renderedArticles = new WeakMap<HTMLElement, string>();

/** Automatically loaded media cannot become a worker-controlled outbound network channel. */
export function localUiMedia(value: unknown): string | null {
  const normalized = normalizeMediaUrl(value);
  if (!normalized) return null;
  const url = new URL(normalized, document.baseURI);
  return url.origin === new URL(document.baseURI).origin && /^\/(media|assets)\//.test(url.pathname) && !url.search && !url.hash ? url.pathname : null;
}

export function elementTag(node: UiNode): string {
  if (['dialog','drawer'].includes(node.tag)) return 'dialog';
  if (node.tag === 'accordion') return 'details';
  if (['composer','richtext','popover','tooltip','toast','tabs','skeleton','kit'].includes(node.tag)) return 'div';
  return node.tag;
}

/** Native controls retain their DOM identity during composition, selection and undo. */
export function updateControl(element: HTMLElement, node: UiNode, composing: boolean, preview: boolean): void {
  const props = node.props || {};
  element.hidden = node.hidden === true;
  if (node.label !== undefined) element.setAttribute('aria-label', node.label.slice(0, 200));
  else element.removeAttribute('aria-label');
  if (node.name) element.setAttribute('name', node.name.slice(0, 80));
  if (props.tabIndex === -1 || props.tabIndex === 0) element.tabIndex = props.tabIndex;
  if (node.tag === 'button') (element as HTMLButtonElement).type = 'button';
  if (node.tag === 'input') {
    const type = node.type || 'text';
    if (!['text','search','email','number','checkbox','radio','date','time','range','color','tel','url'].includes(type)) throw uiError('WIDGET_VIEW_INPUT_INVALID');
    (element as HTMLInputElement).type = type;
  }
  if (['input','textarea','select','option'].includes(node.tag)) {
    const input = element as HTMLInputElement;
    if (node.value !== undefined && input.value !== node.value && !composing) input.value = node.value;
    input.disabled = props.disabled === true;
    if ('checked' in props) input.checked = props.checked === true;
    if (typeof props.placeholder === 'string') input.setAttribute('placeholder', props.placeholder.slice(0, 200));
  }
  if (element instanceof HTMLButtonElement) element.disabled = props.disabled === true;
  if (node.tag === 'composer') {
    element.dataset.uiComposer = 'true';
    element.setAttribute('contenteditable', props.disabled ? 'false' : 'plaintext-only');
    element.setAttribute('role', props.role === 'combobox' ? 'combobox' : 'textbox');
    element.setAttribute('aria-multiline', 'true');
    if (props.role === 'combobox') element.setAttribute('aria-autocomplete', 'list');
    else element.removeAttribute('aria-autocomplete');
    element.setAttribute('aria-disabled', String(props.disabled === true));
    element.dataset.placeholder = String(props.placeholder || '').slice(0, 200);
    const text = (element.innerText ?? element.textContent ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
    if (node.value !== undefined && node.value !== text && !composing) element.textContent = node.value;
    element.setAttribute('aria-invalid', String(text.length > Number(props.maxLength || 16384)));
  }
  if (node.tag === 'a') {
    const href = normalizeLinkUrl(props.href);
    if (href && !preview) element.setAttribute('href', href); else element.removeAttribute('href');
    if (props.newTab === true) { element.setAttribute('target', '_blank'); element.setAttribute('rel', 'noopener noreferrer'); }
  }
  if (node.tag === 'img') {
    const src = localUiMedia(props.src);
    if (src) element.setAttribute('src', src); else element.removeAttribute('src');
    element.setAttribute('alt', String(props.alt || '')); element.setAttribute('loading', 'lazy');
  }
  if (node.tag === 'richtext') {
    const html = String(props.html || '').slice(0, 65536);
    element.dataset.uiRichtext = 'true';
    if (renderedArticles.get(element) !== html) {
      const template = document.createElement('template'); template.innerHTML = sanitizeHtml(html);
      // Article rendering never imports document chrome, style sheets or executable embeds.
      template.content.querySelectorAll('script,style,link,iframe,object,embed,form,input,button,textarea,select,video,audio,header,nav,footer,aside').forEach(item => item.remove());
      template.content.querySelectorAll('*').forEach(item => {
        for (const attribute of [...item.attributes]) {
          if (!['href','src','alt','title','colspan','rowspan'].includes(attribute.name)) item.removeAttribute(attribute.name);
        }
        if (item.hasAttribute('href')) { const href = normalizeLinkUrl(item.getAttribute('href')); if (href && !href.startsWith('#') && !preview) item.setAttribute('href', href); else item.removeAttribute('href'); }
        if (item.hasAttribute('src')) { const src = localUiMedia(item.getAttribute('src')); if (src) item.setAttribute('src', src); else item.removeAttribute('src'); }
      });
      element.replaceChildren(template.content); renderedArticles.set(element, html);
    }
  }
  if (node.tag === 'progress') {
    (element as HTMLProgressElement).max = 100;
    if (typeof props.progress === 'number') (element as HTMLProgressElement).value = Math.max(0, Math.min(100, props.progress));
  }
  if (node.tag === 'skeleton') { element.dataset.uiSkeleton = 'true'; element.setAttribute('aria-hidden', 'true'); }
  if (node.tag === 'toast') { element.setAttribute('role', 'status'); element.setAttribute('aria-live', 'polite'); }
  if (node.tag === 'drawer') element.dataset.uiDrawer = 'true';
  for (const [key, attribute] of [['expanded','aria-expanded'],['selected','aria-selected'],['busy','aria-busy']] as const) {
    if (typeof props[key] === 'boolean') element.setAttribute(attribute, String(props[key]));
  }
  if (typeof props.role === 'string' && ['listbox','option','status','alert','tablist','tab','tabpanel','menu','menuitem'].includes(props.role)) element.setAttribute('role', props.role);
}
