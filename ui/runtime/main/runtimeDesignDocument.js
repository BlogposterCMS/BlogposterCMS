import { extractDesignDocument, normalizeLayoutTree, renderLayoutTree } from '/ui/shared/layout/index.js';
import { fetchRuntimeDesign } from './runtimePageData.js';
import { renderStaticRuntimeGrid } from './runtimeStaticGrid.js';
import { getRuntimeDesignLayout } from './runtimeDesignLayouts.js';
function collectLeaves(node, leaves = []) {
    if (!node)
        return leaves;
    if (node.type === 'split') {
        node.children.forEach(child => collectLeaves(child, leaves));
        return leaves;
    }
    leaves.push(node);
    return leaves;
}
function primaryWorkareaId(tree) {
    const leaves = collectLeaves(tree);
    const workarea = leaves.find(leaf => leaf.workarea) || leaves[0] || null;
    return workarea?.nodeId || null;
}
function placementWorkareaId(item) {
    const meta = item.code?.meta && typeof item.code.meta === 'object'
        ? item.code.meta
        : {};
    return String(item.workareaId
        ?? item.workarea_id
        ?? meta.workareaId
        ?? meta.workarea_id
        ?? '').trim();
}
function placementsForWorkarea(placements, workareaId, fallbackWorkareaId) {
    return placements.filter(item => {
        const itemWorkareaId = placementWorkareaId(item);
        if (itemWorkareaId)
            return itemWorkareaId === workareaId;
        return workareaId === fallbackWorkareaId;
    });
}
async function renderDesignRefLeaf({ leaf, container, allWidgets, lane, options }) {
    if (leaf.type !== 'leaf' || !leaf.designRef || typeof options.emit !== 'function')
        return;
    try {
        const response = await fetchRuntimeDesign(options.emit, leaf.designRef, lane);
        const layout = getRuntimeDesignLayout(response);
        if (layout.length) {
            await renderStaticRuntimeGrid(container, layout, allWidgets, lane, {
                widgetEmit: options.widgetEmit
            });
        }
    }
    catch (err) {
        console.warn('[RuntimeDesignDocument] RUNTIME_DESIGN_REF_RENDER_FAILED', leaf.designRef, err);
    }
}
export function getRuntimeDesignDocument(response) {
    return extractDesignDocument(response);
}
export async function renderRuntimeDesignDocument(target, document, allWidgets, lane, options = {}) {
    const tree = normalizeLayoutTree(document.layoutTree);
    if (!target || !tree)
        return false;
    const shell = window.document.createElement('div');
    shell.className = 'runtime-design-document';
    const idMap = renderLayoutTree(tree, shell);
    target.appendChild(shell);
    const fallbackWorkareaId = primaryWorkareaId(tree);
    const leaves = collectLeaves(tree);
    const placements = document.placements;
    for (const leaf of leaves) {
        const leafId = leaf.nodeId || '';
        const container = leafId ? idMap.get(String(leafId)) : null;
        if (!container)
            continue;
        await renderDesignRefLeaf({ leaf, container, allWidgets, lane, options });
        const localPlacements = placementsForWorkarea(placements, leafId, fallbackWorkareaId);
        const combined = leafId === fallbackWorkareaId
            ? [...(options.globalLayout || []), ...localPlacements]
            : localPlacements;
        if (combined.length) {
            await renderStaticRuntimeGrid(container, combined, allWidgets, lane, {
                widgetEmit: options.widgetEmit
            });
        }
    }
    return true;
}
