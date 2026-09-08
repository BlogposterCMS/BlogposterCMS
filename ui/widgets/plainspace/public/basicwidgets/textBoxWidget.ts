import { registerEditableElement } from '../../../rendering/editableRegistration.js';
import {
  readString,
  sanitizeRichHtml,
  sharedStyle,
  widgetSettings,
  widgetLocale,
  type PublicWidgetContext
} from './publicWidgetHelpers.js';

function richTextStyle(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
.widget-rich-text {
  display: grid;
  align-content: center;
  gap: 10px;
  min-height: 100%;
  line-height: 1.55;
}
.widget-rich-text h1,
.widget-rich-text h2,
.widget-rich-text h3,
.widget-rich-text h4,
.widget-rich-text h5,
.widget-rich-text h6,
.widget-rich-text p,
.widget-rich-text ul,
.widget-rich-text ol,
.widget-rich-text blockquote,
.widget-rich-text pre {
  margin: 0;
}
.widget-rich-text h1,
.widget-rich-text h2,
.widget-rich-text h3,
.widget-rich-text h4,
.widget-rich-text h5,
.widget-rich-text h6 {
  color: var(--studio-text);
  font-family: var(--font-heading);
  line-height: 1.12;
  letter-spacing: 0;
}
.widget-rich-text h1 {
  font-size: 2.25rem;
}
.widget-rich-text h2 {
  font-size: 1.75rem;
}
.widget-rich-text h3 {
  font-size: 1.35rem;
}
.widget-rich-text h4 {
  font-size: 1.15rem;
}
.widget-rich-text h5 {
  font-size: 1rem;
}
.widget-rich-text h6 {
  font-size: 0.875rem;
}
.widget-rich-text p,
.widget-rich-text span,
.widget-rich-text li,
.widget-rich-text blockquote,
.widget-rich-text pre {
  color: var(--studio-text-muted);
  font-size: 1rem;
}
.widget-rich-text ul,
.widget-rich-text ol {
  padding-left: 1.25em;
}
.widget-rich-text a {
  color: var(--color-primary);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}
.widget-rich-text pre {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
  `.trim();
  // Consume the shared role variables inside both normal DOM and widget Shadow DOM.
  const roles = { h1: '2.25rem', h2: '1.75rem', h3: '1.35rem', h4: '1.15rem', h5: '1rem', h6: '0.875rem', paragraph: '1rem', link: 'inherit', blockquote: '1rem', code: '1rem' };
  for (const [role, size] of Object.entries(roles)) {
    const selector = role === 'paragraph' ? 'p, .widget-rich-text span, .widget-rich-text li'
      : role === 'link' ? 'a' : role === 'code' ? 'pre, .widget-rich-text code' : role;
    style.textContent += `\n.widget-rich-text ${selector} {
      font-family: var(--bp-type-${role}-font-family, inherit);
      font-size: var(--bp-type-${role}-font-size, ${size});
      font-weight: var(--bp-type-${role}-font-weight, inherit);
      line-height: var(--bp-type-${role}-line-height, inherit);
      letter-spacing: var(--bp-type-${role}-letter-spacing, normal);
      color: var(--bp-type-${role}-color, var(--bp-color-default-2, inherit));
      font-style: var(--bp-type-${role}-font-style, normal);
      text-transform: var(--bp-type-${role}-text-transform, none);
      text-decoration: var(--bp-type-${role}-text-decoration, none);
    }`;
  }
  return style;
}

function renderDefaultRichText(editable: HTMLElement, heading: string, body: string): void {
  if (heading) {
    const title = document.createElement('h2');
    title.textContent = heading;
    editable.appendChild(title);
  }
  const paragraph = document.createElement('p');
  paragraph.textContent = body || 'Write your copy';
  editable.appendChild(paragraph);
}

function appendBuilderHitLayer(wrapper: HTMLElement): void {
  const shield = document.createElement('div');
  shield.className = 'hit-layer';
  Object.assign(shield.style, {
    position: 'absolute',
    inset: '0',
    background: 'transparent',
    cursor: 'move',
    pointerEvents: 'auto',
    zIndex: '5'
  });
  wrapper.style.position = 'relative';
  wrapper.appendChild(shield);
}

export async function render(el: HTMLElement | null, ctx: PublicWidgetContext = {}): Promise<void> {
  if (!el) return;
  const settings = widgetSettings(ctx, {
    heading: 'New headline',
    body: 'Write your copy'
  });
  const wrapper = document.createElement('div');
  wrapper.className = 'bp-public-widget widget-textbox';

  if (ctx.id) {
    wrapper.id = `text-widget-${ctx.id}`;
  }

  const editable = document.createElement('div');
  editable.className = 'editable widget-rich-text';
  editable.dataset.textEditable = '';
  editable.dataset.contentLocale = widgetLocale();

  if (ctx.id) {
    editable.id = `text-widget-${ctx.id}-editable`;
  }

  const html = readString(settings, ['html', 'contentHtml']);
  if (html) {
    editable.innerHTML = sanitizeRichHtml(html);
  } else {
    renderDefaultRichText(
      editable,
      readString(settings, ['heading', 'title'], 'New headline'),
      readString(settings, ['body', 'text', 'copy'], 'Write your copy')
    );
  }

  wrapper.appendChild(editable);

  if (document.body.classList.contains('builder-mode')) {
    appendBuilderHitLayer(wrapper);
  }

  el.innerHTML = '';
  el.append(sharedStyle(), richTextStyle(), wrapper);

  if (document.body.classList.contains('builder-mode')) {
    await registerEditableElement(editable, 'textBoxWidget');
  }
}
