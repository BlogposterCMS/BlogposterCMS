export const UI_TAGS = new Set(['div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'p', 'span', 'strong', 'em', 'small',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'label', 'button', 'input', 'textarea', 'select', 'option', 'a', 'hr', 'pre', 'code',
    'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'img', 'progress', 'details', 'summary',
    'composer', 'richtext', 'popover', 'tooltip', 'dialog', 'drawer', 'toast', 'tabs', 'accordion', 'skeleton', 'kit']);
export const UI_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function uiError(code) { return Object.assign(new Error(code), { code }); }
/** Paths read own JSON fields only. They are never JavaScript expressions. */
export function readBinding(scope, path) {
    if (typeof path !== 'string' || path.length > 240)
        throw uiError('WIDGET_BINDING_PATH_INVALID');
    const parts = path.split('.');
    if (parts.length > 12 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part) || forbidden.has(part)))
        throw uiError('WIDGET_BINDING_PATH_INVALID');
    let value = scope;
    for (const part of parts) {
        if (Array.isArray(value) && part === 'length')
            value = value.length;
        else
            value = value !== null && typeof value === 'object' && Object.hasOwn(value, part) ? value[part] : undefined;
    }
    return value;
}
export function conditionMatches(condition, scope) {
    const value = readBinding(scope, condition.ref);
    const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
    switch (condition.operator) {
        case 'truthy': return !!value;
        case 'empty': return empty;
        case 'notEmpty': return !empty;
        case 'equals': return value === condition.value;
        case 'notEquals': return value !== condition.value;
        default: throw uiError('WIDGET_CONDITION_INVALID');
    }
}
export function resolveInput(value, scope, depth = 0) {
    if (depth > 12)
        throw uiError('WIDGET_BINDING_DEPTH');
    if (!value || typeof value !== 'object')
        return value;
    if (!Array.isArray(value) && Object.keys(value).length === 1 && Object.hasOwn(value, 'ref'))
        return readBinding(scope, value.ref);
    if (Array.isArray(value))
        return value.slice(0, 100).map(item => resolveInput(item, scope, depth + 1));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (forbidden.has(key))
            throw uiError('WIDGET_BINDING_KEY_INVALID');
        return [key, resolveInput(item, scope, depth + 1)];
    }));
}
export function validateView(tree) {
    let count = 0;
    const keys = new Set();
    function visit(node, depth) {
        if (!node || !UI_TAGS.has(node.tag) || ++count > 500 || depth > 20)
            throw uiError('WIDGET_VIEW_INVALID');
        if (node.key) {
            if (!UI_NAME.test(node.key) || keys.has(node.key))
                throw uiError('WIDGET_VIEW_KEY_INVALID');
            keys.add(node.key);
        }
        for (const field of ['text', 'value', 'label', 'name', 'type', 'action', 'anchor']) {
            if (node[field] !== undefined && (typeof node[field] !== 'string' || node[field].length > 16384))
                throw uiError('WIDGET_VIEW_TEXT_LIMIT');
        }
        if (node.action && !UI_NAME.test(node.action))
            throw uiError('WIDGET_VIEW_ACTION_INVALID');
        if (node.events)
            for (const [event, action] of Object.entries(node.events)) {
                if (!['click', 'input', 'change', 'submit', 'keydown', 'close', 'focus', 'blur'].includes(event) || !UI_NAME.test(action))
                    throw uiError('WIDGET_VIEW_EVENT_INVALID');
            }
        if (node.bindings)
            for (const [field, binding] of Object.entries(node.bindings)) {
                if (!['text', 'value', 'label', 'open', 'hidden', 'disabled', 'checked', 'href', 'src', 'html', 'selected'].includes(field))
                    throw uiError('WIDGET_BINDING_TARGET_INVALID');
                readBinding({}, binding.ref);
            }
        if (node.when)
            conditionMatches(node.when, {});
        if (node.repeat) {
            readBinding({}, node.repeat.ref);
            readBinding({}, node.repeat.key);
        }
        if (node.children !== undefined && !Array.isArray(node.children))
            throw uiError('WIDGET_VIEW_CHILDREN_INVALID');
        node.children?.forEach(child => visit(child, depth + 1));
    }
    visit(tree, 0);
}
export function normalizeUiDocument(value) {
    // JSON cloning excludes prototypes, functions and runtime objects from saved definitions.
    const raw = JSON.stringify(value);
    if (!raw || raw.length > 131072)
        throw uiError('WIDGET_DOCUMENT_SIZE');
    const doc = JSON.parse(raw);
    if (doc.version !== 1 || !doc.state || typeof doc.state !== 'object' || Array.isArray(doc.state))
        throw uiError('WIDGET_DOCUMENT_INVALID');
    for (const key of Object.keys(doc.state))
        if (!UI_NAME.test(key) || forbidden.has(key))
            throw uiError('WIDGET_STATE_KEY_INVALID');
    if (Object.keys(doc.sources || {}).length > 16 || Object.keys(doc.actions || {}).length > 64)
        throw uiError('WIDGET_DOCUMENT_LIMIT');
    for (const [name, source] of Object.entries(doc.sources || {})) {
        if (!UI_NAME.test(name) || !UI_NAME.test(source.operation) || (source.debounceMs !== undefined && (!Number.isFinite(source.debounceMs) || source.debounceMs < 0 || source.debounceMs > 2000)))
            throw uiError('WIDGET_SOURCE_INVALID');
        resolveInput(source.input || {}, {});
    }
    for (const [name, actions] of Object.entries(doc.actions || {})) {
        if (!UI_NAME.test(name) || !Array.isArray(actions) || actions.length > 8)
            throw uiError('WIDGET_ACTION_INVALID');
        for (const action of actions) {
            if (!['set', 'toggle', 'request'].includes(action.type) || !UI_NAME.test(action.target) || forbidden.has(action.target))
                throw uiError('WIDGET_ACTION_INVALID');
            if (action.type === 'request' && !Object.hasOwn(doc.sources || {}, action.target))
                throw uiError('WIDGET_SOURCE_MISSING');
            resolveInput(action.value, {});
        }
    }
    validateView(doc.view);
    return doc;
}
