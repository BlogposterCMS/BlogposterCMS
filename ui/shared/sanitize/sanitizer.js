import DOMPurify from '../vendor/dompurify-3.4.15/purify.es.js';
const HTML_SANITIZE_CONFIG = {
    ADD_ATTR: ['target'],
    ALLOW_ARIA_ATTR: true,
    ALLOW_DATA_ATTR: true,
    FORCE_BODY: true,
    FORBID_ATTR: ['srcdoc'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    RETURN_TRUSTED_TYPE: false,
};
DOMPurify.addHook('uponSanitizeElement', (currentNode, hookEvent) => {
    if (hookEvent.tagName === 'style') {
        currentNode.textContent = sanitizeCss(currentNode.textContent ?? '');
    }
});
DOMPurify.addHook('uponSanitizeAttribute', (_currentNode, hookEvent) => {
    if (hookEvent.attrName !== 'style')
        return;
    const sanitized = sanitizeCss(hookEvent.attrValue, true);
    hookEvent.attrValue = sanitized;
    hookEvent.keepAttr = sanitized.length > 0;
});
export function sanitizeHtml(html) {
    return DOMPurify.sanitize(html, HTML_SANITIZE_CONFIG);
}
export function sanitizeCss(css, inline = false) {
    const expr = /expression/i;
    const urlPattern = /url\(([^)]*)\)/gi;
    const importPattern = /@import\s+(?:url\(([^)]+)\)|(['"])([^'"]+)\2)/gi;
    const isUnsafeUrl = (url) => {
        const val = url.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
        return /^(?:javascript|data|vbscript|file|ftp|chrome|chrome-extension|resource|about|blob):/.test(val);
    };
    const hasUnsafeImport = (rule) => {
        const match = rule.match(/@import\s+(?:url\(([^)]+)\)|(['"])([^'"]+)\2)/i);
        if (!match)
            return false;
        const target = (match[1] || match[3] || '').trim();
        return !target || isUnsafeUrl(target);
    };
    if (inline) {
        return css
            .split(';')
            .map(s => s.trim())
            .filter(Boolean)
            .filter(rule => {
            if (expr.test(rule))
                return false;
            if (/@import/i.test(rule) && hasUnsafeImport(rule))
                return false;
            const matches = rule.matchAll(urlPattern);
            for (const [, url] of matches) {
                if (isUnsafeUrl(url ?? ''))
                    return false;
            }
            return true;
        })
            .join('; ');
    }
    return css
        .replace(/expression\([^)]*\)/gi, '')
        .replace(importPattern, (match, url, _quote, literal) => {
        const target = (url || literal || '').trim();
        return target && !isUnsafeUrl(target) ? match : '';
    })
        .replace(urlPattern, (match, url) => (isUnsafeUrl(url ?? '') ? '' : match));
}
