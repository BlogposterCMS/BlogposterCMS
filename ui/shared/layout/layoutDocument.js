import { hasStyleSourceSettings, normalizeStyleSourceSettings } from './styleSource.js';
export const DESIGN_DOCUMENT_VERSION = 1;
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function parseJsonRecord(value) {
    if (isRecord(value))
        return value;
    if (typeof value !== 'string')
        return null;
    try {
        const parsed = JSON.parse(value);
        return isRecord(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function normalizeNodeId(value) {
    if (typeof value === 'string' && value.trim())
        return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    return undefined;
}
function normalizeBoolean(value) {
    if (value === true)
        return true;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized))
            return true;
    }
    return undefined;
}
function normalizeContainerMode(value) {
    const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (mode === 'free' || mode === 'stack' || mode === 'row' || mode === 'grid') {
        return mode;
    }
    return undefined;
}
function normalizeCssLength(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        return `${Math.round(value)}px`;
    }
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 80 || /[;{}]/.test(trimmed))
        return undefined;
    if (/^\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)$/i.test(trimmed))
        return trimmed;
    if (/^(?:auto|min-content|max-content|fit-content)$/i.test(trimmed))
        return trimmed;
    return undefined;
}
function normalizeColor(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 80 || /[;{}]/.test(trimmed))
        return undefined;
    if (/^#[0-9a-f]{3,8}$/i.test(trimmed))
        return trimmed;
    if (/^(?:transparent|currentcolor)$/i.test(trimmed))
        return trimmed.toLowerCase();
    if (/^(?:rgb|rgba|hsl|hsla)\([0-9%.,\s-]+\)$/i.test(trimmed))
        return trimmed;
    return undefined;
}
function normalizeOverflow(value) {
    return value === 'visible' || value === 'hidden' || value === 'auto'
        ? value
        : undefined;
}
export function normalizeLayoutContainerSettings(value) {
    const source = isRecord(value) ? value : {};
    const settings = {};
    const mode = normalizeContainerMode(source.mode ?? source.layoutMode ?? source.layout_mode);
    const gap = normalizeCssLength(source.gap ?? source.layoutGap ?? source.layout_gap);
    const padding = normalizeCssLength(source.padding ?? source.layoutPadding ?? source.layout_padding);
    const background = normalizeColor(source.background ?? source.bg ?? source.backgroundColor ?? source.background_color);
    const maxWidth = normalizeCssLength(source.maxWidth ?? source.max_width);
    const minHeight = normalizeCssLength(source.minHeight ?? source.min_height);
    const overflow = normalizeOverflow(source.overflow);
    if (mode)
        settings.mode = mode;
    if (gap)
        settings.gap = gap;
    if (padding)
        settings.padding = padding;
    if (background)
        settings.background = background;
    if (maxWidth)
        settings.maxWidth = maxWidth;
    if (minHeight)
        settings.minHeight = minHeight;
    if (overflow)
        settings.overflow = overflow;
    return settings;
}
export function normalizeSceneSections(value) {
    return Array.isArray(value)
        ? value
            .filter(isRecord)
            .map(scene => {
            const id = String(scene.id || scene.sceneId || '').trim();
            const title = String(scene.title || scene.sceneTitle || id).trim();
            const background = String(scene.background || scene.bgColor || scene.bg_color || '').trim();
            if (!id)
                return null;
            return {
                id,
                title: title || id,
                ...(background ? { background } : {})
            };
        })
            .filter((scene) => Boolean(scene))
        : [];
}
export function normalizeLayoutTree(value) {
    const source = parseJsonRecord(value);
    if (!source)
        return null;
    const declaredType = source.type === 'split' || source.type === 'leaf'
        ? source.type
        : undefined;
    const rawChildren = Array.isArray(source.children) ? source.children : [];
    const inferredSplit = declaredType === 'split' || rawChildren.length > 0 || typeof source.orientation === 'string';
    const common = {
        workarea: normalizeBoolean(source.workarea ?? source.isDynamicHost),
        nodeId: normalizeNodeId(source.nodeId ?? source.node_id),
        scenes: normalizeSceneSections(source.scenes),
        settings: normalizeLayoutContainerSettings(source.settings ?? source.container ?? source),
        styleSource: normalizeStyleSourceSettings(source.styleSource ?? source.style_source ?? source.styleLink ?? source.style_link)
    };
    const commonFields = {
        ...(common.workarea ? { workarea: true } : {}),
        ...(common.nodeId ? { nodeId: common.nodeId } : {}),
        ...(common.scenes.length ? { scenes: common.scenes } : {}),
        ...(Object.keys(common.settings).length ? { settings: common.settings } : {}),
        ...(hasStyleSourceSettings(common.styleSource) ? { styleSource: common.styleSource } : {})
    };
    if (inferredSplit) {
        const children = rawChildren
            .map(child => normalizeLayoutTree(child))
            .filter((child) => Boolean(child));
        const sizes = Array.isArray(source.sizes)
            ? source.sizes
                .map(size => Number(size))
                .filter(size => Number.isFinite(size) && size > 0)
            : [];
        return {
            type: 'split',
            orientation: source.orientation === 'horizontal' ? 'horizontal' : 'vertical',
            children,
            ...commonFields,
            ...(sizes.length ? { sizes } : {})
        };
    }
    if (declaredType !== 'leaf' && !common.workarea && !common.nodeId && !source.designRef && !source.design_ref && !common.scenes.length) {
        return null;
    }
    const designRef = normalizeNodeId(source.designRef ?? source.design_ref);
    return {
        type: 'leaf',
        ...commonFields,
        ...(designRef ? { designRef } : {})
    };
}
export function normalizeWidgetPlacements(value) {
    return Array.isArray(value)
        ? value.filter(isRecord).map(item => {
            const styleSource = normalizeStyleSourceSettings(item.styleSource ?? item.style_source ?? item.styleLink ?? item.style_link);
            const placement = { ...item };
            delete placement.styleSource;
            delete placement.style_source;
            delete placement.styleLink;
            delete placement.style_link;
            return {
                ...placement,
                ...(hasStyleSourceSettings(styleSource) ? { styleSource } : {})
            };
        })
        : [];
}
function pickLayoutSource(source) {
    return source.layoutTree
        ?? source.layout_tree
        ?? source.layout
        ?? source.layout_json
        ?? (isRecord(source.design) ? source.design.layout ?? source.design.layout_json : null);
}
export function extractDesignDocument(response) {
    const source = isRecord(response) ? response : {};
    const design = isRecord(source.design) ? source.design : {};
    const layoutTree = normalizeLayoutTree(pickLayoutSource(source));
    const sourceScenes = layoutTree?.scenes?.length
        ? layoutTree.scenes
        : normalizeSceneSections(source.scenes ?? design.scenes);
    return {
        version: DESIGN_DOCUMENT_VERSION,
        layoutTree,
        placements: normalizeWidgetPlacements(source.placements ?? source.widgets ?? design.widgets),
        scenes: sourceScenes,
        styles: isRecord(source.styles) ? { ...source.styles } : {},
        metadata: isRecord(source.metadata) ? { ...source.metadata } : {}
    };
}
export function createDesignDocument(input = {}) {
    return {
        version: DESIGN_DOCUMENT_VERSION,
        layoutTree: normalizeLayoutTree(input.layoutTree),
        placements: normalizeWidgetPlacements(input.placements),
        scenes: normalizeSceneSections(input.scenes),
        styles: isRecord(input.styles) ? { ...input.styles } : {},
        metadata: isRecord(input.metadata) ? { ...input.metadata } : {}
    };
}
