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
        scenes: normalizeSceneSections(source.scenes)
    };
    const commonFields = {
        ...(common.workarea ? { workarea: true } : {}),
        ...(common.nodeId ? { nodeId: common.nodeId } : {}),
        ...(common.scenes.length ? { scenes: common.scenes } : {})
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
        ? value.filter(isRecord).map(item => ({ ...item }))
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
