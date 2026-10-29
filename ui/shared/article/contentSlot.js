import { pagePresentationFromList } from '../layout/pagePresentation.js';
import { extractDesignDocument } from '../layout/layoutDocument.js';
export const CONTENT_SLOT_HTML = '<div data-dynamic-host="true"></div>';
/** Same destination marker as the Designer's page-content container. */
export function htmlContentSlot(root) {
    return root.querySelector('[data-dynamic-host="true"]');
}
export function designHasContentSlot(value) {
    const visit = (node) => Boolean(node &&
        (node.isDynamicHost || (node.type === 'split' && node.children.some(visit))));
    return visit(extractDesignDocument(value).layoutTree);
}
/** Missing parent alone is not an error: standalone pages render their own HTML. */
export async function missingContentSlot(page, pages, mainDesign, loadDesign, loadPage) {
    const hasContent = Boolean(page.html?.trim() || page.meta?.contentFormat === 'article-v1' || page.meta?.htmlFileName);
    const presentation = pagePresentationFromList(page, pages, mainDesign);
    if (presentation?.designId) {
        if ((hasContent || presentation.contentDesignId) && !designHasContentSlot(await loadDesign(presentation.designId)))
            return true;
        if (hasContent && presentation.contentDesignId && !designHasContentSlot(await loadDesign(presentation.contentDesignId)))
            return true;
    }
    else if (hasContent && presentation?.layoutTemplate) {
        // Legacy grid templates have no authored page-content container.
        return true;
    }
    if (hasContent && page.is_content && page.parent_id != null) {
        const parent = await loadPage(String(page.parent_id));
        const outer = pagePresentationFromList(parent, pages, mainDesign);
        if (outer?.designId) {
            if (!designHasContentSlot(await loadDesign(outer.designId)))
                return true;
            if (outer.contentDesignId && !designHasContentSlot(await loadDesign(outer.contentDesignId)))
                return true;
        }
        else if (parent.html) {
            const template = document.createElement('template');
            template.innerHTML = parent.html;
            return !htmlContentSlot(template.content);
        }
    }
    return false;
}
