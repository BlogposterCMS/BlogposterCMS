import { normalizeLayoutContainerSettings, normalizeLayoutTree } from './layoutDocument.js';
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
    if (settings.gap)
        el.style.gap = settings.gap;
    else
        el.style.removeProperty('gap');
    if (settings.padding)
        el.style.padding = settings.padding;
    else
        el.style.removeProperty('padding');
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
function styleSourceEnabled(el) {
    return readStyleSourceSettings(el).enabled !== false;
}
function copyContainerStyle(source, target) {
    writeContainerSettings(target, readContainerSettings(source));
}
function siblingStyleSourceFor(targetEl) {
    const parent = targetEl.parentElement;
    if (!parent)
        return null;
    const siblings = childLayoutContainers(parent);
    const explicit = siblings.find(child => (child !== targetEl &&
        child.dataset.styleSourceRole === 'source' &&
        styleSourceEnabled(child)));
    if (explicit)
        return explicit;
    return siblings.find(child => child !== targetEl && styleSourceEnabled(child)) || null;
}
function linkNewContainerToSiblingStyleSource(targetEl) {
    const source = siblingStyleSourceFor(targetEl);
    const sourceId = containerIdentity(source);
    if (!source || !sourceId)
        return;
    const sourceSettings = readStyleSourceSettings(source);
    writeStyleSourceSettings(source, {
        ...sourceSettings,
        enabled: sourceSettings.enabled ?? true,
        role: 'source',
        syncLayout: sourceSettings.syncLayout ?? true,
        syncDesign: sourceSettings.syncDesign ?? true
    });
    writeStyleSourceSettings(targetEl, {
        enabled: true,
        role: 'follower',
        sourceId,
        syncLayout: true,
        syncDesign: true
    });
    copyContainerStyle(source, targetEl);
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
export function toggleContainerStyleSource(layoutRoot, targetEl) {
    if (!targetEl)
        return;
    const current = readStyleSourceSettings(targetEl);
    if (current.enabled !== false && current.sourceId) {
        writeStyleSourceSettings(targetEl, { ...current, enabled: false });
        return;
    }
    const source = siblingStyleSourceFor(targetEl);
    const sourceId = containerIdentity(source);
    if (!source || !sourceId) {
        writeStyleSourceSettings(targetEl, {
            enabled: true,
            role: 'source',
            syncLayout: true,
            syncDesign: true
        });
        return;
    }
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
}
export function serializeLayout(container) {
    if (!container)
        return null;
    const isSplit = container.dataset.split === 'true';
    const workarea = container.dataset.workarea === 'true';
    const nodeId = container.dataset.nodeId;
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
    if (node.type === 'leaf' && node.designRef) {
        container.dataset.designRef = node.designRef;
    }
    else {
        delete container.dataset.designRef;
    }
    applyContainerStyleSources(container.closest('.layout-root') || container);
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
    if (nextMode === 'free' && el.dataset.split === 'true')
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
        if (targetEl.dataset.split === 'true') {
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
    linkNewContainerToSiblingStyleSource(newLeaf);
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
    if (!srcEl || !targetEl || srcEl === targetEl)
        return;
    const orientation = position === 'inside'
        ? (targetEl.dataset.orientation === 'vertical' ? 'vertical' : 'horizontal')
        : splitOrientationForPosition(position);
    const srcParent = srcEl.parentElement;
    if (position === 'inside') {
        if (targetEl.dataset.split === 'true') {
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
    linkNewContainerToSiblingStyleSource(srcEl);
    applyContainerStyleSources(targetEl.closest('.layout-root') || targetEl);
    notifyAfterChange(onAfterChange, { layoutRoot: targetEl.closest('.layout-root') });
}
