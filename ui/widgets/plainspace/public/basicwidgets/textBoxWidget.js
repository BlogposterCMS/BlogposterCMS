import { registerEditableElement } from '../../../rendering/editableRegistration.js';
import { readString, sanitizeRichHtml, sharedStyle, widgetSettings } from './publicWidgetHelpers.js';
function richTextStyle() {
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
.widget-rich-text p,
.widget-rich-text ul,
.widget-rich-text ol,
.widget-rich-text blockquote {
  margin: 0;
}
.widget-rich-text h1,
.widget-rich-text h2,
.widget-rich-text h3 {
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
.widget-rich-text p,
.widget-rich-text li,
.widget-rich-text blockquote {
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
  `.trim();
    return style;
}
function renderDefaultRichText(editable, heading, body) {
    if (heading) {
        const title = document.createElement('h2');
        title.textContent = heading;
        editable.appendChild(title);
    }
    const paragraph = document.createElement('p');
    paragraph.textContent = body || 'Write your copy';
    editable.appendChild(paragraph);
}
function appendBuilderHitLayer(wrapper) {
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
export async function render(el, ctx = {}) {
    if (!el)
        return;
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
    if (ctx.id) {
        editable.id = `text-widget-${ctx.id}-editable`;
    }
    const html = readString(settings, ['html', 'contentHtml']);
    if (html) {
        editable.innerHTML = sanitizeRichHtml(html);
    }
    else {
        renderDefaultRichText(editable, readString(settings, ['heading', 'title'], 'New headline'), readString(settings, ['body', 'text', 'copy'], 'Write your copy'));
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
