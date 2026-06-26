import { sanitizeHtml } from '../../shared/sanitize/sanitizer.js';
import { executeJs } from '../../shared/scripts/executeJs.js';
export function renderInlineWidgetCode(wrapper, root, container, code) {
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
        }
        catch (e) {
            console.error('[Renderer] custom js error', e);
        }
    }
}
