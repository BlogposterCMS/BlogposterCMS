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
function collectPlacementHosts(node, hosts = [], isRoot = true) {
    if (!node)
        return hosts;
    // The page root only orders Sections. Every Section and nested Container is
    // a real placement host, including Containers that own further Containers.
    if (node.section || node.type === 'leaf' || !isRoot)
        hosts.push(node);
    if (node.type === 'split') {
        node.children.forEach(child => collectPlacementHosts(child, hosts, false));
    }
    return hosts;
}
function structuralItemsForHost(host, idMap) {
    if (host.type !== 'split')
        return [];
    return host.children.flatMap(child => {
        const childId = String(child.nodeId || '').trim();
        const element = childId ? idMap.get(childId) : null;
        if (!element)
            return [];
        const placement = child.placement || {};
        return [{
                element,
                item: {
                    id: `layout-container:${childId}`,
                    x: placement.x ?? 0,
                    y: placement.y ?? 0,
                    w: placement.w ?? 480,
                    h: placement.h ?? 240,
                    ...(placement.xPercent !== undefined ? { xPercent: placement.xPercent } : {}),
                    ...(placement.yPercent !== undefined ? { yPercent: placement.yPercent } : {}),
                    ...(placement.wPercent !== undefined ? { wPercent: placement.wPercent } : {}),
                    ...(placement.hPercent !== undefined ? { hPercent: placement.hPercent } : {}),
                    ...(placement.responsivePlacement
                        ? { responsivePlacement: placement.responsivePlacement }
                        : {})
                }
            }];
    });
}
function primaryWorkareaId(tree) {
    const hosts = collectPlacementHosts(tree);
    const workarea = hosts.find(host => host.workarea) || hosts.find(host => host.section) || hosts[0] || null;
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
    const placementHosts = collectPlacementHosts(tree);
    const placements = document.placements;
    for (const leaf of leaves) {
        const leafId = leaf.nodeId || '';
        const container = leafId ? idMap.get(String(leafId)) : null;
        if (!container)
            continue;
        await renderDesignRefLeaf({ leaf, container, allWidgets, lane, options });
    }
    for (const host of placementHosts) {
        const hostId = host.nodeId || '';
        const container = hostId ? idMap.get(String(hostId)) : null;
        if (!container)
            continue;
        const localPlacements = placementsForWorkarea(placements, hostId, fallbackWorkareaId);
        const structuralItems = structuralItemsForHost(host, idMap);
        const combined = hostId === fallbackWorkareaId
            ? [...(options.globalLayout || []), ...localPlacements]
            : localPlacements;
        await renderStaticRuntimeGrid(container, combined, allWidgets, lane, {
            widgetEmit: options.widgetEmit,
            useTargetAsGrid: true,
            structuralItems
        });
    }
    return true;
}
