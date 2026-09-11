import { normalizeLayoutTree } from './layoutDocument.js';
const cssKey = (key) => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
/** DOM-free presentation of the existing v1 document, shared by first HTML and runtime. */
export function layoutContainerStyle(settings, split) {
    const style = {};
    if (split) {
        style['align-items'] = settings.align || 'stretch';
        style.display = settings.mode === 'grid' ? 'grid' : settings.mode === 'free' ? 'block' : 'flex';
        style['flex-direction'] = ['grid', 'free'].includes(settings.mode || '') ? '' : settings.mode === 'row' ? 'row' : 'column';
    }
    for (const key of ['gap', 'padding', 'background', 'minWidth', 'maxWidth', 'minHeight', 'overflow']) {
        style[cssKey(key)] = settings[key] || '';
    }
    style['--layout-columns'] = settings.columns ? String(settings.columns) : '';
    style['--layout-align'] = settings.align || '';
    style['--layout-height'] = settings.height || '';
    for (const key of ['borderWidth', 'borderStyle', 'borderColor', 'borderRadius', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']) {
        style[cssKey(key)] = settings[key] || (key.endsWith('Width') ? settings.borderWidth || (settings.borderStyle ? '0px' : '') : '');
    }
    return style;
}
/** No writes: old omitted modes retain exactly the established orientation/free defaults. */
export function describeLayoutTree(value) {
    const tree = normalizeLayoutTree(value);
    if (!tree)
        return null;
    const all = [];
    const visit = (node, path, flex = '1 1 0') => {
        const mode = node.settings?.mode || (node.type === 'split' ? node.orientation === 'horizontal' ? 'stack' : 'row' : 'free');
        const settings = { ...node.settings, mode };
        const attributes = {
            class: 'layout-container runtime-layout-container', 'data-bp-layout-path': path,
            'data-layout-mode': mode
        };
        if (node.nodeId)
            attributes['data-node-id'] = node.nodeId;
        if (node.workarea)
            attributes['data-workarea'] = 'true';
        if (node.isDynamicHost)
            attributes['data-dynamic-host'] = 'true';
        if (node.type === 'split') {
            attributes['data-split'] = 'true';
            attributes['data-orientation'] = node.orientation;
        }
        else if (node.designRef)
            attributes['data-design-ref'] = node.designRef;
        for (const [key, setting] of Object.entries(settings)) {
            attributes[`data-layout-${cssKey(key)}`] = typeof setting === 'object' ? JSON.stringify(setting) : String(setting);
        }
        const style = { flex, ...layoutContainerStyle(settings, node.type === 'split') };
        const section = node.section;
        if (section) {
            attributes.class += ' layout-section';
            attributes['data-node-id'] = section.id;
            attributes['data-section-id'] = section.id;
            attributes['data-section-title'] = section.title || section.id;
            if (section.background)
                attributes['data-section-background'] = section.background;
            if (section.backgroundImageUrl) {
                attributes['data-bg-image-url'] = section.backgroundImageUrl;
                style['background-image'] = `url("${section.backgroundImageUrl.replace(/["\\]/g, '\\$&')}")`;
                Object.assign(style, { 'background-size': 'cover', 'background-repeat': 'no-repeat', 'background-position': 'center' });
            }
            if (section.backgroundImageId)
                attributes['data-bg-image-id'] = section.backgroundImageId;
        }
        for (const [key, setting] of Object.entries(node.placement || {})) {
            if (key === 'w' || key === 'h')
                attributes[`gs-${key}`] = String(setting);
            else if (key === 'zIndex') {
                attributes['data-layer-order'] = String(setting);
                style['z-index'] = String(setting);
            }
            else
                attributes[`data-${cssKey(key)}`] = typeof setting === 'object' ? JSON.stringify(setting) : String(setting);
        }
        const sourceKeys = { enabled: 'style-source-enabled', role: 'style-source-role', sourceId: 'style-source-id', syncLayout: 'style-sync-layout', syncDesign: 'style-sync-design' };
        for (const [key, setting] of Object.entries(node.styleSource || {}))
            attributes[`data-${sourceKeys[key]}`] = String(setting);
        const result = { node, attributes, style, children: [], settings };
        all.push(result);
        if (node.type === 'split')
            result.children = node.children.map((child, index) => visit(child, `${path}.${index}`, node.settings?.mode === 'stack' ? '0 0 auto' : Number.isFinite(node.sizes?.[index]) ? `${node.sizes[index]} 1 0` : '1 1 0'));
        return result;
    };
    const root = visit(tree, '0');
    // Preserve the existing ordered Style Source projection, including independent positions.
    for (const target of all) {
        const link = target.node.styleSource;
        if (!link?.sourceId || link.enabled === false || (link.syncLayout === false && link.syncDesign === false))
            continue;
        const source = all.find(item => item.attributes['data-node-id'] === link.sourceId);
        if (!source || source === target)
            continue;
        for (const key of Object.keys(target.attributes))
            if (key.startsWith('data-layout-'))
                delete target.attributes[key];
        for (const [key, setting] of Object.entries(source.attributes))
            if (key.startsWith('data-layout-'))
                target.attributes[key] = setting;
        target.settings = { ...source.settings };
        Object.assign(target.style, layoutContainerStyle(target.settings, target.node.type === 'split'));
        for (const key of ['gs-w', 'gs-h', 'gs-min-w', 'gs-min-h']) {
            if (source.attributes[key])
                target.attributes[key] = source.attributes[key];
            else
                delete target.attributes[key];
        }
    }
    return root;
}
