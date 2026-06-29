let documentObserver = null;
let documentBindingsReady = false;
function isExternalHttpLink(anchor) {
    const href = anchor.getAttribute('href')?.trim();
    if (!href)
        return false;
    try {
        const url = new URL(href, window.location.href);
        return (url.protocol === 'http:' || url.protocol === 'https:')
            && url.origin !== window.location.origin;
    }
    catch {
        return false;
    }
}
function markExternalLink(anchor) {
    if (isExternalHttpLink(anchor)) {
        anchor.dataset.externalLink = 'true';
        return;
    }
    if (anchor.dataset.externalLink === 'true') {
        delete anchor.dataset.externalLink;
    }
}
function markExternalLinks(root) {
    if (root instanceof HTMLAnchorElement) {
        markExternalLink(root);
        return;
    }
    root.querySelectorAll('a[href]').forEach(markExternalLink);
}
function markAddedLinks(node) {
    if (node instanceof HTMLAnchorElement) {
        markExternalLink(node);
        return;
    }
    if (node instanceof Element || node instanceof DocumentFragment) {
        markExternalLinks(node);
    }
}
function bindDocumentObserver() {
    if (documentBindingsReady)
        return;
    documentBindingsReady = true;
    if (typeof MutationObserver === 'undefined' || !document.body)
        return;
    documentObserver = new MutationObserver(records => {
        records.forEach(record => {
            if (record.type === 'attributes' && record.target instanceof HTMLAnchorElement) {
                markExternalLink(record.target);
                return;
            }
            record.addedNodes.forEach(markAddedLinks);
        });
    });
    documentObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['href'],
        childList: true,
        subtree: true,
    });
}
export default function enhanceExternalLinks(root = document) {
    markExternalLinks(root);
    bindDocumentObserver();
}
function startExternalLinks() {
    enhanceExternalLinks(document);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startExternalLinks, { once: true });
}
else {
    startExternalLinks();
}
