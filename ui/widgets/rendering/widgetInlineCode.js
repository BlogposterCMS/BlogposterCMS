import { sanitizeHtml } from '../../shared/sanitize/sanitizer.js';
import { executeJs } from '../../shared/scripts/executeJs.js';
import { applyHtmlImportPresentation } from '../../shared/layout/htmlImportPresentation.js';
export function hasInlineWidgetCode(data) {
    return Boolean(data && [data.html, data.css, data.js].some(value => typeof value === 'string' && value.trim()));
}
function parseWidgetMetadata(value) {
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        }
        catch {
            return {};
        }
    }
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value : {};
}
/** Saved instance overrides win over legacy metadata in every rendering surface. */
export function instanceMetadataFromCode(data) {
    return { ...parseWidgetMetadata(data?.metadata), ...parseWidgetMetadata(data?.meta) };
}
export function renderWidgetInlineCode(wrapper, content, container, data, context = 'Widgets', onHtmlRendered) {
    const importInfo = instanceMetadataFromCode(data).htmlImport;
    if (importInfo && typeof importInfo === 'object' && importInfo.version === 1) {
        applyHtmlImportPresentation(wrapper, importInfo);
        // Expose provenance on the ordinary rendered widget for the existing Studio feedback channel.
        wrapper.dataset.htmlImport = JSON.stringify({
            version: 1,
            sourceId: String(importInfo.sourceId || '').slice(0, 100),
            kind: String(importInfo.kind || '').slice(0, 30),
            parentId: String(importInfo.parentId || '').slice(0, 150),
            sectionId: String(importInfo.sectionId || '').slice(0, 150),
            capturedWidths: Array.isArray(importInfo.capturedWidths) ? importInfo.capturedWidths.slice(0, 8) : [],
            warnings: Array.isArray(importInfo.warnings) ? importInfo.warnings.slice(0, 30) : []
        });
    }
    else {
        delete wrapper.dataset.htmlImport;
    }
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
        }
        catch (err) {
            console.error(`[${context}] custom js error`, err);
        }
    }
}
