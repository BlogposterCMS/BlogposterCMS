import { normalizeLayoutContainerSettings, normalizeLayoutNodePlacement, normalizeLayoutTree } from './layoutDocument.js';
import { hasStyleSourceSettings, normalizeStyleSourceSettings } from './styleSource.js';
const DEFAULT_LABELS = {
    splitHint: 'Click to add container',
    workareaLabel: 'Design area'
};
function notifyAfterChange(onAfterChange, payload) {
    try {
        onAfterChange?.(payload);
    }
    catch (err) {
        // Layout callbacks are host-owned; adapter mutations must stay isolated.
        console.warn('[LayoutDom] LAYOUT_CONTAINER_AFTER_CHANGE_FAILED', {
            nodeId: payload.layoutRoot?.dataset?.nodeId || null
        }, err);
    }
}
function labelsFor(options = {}) {
    return {
        splitHint: options.labels?.splitHint || DEFAULT_LABELS.splitHint,
        workareaLabel: options.labels?.workareaLabel || DEFAULT_LABELS.workareaLabel
    };
}
function nextNodeId(options = {}) {
    return typeof options.generateNodeId === 'function'
        ? options.generateNodeId()
        : `layout-${Math.random().toString(36).slice(2, 10)}`;
}
function childLayoutContainers(container) {
    return Array.from(container.children)
        .filter((child) => child instanceof HTMLElement && child.classList.contains('layout-container'));
}
function flexDirectionFor(orientation) {
    return orientation === 'horizontal' ? 'column' : 'row';
}
function modeForOrientation(orientation) {
    return orientation === 'horizontal' ? 'stack' : 'row';
}
function orientationForMode(mode) {
    return mode === 'row' ? 'vertical' : 'horizontal';
}
function splitOrientationForPosition(position, targetEl) {
    if (position === 'left' || position === 'right')
        return 'vertical';
    if (position === 'inside' || position === 'auto') {
        return orientationForMode(readContainerSettings(targetEl).mode);
    }
    return 'horizontal';
}
function readContainerSettings(el) {
    if (!el)
        return {};
    return normalizeLayoutContainerSettings({
        mode: el.dataset.layoutMode || (el.dataset.split === 'true'
            ? modeForOrientation(el.dataset.orientation === 'horizontal' ? 'horizontal' : 'vertical')
            : 'free'),
        gap: el.dataset.layoutGap,
        padding: el.dataset.layoutPadding,
        columns: el.dataset.layoutColumns,
        align: el.dataset.layoutAlign,
        background: el.dataset.layoutBackground,
        maxWidth: el.dataset.layoutMaxWidth,
        minHeight: el.dataset.layoutMinHeight,
        overflow: el.dataset.layoutOverflow
    });
}
function writeContainerSettings(el, settings) {
    const normalized = normalizeLayoutContainerSettings(settings);
    const currentMode = normalized.mode || readContainerSettings(el).mode || (el.dataset.split === 'true'
        ? modeForOrientation(el.dataset.orientation === 'horizontal' ? 'horizontal' : 'vertical')
        : 'free');
    el.dataset.layoutMode = currentMode;
    if (normalized.gap)
        el.dataset.layoutGap = normalized.gap;
    else
        delete el.dataset.layoutGap;
    if (normalized.padding)
        el.dataset.layoutPadding = normalized.padding;
    else
        delete el.dataset.layoutPadding;
    if (normalized.columns)
        el.dataset.layoutColumns = String(normalized.columns);
    else
        delete el.dataset.layoutColumns;
    if (normalized.align)
        el.dataset.layoutAlign = normalized.align;
    else
        delete el.dataset.layoutAlign;
    if (normalized.background)
        el.dataset.layoutBackground = normalized.background;
    else
        delete el.dataset.layoutBackground;
    if (normalized.maxWidth)
        el.dataset.layoutMaxWidth = normalized.maxWidth;
    else
        delete el.dataset.layoutMaxWidth;
    if (normalized.minHeight)
        el.dataset.layoutMinHeight = normalized.minHeight;
    else
        delete el.dataset.layoutMinHeight;
    if (normalized.overflow)
        el.dataset.layoutOverflow = normalized.overflow;
    else
        delete el.dataset.layoutOverflow;
    applyContainerSettingsToElement(el);
}
function readStyleSourceSettings(el) {
    if (!el)
        return {};
    return normalizeStyleSourceSettings({
        enabled: el.dataset.styleSourceEnabled,
        role: el.dataset.styleSourceRole,
        sourceId: el.dataset.styleSourceId,
        syncLayout: el.dataset.styleSyncLayout,
        syncDesign: el.dataset.styleSyncDesign
    });
}
function writeStyleSourceSettings(el, settings = {}) {
    const normalized = normalizeStyleSourceSettings(settings);
    if (normalized.enabled !== undefined)
        el.dataset.styleSourceEnabled = String(normalized.enabled);
    else
        delete el.dataset.styleSourceEnabled;
    if (normalized.role)
        el.dataset.styleSourceRole = normalized.role;
    else
        delete el.dataset.styleSourceRole;
    if (normalized.sourceId)
        el.dataset.styleSourceId = normalized.sourceId;
    else
        delete el.dataset.styleSourceId;
    if (normalized.syncLayout !== undefined)
        el.dataset.styleSyncLayout = String(normalized.syncLayout);
    else
        delete el.dataset.styleSyncLayout;
    if (normalized.syncDesign !== undefined)
        el.dataset.styleSyncDesign = String(normalized.syncDesign);
    else
        delete el.dataset.styleSyncDesign;
}
function serializableStyleSource(el) {
    const settings = readStyleSourceSettings(el);
    return hasStyleSourceSettings(settings) ? settings : {};
}
function applyContainerSettingsToElement(el) {
    const settings = readContainerSettings(el);
    if (settings.mode)
        el.dataset.layoutMode = settings.mode;
    if (el.dataset.split === 'true') {
        // A split node is the persisted recursive Container shape. Its authored
        // placement mode, rather than the legacy split orientation, owns how its
        // direct Container and widget children flow.
        if (settings.mode === 'grid') {
            el.style.display = 'grid';
            el.style.removeProperty('flex-direction');
        }
        else if (settings.mode === 'free') {
            el.style.display = 'block';
            el.style.removeProperty('flex-direction');
        }
        else {
            el.style.display = 'flex';
            el.style.flexDirection = settings.mode === 'row' ? 'row' : 'column';
        }
    }
    if (settings.gap)
        el.style.gap = settings.gap;
    else
        el.style.removeProperty('gap');
    if (settings.padding)
        el.style.padding = settings.padding;
    else
        el.style.removeProperty('padding');
    if (settings.columns)
        el.style.setProperty('--layout-columns', String(settings.columns));
    else
        el.style.removeProperty('--layout-columns');
    if (settings.align)
        el.style.setProperty('--layout-align', settings.align);
    else
        el.style.removeProperty('--layout-align');
    if (settings.background)
        el.style.background = settings.background;
    else
        el.style.removeProperty('background');
    if (settings.maxWidth)
        el.style.maxWidth = settings.maxWidth;
    else
        el.style.removeProperty('max-width');
    if (settings.minHeight)
        el.style.minHeight = settings.minHeight;
    else
        el.style.removeProperty('min-height');
    if (settings.overflow)
        el.style.overflow = settings.overflow;
    else
        el.style.removeProperty('overflow');
}
function serializableSettings(el) {
    const settings = readContainerSettings(el);
    const impliedMode = el.dataset.split === 'true'
        ? modeForOrientation(el.dataset.orientation === 'horizontal' ? 'horizontal' : 'vertical')
        : 'free';
    if (settings.mode === impliedMode && Object.keys(settings).length === 1) {
        delete settings.mode;
    }
    return Object.keys(settings).length ? settings : {};
}
function readSection(el) {
    const id = String(el?.dataset?.sectionId || '').trim();
    if (!id)
        return undefined;
    const title = String(el?.dataset?.sectionTitle || id).trim() || id;
    const background = String(el?.dataset?.sectionBackground || '').trim();
    const backgroundImageUrl = String(el?.dataset?.bgImageUrl || '').trim();
    const backgroundImageId = String(el?.dataset?.bgImageId || '').trim();
    return {
        id,
        title,
        ...(background ? { background } : {}),
        ...(backgroundImageUrl ? { backgroundImageUrl } : {}),
        ...(backgroundImageId ? { backgroundImageId } : {})
    };
}
function readNodePlacement(el) {
    let responsivePlacement;
    try {
        const parsed = JSON.parse(el.dataset.responsivePlacement || 'null');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            responsivePlacement = parsed;
        }
    }
    catch {
        responsivePlacement = undefined;
    }
    return normalizeLayoutNodePlacement({
        x: el.dataset.x,
        y: el.dataset.y,
        w: el.getAttribute('gs-w'),
        h: el.getAttribute('gs-h'),
        xPercent: el.dataset.xPercent,
        yPercent: el.dataset.yPercent,
        wPercent: el.dataset.wPercent,
        hPercent: el.dataset.hPercent,
        responsivePlacement
    });
}
function writeNodePlacement(el, placement) {
    if (!placement)
        return;
    if (placement.x !== undefined)
        el.dataset.x = String(placement.x);
    if (placement.y !== undefined)
        el.dataset.y = String(placement.y);
    if (placement.w !== undefined)
        el.setAttribute('gs-w', String(placement.w));
    if (placement.h !== undefined)
        el.setAttribute('gs-h', String(placement.h));
    if (placement.xPercent !== undefined)
        el.dataset.xPercent = String(placement.xPercent);
    if (placement.yPercent !== undefined)
        el.dataset.yPercent = String(placement.yPercent);
    if (placement.wPercent !== undefined)
        el.dataset.wPercent = String(placement.wPercent);
    if (placement.hPercent !== undefined)
        el.dataset.hPercent = String(placement.hPercent);
    if (placement.responsivePlacement) {
        el.dataset.responsivePlacement = JSON.stringify(placement.responsivePlacement);
    }
}
function resetPlacementForNewParent(el) {
    // A tree drop has no canvas pointer coordinate. Start the Container at its
    // new parent's origin and let that parent's CanvasGrid author a fresh
    // responsive contract instead of reusing percentages from the old surface.
    el.dataset.x = '0';
    el.dataset.y = '0';
    delete el.dataset.xPercent;
    delete el.dataset.yPercent;
    delete el.dataset.wPercent;
    delete el.dataset.hPercent;
    delete el.dataset.responsivePlacement;
}
function writeSection(el, section) {
    if (!section?.id) {
        el.classList.remove('layout-section');
        delete el.dataset.sectionId;
        delete el.dataset.sectionTitle;
        delete el.dataset.sectionBackground;
        delete el.dataset.bgImageUrl;
        delete el.dataset.bgImageId;
        el.style.removeProperty('background-image');
        return;
    }
    el.classList.add('layout-section');
    el.dataset.sectionId = section.id;
    el.dataset.sectionTitle = section.title || section.id;
    el.dataset.nodeId = section.id;
    if (section.background)
        el.dataset.sectionBackground = section.background;
    else
        delete el.dataset.sectionBackground;
    if (section.backgroundImageUrl) {
        const safeUrl = section.backgroundImageUrl.replace(/["\\]/g, '\\$&');
        el.dataset.bgImageUrl = section.backgroundImageUrl;
        el.style.backgroundImage = `url("${safeUrl}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
    }
    else {
        delete el.dataset.bgImageUrl;
        delete el.dataset.bgImageId;
        el.style.removeProperty('background-image');
    }
    if (section.backgroundImageId)
        el.dataset.bgImageId = section.backgroundImageId;
    else
        delete el.dataset.bgImageId;
}
function createSectionLeaf(section, options = {}) {
    const leaf = createLeaf(options);
    writeSection(leaf, section);
    setContainerSettings(leaf, {
        mode: 'free',
        minHeight: '320px',
        background: section.background || 'transparent'
    });
    return leaf;
}
function assignLeafState(targetEl, existing) {
    if (targetEl.dataset.workarea === 'true') {
        existing.dataset.workarea = 'true';
        existing.dataset.workareaLabel = targetEl.dataset.workareaLabel || DEFAULT_LABELS.workareaLabel;
        targetEl.removeAttribute('data-workarea');
        targetEl.removeAttribute('data-workarea-label');
    }
    if (targetEl.dataset.designRef) {
        existing.dataset.designRef = targetEl.dataset.designRef;
        delete targetEl.dataset.designRef;
    }
}
function moveContentIntoLeaf(targetEl, existing) {
    const children = Array.from(targetEl.childNodes);
    for (const child of children) {
        if (child instanceof HTMLElement && child.classList.contains('container-actionbar'))
            continue;
        existing.appendChild(child);
    }
}
function containerIdentity(el) {
    return String(el?.dataset?.nodeId || '').trim();
}
function copyContainerStyle(source, target) {
    writeContainerSettings(target, readContainerSettings(source));
    // A linked copy shares its size contract but keeps its position in the
    // parent grid independent, so repeated designs can live in different slots.
    ['gs-w', 'gs-h', 'gs-min-w', 'gs-min-h'].forEach(attribute => {
        const value = source.getAttribute(attribute);
        if (value)
            target.setAttribute(attribute, value);
        else
            target.removeAttribute(attribute);
    });
}
function findContainerById(root, sourceId) {
    const containers = [
        ...(root.classList.contains('layout-container') ? [root] : []),
        ...Array.from(root.querySelectorAll('.layout-container'))
    ];
    return containers.find(el => containerIdentity(el) === sourceId) || null;
}
export function applyContainerStyleSources(root) {
    if (!root)
        return;
    const layoutRoot = root.closest('.layout-root') || root;
    const containers = [
        ...(layoutRoot.classList.contains('layout-container') ? [layoutRoot] : []),
        ...Array.from(layoutRoot.querySelectorAll('.layout-container'))
    ];
    containers.forEach(target => {
        const styleSource = readStyleSourceSettings(target);
        if (styleSource.enabled === false || !styleSource.sourceId)
            return;
        const source = findContainerById(layoutRoot, styleSource.sourceId);
        if (!source || source === target)
            return;
        if (styleSource.syncLayout !== false || styleSource.syncDesign !== false) {
            copyContainerStyle(source, target);
        }
    });
}
export function linkContainerStyleSource(layoutRoot, source, targetEl) {
    const sourceId = containerIdentity(source);
    if (!source || !targetEl || source === targetEl || !sourceId)
        return false;
    writeStyleSourceSettings(source, {
        ...readStyleSourceSettings(source),
        enabled: true,
        role: 'source',
        syncLayout: true,
        syncDesign: true
    });
    writeStyleSourceSettings(targetEl, {
        enabled: true,
        role: 'follower',
        sourceId,
        syncLayout: true,
        syncDesign: true
    });
    copyContainerStyle(source, targetEl);
    applyContainerStyleSources(layoutRoot || targetEl);
    return true;
}
export function unlinkContainerStyleSource(targetEl) {
    if (!targetEl)
        return;
    // Unlink means fully independent. Keeping a disabled source id made the old
    // UI look detached while retaining a hidden relationship in saved data.
    writeStyleSourceSettings(targetEl, {});
}
/**
 * Legacy compatibility for callers that only know the old toggle action.
 * It can now only unlink an existing follower or mark an explicit source; it
 * never guesses a sibling and therefore cannot create a surprise relation.
 */
export function toggleContainerStyleSource(layoutRoot, targetEl) {
    if (!targetEl)
        return;
    const current = readStyleSourceSettings(targetEl);
    if (current.sourceId) {
        unlinkContainerStyleSource(targetEl);
        return;
    }
    writeStyleSourceSettings(targetEl, {
        enabled: true,
        role: 'source',
        syncLayout: true,
        syncDesign: true
    });
    applyContainerStyleSources(layoutRoot || targetEl);
}
export function serializeLayout(container) {
    if (!container)
        return null;
    const isSplit = container.dataset.split === 'true';
    const workarea = container.dataset.workarea === 'true';
    const nodeId = container.dataset.nodeId;
    const section = readSection(container);
    const placement = container.classList.contains('layout-grid-container')
        ? readNodePlacement(container)
        : undefined;
    if (isSplit) {
        const orientation = container.dataset.orientation === 'horizontal' ? 'horizontal' : 'vertical';
        const children = childLayoutContainers(container)
            .map(child => serializeLayout(child))
            .filter((child) => Boolean(child));
        const sizes = childLayoutContainers(container)
            .map(child => {
            const flex = parseFloat(child.style.flex);
            return Number.isFinite(flex) ? flex : 1;
        });
        const obj = {
            type: 'split',
            orientation,
            children,
            ...(workarea ? { workarea: true } : {}),
            ...(nodeId ? { nodeId } : {}),
            ...(section ? { section } : {}),
            ...(placement ? { placement } : {}),
            ...(Object.keys(serializableSettings(container)).length ? { settings: serializableSettings(container) } : {}),
            ...(hasStyleSourceSettings(serializableStyleSource(container)) ? { styleSource: serializableStyleSource(container) } : {})
        };
        if (sizes.some(size => size !== 1)) {
            obj.sizes = sizes;
        }
        return obj;
    }
    const leaf = {
        type: 'leaf',
        ...(workarea ? { workarea: true } : {}),
        ...(nodeId ? { nodeId } : {}),
        ...(section ? { section } : {}),
        ...(placement ? { placement } : {}),
        ...(Object.keys(serializableSettings(container)).length ? { settings: serializableSettings(container) } : {}),
        ...(hasStyleSourceSettings(serializableStyleSource(container)) ? { styleSource: serializableStyleSource(container) } : {})
    };
    const designRef = container.dataset.designRef;
    if (designRef)
        leaf.designRef = designRef;
    return leaf;
}
export function deserializeLayout(obj, container, options = {}) {
    if (!container)
        return;
    const node = normalizeLayoutTree(obj);
    if (!node)
        return;
    const labels = labelsFor(options);
    container.replaceChildren();
    if (node.type === 'split') {
        const orientation = node.orientation === 'horizontal' ? 'horizontal' : 'vertical';
        container.dataset.split = 'true';
        container.dataset.orientation = orientation;
        container.style.display = 'flex';
        container.style.flexDirection = flexDirectionFor(orientation);
        writeContainerSettings(container, {
            mode: node.settings?.mode || modeForOrientation(orientation),
            ...node.settings
        });
        writeStyleSourceSettings(container, node.styleSource || {});
        const sizes = Array.isArray(node.sizes) ? node.sizes : [];
        node.children.forEach((child, index) => {
            const div = document.createElement('div');
            const size = sizes[index];
            div.style.flex = Number.isFinite(size) ? `${size} 1 0` : '1 1 0';
            container.appendChild(div);
            deserializeLayout(child, div, options);
        });
        container.classList.add('layout-container');
    }
    else {
        container.className = 'layout-container builder-grid canvas-grid';
        container.style.flex = container.style.flex || '1 1 0';
        delete container.dataset.split;
        delete container.dataset.orientation;
        writeContainerSettings(container, {
            mode: node.settings?.mode || 'free',
            ...node.settings
        });
        writeStyleSourceSettings(container, node.styleSource || {});
    }
    container.dataset.emptyHint = labels.splitHint;
    if (node.workarea) {
        container.dataset.workarea = 'true';
        container.dataset.workareaLabel = labels.workareaLabel;
    }
    else {
        delete container.dataset.workarea;
        delete container.dataset.workareaLabel;
    }
    container.dataset.nodeId = node.nodeId || nextNodeId(options);
    writeNodePlacement(container, node.placement);
    writeSection(container, node.section);
    if (node.type === 'leaf' && node.designRef) {
        container.dataset.designRef = node.designRef;
    }
    else {
        delete container.dataset.designRef;
    }
    applyContainerStyleSources(container.closest('.layout-root') || container);
}
function cloneLayoutNodeWithFreshIds(node, options, isRoot = false) {
    const placement = node.placement
        ? { ...node.placement }
        : undefined;
    if (isRoot && placement) {
        // Keep a duplicate visible when its parent uses Free Placement without
        // coupling its eventual position to the source.
        if (placement.x !== undefined)
            placement.x += 16;
        if (placement.y !== undefined)
            placement.y += 16;
        if (placement.xPercent !== undefined)
            placement.xPercent = Math.min(100, placement.xPercent + 1.5);
        if (placement.yPercent !== undefined)
            placement.yPercent = Math.min(100, placement.yPercent + 1.5);
    }
    const common = {
        nodeId: nextNodeId(options),
        ...(node.settings ? { settings: { ...node.settings } } : {}),
        ...(placement ? { placement } : {})
    };
    if (node.type === 'split') {
        return {
            type: 'split',
            orientation: node.orientation,
            children: node.children.map(child => cloneLayoutNodeWithFreshIds(child, options)),
            ...common,
            ...(node.sizes ? { sizes: [...node.sizes] } : {})
        };
    }
    return {
        type: 'leaf',
        ...common,
        ...(node.designRef ? { designRef: node.designRef } : {})
    };
}
function containerSubtree(root) {
    return [
        root,
        ...Array.from(root.querySelectorAll('.layout-container'))
    ];
}
export function duplicateContainer(source, { linked = false, layoutRoot = null, onAfterChange, ...options } = {}) {
    if (!source?.parentElement)
        return null;
    const sourceTree = serializeLayout(source);
    if (!sourceTree)
        return null;
    const cloneTree = cloneLayoutNodeWithFreshIds(sourceTree, options, true);
    const clone = document.createElement('div');
    deserializeLayout(cloneTree, clone, options);
    source.parentElement.insertBefore(clone, source.nextSibling);
    if (linked) {
        const sources = containerSubtree(source);
        const targets = containerSubtree(clone);
        sources.forEach((sourceNode, index) => {
            linkContainerStyleSource(layoutRoot, sourceNode, targets[index] || null);
        });
    }
    const root = layoutRoot || source.closest('.layout-root') || source.parentElement;
    applyContainerStyleSources(root);
    notifyAfterChange(onAfterChange, { layoutRoot: root });
    return clone;
}
export function renderLayoutTree(tree, mountEl) {
    const node = normalizeLayoutTree(tree);
    const map = new Map();
    if (!mountEl || !node)
        return map;
    mountEl.replaceChildren();
    const walk = (current, parent) => {
        const el = document.createElement('div');
        el.className = 'layout-container runtime-layout-container';
        el.style.flex = '1 1 0';
        if (current.nodeId != null) {
            el.dataset.nodeId = String(current.nodeId);
            map.set(String(current.nodeId), el);
        }
        if (current.workarea) {
            el.dataset.workarea = 'true';
        }
        if (current.type === 'split') {
            el.dataset.split = 'true';
            const orientation = current.orientation === 'horizontal' ? 'horizontal' : 'vertical';
            el.dataset.orientation = orientation;
            el.style.display = 'flex';
            el.style.flexDirection = flexDirectionFor(orientation);
            writeContainerSettings(el, {
                mode: current.settings?.mode || modeForOrientation(orientation),
                ...current.settings
            });
            writeStyleSourceSettings(el, current.styleSource || {});
            const sizes = Array.isArray(current.sizes) ? current.sizes : [];
            current.children.forEach((child, index) => {
                const childEl = walk(child, el);
                const size = sizes[index];
                if (Number.isFinite(size)) {
                    childEl.style.flex = `${size} 1 0`;
                }
            });
        }
        else if (current.designRef) {
            el.dataset.designRef = current.designRef;
            writeContainerSettings(el, {
                mode: current.settings?.mode || 'free',
                ...current.settings
            });
        }
        else {
            writeContainerSettings(el, {
                mode: current.settings?.mode || 'free',
                ...current.settings
            });
        }
        writeSection(el, current.section);
        writeNodePlacement(el, current.placement);
        writeStyleSourceSettings(el, current.styleSource || {});
        parent.appendChild(el);
        return el;
    };
    walk(node, mountEl);
    applyContainerStyleSources(mountEl);
    return map;
}
export function createLeaf(options = {}) {
    const labels = labelsFor(options);
    const div = document.createElement('div');
    div.className = 'layout-container builder-grid canvas-grid';
    div.style.flex = '1 1 0';
    div.dataset.emptyHint = labels.splitHint;
    div.dataset.nodeId = nextNodeId(options);
    writeContainerSettings(div, { mode: 'free' });
    return div;
}
export function ensureLayoutRootContainer(layoutRoot, options = {}) {
    if (!layoutRoot)
        return null;
    const labels = labelsFor(options);
    layoutRoot.classList.add('layout-root');
    let rootContainer = layoutRoot;
    if (!layoutRoot.classList.contains('layout-container')) {
        rootContainer = layoutRoot.querySelector(':scope > .layout-container');
    }
    if (!rootContainer) {
        layoutRoot.classList.add('layout-container', 'builder-grid', 'canvas-grid');
        layoutRoot.dataset.emptyHint = labels.splitHint;
        layoutRoot.dataset.nodeId = layoutRoot.dataset.nodeId || nextNodeId(options);
        writeContainerSettings(layoutRoot, readContainerSettings(layoutRoot));
        rootContainer = layoutRoot;
    }
    else {
        rootContainer.dataset.nodeId = rootContainer.dataset.nodeId || nextNodeId(options);
        rootContainer.dataset.emptyHint = rootContainer.dataset.emptyHint || labels.splitHint;
        writeContainerSettings(rootContainer, readContainerSettings(rootContainer));
    }
    return rootContainer;
}
/**
 * Migrates the legacy single workarea into a page root whose direct children
 * are canonical Sections. The page root remains a fixed vertical stack; only
 * its Section children may change placement mode.
 */
export function ensurePageSectionRoot(layoutRoot, sections = [], options = {}) {
    const root = ensureLayoutRootContainer(layoutRoot, options);
    if (!root)
        return null;
    const normalizedSections = sections.filter(section => section?.id);
    const existingSections = childLayoutContainers(root).filter(child => Boolean(readSection(child)));
    const alreadyCanonical = root.classList.contains('layout-page-root') || existingSections.length > 0;
    if (!alreadyCanonical) {
        const firstSection = normalizedSections[0] || { id: 'section-1', title: 'Section 1' };
        const leaf = createSectionLeaf(firstSection, options);
        assignLeafState(root, leaf);
        moveContentIntoLeaf(root, leaf);
        copyContainerStyle(root, leaf);
        setContainerSettings(leaf, {
            ...readContainerSettings(leaf),
            minHeight: readContainerSettings(leaf).minHeight || '320px',
            background: firstSection.background || readContainerSettings(leaf).background || 'transparent'
        });
        root.replaceChildren(leaf);
    }
    root.classList.add('layout-page-root', 'layout-root', 'layout-container');
    root.classList.remove('builder-grid', 'canvas-grid', 'layout-section');
    root.dataset.nodeId = root.dataset.nodeId === normalizedSections[0]?.id
        ? 'page-root'
        : (root.dataset.nodeId || 'page-root');
    root.dataset.split = 'true';
    root.dataset.orientation = 'horizontal';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    delete root.dataset.workarea;
    delete root.dataset.workareaLabel;
    delete root.dataset.sectionId;
    delete root.dataset.sectionTitle;
    delete root.dataset.sectionBackground;
    writeContainerSettings(root, {
        ...readContainerSettings(root),
        mode: 'stack',
        gap: '0px',
        padding: '0px',
        overflow: 'visible'
    });
    const byId = new Map(childLayoutContainers(root)
        .map(child => [readSection(child)?.id, child])
        .filter((entry) => Boolean(entry[0])));
    normalizedSections.forEach(section => {
        const sectionEl = byId.get(section.id) || createSectionLeaf(section, options);
        writeSection(sectionEl, section);
        root.appendChild(sectionEl);
    });
    return root;
}
export function getPageSectionElement(layoutRoot, sectionId) {
    if (!layoutRoot || !sectionId)
        return null;
    return childLayoutContainers(layoutRoot)
        .find(child => child.dataset.sectionId === sectionId) || null;
}
export function syncPageSection(layoutRoot, section, options = {}) {
    const currentRoot = ensureLayoutRootContainer(layoutRoot, options);
    const root = currentRoot?.classList.contains('layout-page-root')
        ? currentRoot
        : ensurePageSectionRoot(layoutRoot, [section], options);
    if (!root)
        return null;
    const existing = getPageSectionElement(root, section.id);
    if (existing) {
        writeSection(existing, section);
        return existing;
    }
    const sectionEl = createSectionLeaf(section, options);
    root.appendChild(sectionEl);
    return sectionEl;
}
export function movePageSection(layoutRoot, sectionId, targetIndex) {
    const section = getPageSectionElement(layoutRoot, sectionId);
    if (!layoutRoot || !section)
        return false;
    const sections = childLayoutContainers(layoutRoot).filter(child => Boolean(readSection(child)));
    const boundedIndex = Math.max(0, Math.min(sections.length - 1, targetIndex));
    const reference = sections.filter(child => child !== section)[boundedIndex] || null;
    if (reference)
        layoutRoot.insertBefore(section, reference);
    else
        layoutRoot.appendChild(section);
    return true;
}
export function removePageSection(layoutRoot, sectionId) {
    const section = getPageSectionElement(layoutRoot, sectionId);
    if (!section)
        return false;
    section.remove();
    return true;
}
export function activatePageSection(layoutRoot, sectionId) {
    if (!layoutRoot)
        return null;
    const sections = childLayoutContainers(layoutRoot).filter(child => Boolean(readSection(child)));
    let active = null;
    sections.forEach(section => {
        const selected = section.dataset.sectionId === sectionId;
        section.classList.toggle('layout-section--active', selected);
        if (selected) {
            section.dataset.workarea = 'true';
            section.dataset.workareaLabel = section.dataset.sectionTitle || sectionId;
            active = section;
        }
        else {
            delete section.dataset.workarea;
            delete section.dataset.workareaLabel;
        }
    });
    return active;
}
export function setDefaultWorkarea(root, options = {}) {
    if (!root)
        return;
    if (root.querySelector('.layout-container[data-workarea="true"]'))
        return;
    const labels = labelsFor(options);
    const all = [
        ...(root.classList.contains('layout-container') ? [root] : []),
        ...Array.from(root.querySelectorAll('.layout-container'))
    ];
    const candidates = all.filter(el => el.dataset.split !== 'true');
    const containers = candidates.length ? candidates : all.slice(0, 1);
    let largest = null;
    let maxArea = 0;
    for (const el of containers) {
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > maxArea) {
            maxArea = area;
            largest = el;
        }
    }
    if (!largest && containers.length) {
        largest = containers[0] || null;
    }
    if (largest) {
        largest.dataset.workarea = 'true';
        largest.dataset.workareaLabel = labels.workareaLabel;
    }
}
export function setContainerLayoutMode(el, mode) {
    if (!el)
        return;
    const nextMode = normalizeLayoutContainerSettings({ mode }).mode;
    if (!nextMode)
        return;
    // A canonical Section may host nested containers and still remain the
    // widget placement surface. Ordinary split containers cannot use free mode.
    if (nextMode === 'free' &&
        el.dataset.split === 'true' &&
        !el.dataset.sectionId &&
        !el.classList.contains('layout-grid-surface'))
        return;
    if (el.dataset.split === 'true') {
        const orientation = orientationForMode(nextMode);
        el.dataset.orientation = orientation;
        el.style.flexDirection = flexDirectionFor(orientation);
    }
    writeContainerSettings(el, {
        ...readContainerSettings(el),
        mode: nextMode
    });
    applyContainerStyleSources(el.closest('.layout-root') || el);
}
export function setContainerSettings(el, settings = {}) {
    if (!el)
        return;
    writeContainerSettings(el, {
        ...readContainerSettings(el),
        ...settings
    });
    applyContainerStyleSources(el.closest('.layout-root') || el);
}
export function setDynamicHost(layoutRoot, el, options = {}) {
    if (!layoutRoot)
        return;
    const labels = labelsFor(options);
    layoutRoot.querySelectorAll('.layout-container[data-workarea="true"]').forEach(node => {
        node.removeAttribute('data-workarea');
        node.removeAttribute('data-workarea-label');
    });
    if (el) {
        el.dataset.workarea = 'true';
        el.dataset.workareaLabel = labels.workareaLabel;
    }
}
export function setDesignRef(el, designId) {
    if (!el)
        return;
    if (designId)
        el.dataset.designRef = String(designId);
    else
        delete el.dataset.designRef;
}
export function placeContainer(targetEl, position, { layoutRoot, onAfterChange, ...options } = {}) {
    if (!targetEl)
        return;
    const normalizedPosition = position === 'auto' ? 'inside' : position;
    const orientation = splitOrientationForPosition(position, targetEl);
    const newLeaf = createLeaf(options);
    if (normalizedPosition === 'inside') {
        if (targetEl.dataset.sectionId || targetEl.classList.contains('layout-grid-surface')) {
            // Grid surfaces are stable structural and placement nodes. A nested
            // Container is both a child item and another grid surface, so no
            // wrapper leaf is necessary.
            targetEl.dataset.split = 'true';
            targetEl.dataset.orientation = orientation;
            writeContainerSettings(targetEl, readContainerSettings(targetEl));
            targetEl.appendChild(newLeaf);
        }
        else if (targetEl.dataset.split === 'true') {
            targetEl.appendChild(newLeaf);
        }
        else {
            targetEl.dataset.split = 'true';
            targetEl.dataset.orientation = orientation;
            writeContainerSettings(targetEl, {
                ...readContainerSettings(targetEl),
                mode: modeForOrientation(orientation)
            });
            targetEl.style.display = 'flex';
            targetEl.style.flexDirection = flexDirectionFor(orientation);
            const existing = createLeaf(options);
            assignLeafState(targetEl, existing);
            moveContentIntoLeaf(targetEl, existing);
            targetEl.append(existing, newLeaf);
        }
    }
    else {
        insertAdjacentContainer(targetEl, newLeaf, normalizedPosition, orientation, options);
    }
    applyContainerStyleSources(layoutRoot || targetEl.closest('.layout-root') || targetEl);
    notifyAfterChange(onAfterChange, { layoutRoot: layoutRoot || targetEl.closest('.layout-root') });
}
function insertAdjacentContainer(targetEl, movingEl, position, orientation, options) {
    const parent = targetEl.parentElement;
    if (parent && parent.dataset.split === 'true' && parent.dataset.orientation === orientation) {
        if (position === 'left' || position === 'top')
            parent.insertBefore(movingEl, targetEl);
        else
            parent.insertBefore(movingEl, targetEl.nextSibling);
        return;
    }
    const wrapper = document.createElement('div');
    const labels = labelsFor(options);
    wrapper.className = 'layout-container';
    wrapper.dataset.split = 'true';
    wrapper.dataset.orientation = orientation;
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = flexDirectionFor(orientation);
    wrapper.dataset.emptyHint = labels.splitHint;
    wrapper.dataset.nodeId = nextNodeId(options);
    writeContainerSettings(wrapper, { mode: modeForOrientation(orientation) });
    if (parent)
        parent.replaceChild(wrapper, targetEl);
    wrapper.appendChild(targetEl);
    targetEl.style.flex = '1 1 0';
    if (position === 'left' || position === 'top')
        wrapper.insertBefore(movingEl, targetEl);
    else
        wrapper.appendChild(movingEl);
}
function collapseSingleChildSplit(parent) {
    if (!parent || parent.dataset?.split !== 'true')
        return;
    // #layoutRoot is held by the Designer shell; replacing it would leave the
    // editor with a stale root reference after deleting a nested container.
    if (parent.classList.contains('layout-root'))
        return;
    if (parent.classList.contains('layout-grid-surface'))
        return;
    const children = Array.from(parent.children).filter((child) => child instanceof HTMLElement);
    if (children.length !== 1)
        return;
    const only = children[0];
    if (!only)
        return;
    if (parent.dataset.workarea === 'true') {
        only.dataset.workarea = 'true';
        only.dataset.workareaLabel = parent.dataset.workareaLabel || DEFAULT_LABELS.workareaLabel;
    }
    parent.replaceWith(only);
}
export function deleteContainer(targetEl, { onAfterChange } = {}) {
    if (!targetEl)
        return;
    const parent = targetEl.parentElement;
    targetEl.remove();
    collapseSingleChildSplit(parent);
    applyContainerStyleSources(parent?.closest?.('.layout-root') || parent || targetEl);
    notifyAfterChange(onAfterChange, { layoutRoot: parent?.closest?.('.layout-root') || parent });
}
export function moveContainer(srcEl, targetEl, position, { onAfterChange, ...options } = {}) {
    if (!srcEl || !targetEl || srcEl === targetEl || srcEl.contains(targetEl))
        return;
    const orientation = position === 'inside'
        ? (targetEl.dataset.orientation === 'vertical' ? 'vertical' : 'horizontal')
        : splitOrientationForPosition(position);
    const srcParent = srcEl.parentElement;
    if (position === 'inside') {
        if (targetEl.classList.contains('layout-grid-surface') || targetEl.dataset.sectionId) {
            targetEl.dataset.split = 'true';
            targetEl.dataset.orientation = orientation;
            writeContainerSettings(targetEl, readContainerSettings(targetEl));
            resetPlacementForNewParent(srcEl);
            targetEl.appendChild(srcEl);
        }
        else if (targetEl.dataset.split === 'true') {
            targetEl.appendChild(srcEl);
        }
        else {
            const frag = document.createDocumentFragment();
            while (targetEl.firstChild)
                frag.appendChild(targetEl.firstChild);
            targetEl.dataset.split = 'true';
            targetEl.dataset.orientation = orientation;
            targetEl.style.display = 'flex';
            targetEl.style.flexDirection = flexDirectionFor(orientation);
            const existing = createLeaf(options);
            existing.appendChild(frag);
            targetEl.append(existing, srcEl);
        }
    }
    else {
        insertAdjacentContainer(targetEl, srcEl, position, orientation, options);
    }
    collapseSingleChildSplit(srcParent);
    applyContainerStyleSources(targetEl.closest('.layout-root') || targetEl);
    notifyAfterChange(onAfterChange, { layoutRoot: targetEl.closest('.layout-root') });
}
