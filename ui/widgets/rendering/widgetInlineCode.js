import { sanitizeHtml } from '../../shared/sanitize/sanitizer.js';
import { executeJs } from '../../shared/scripts/executeJs.js';
export function renderWidgetInlineCode(wrapper, content, container, data, context = 'Widgets') {
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
        }
        catch (err) {
            console.error(`[${context}] custom js error`, err);
        }
    }
}
