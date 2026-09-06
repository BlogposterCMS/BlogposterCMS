import {
  extractDesignDocument,
  normalizeLayoutTree,
  renderLayoutTree,
  type DesignDocument,
  type LayoutNode
} from '/ui/shared/layout/index.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetRenderer.js';
import { fetchRuntimeDesign, type RuntimeEmitter as RuntimeDataEmitter } from './runtimePageData.js';
import { renderStaticRuntimeGrid } from './runtimeStaticGrid.js';
import {
  getRuntimeDesignLayout,
  applyRuntimeDesignStyles,
  type RuntimeDesignLayoutItem
} from './runtimeDesignLayouts.js';
import type { RuntimeEmitter as RuntimeWidgetEmitter } from './runtimeWidgetInstances.js';

type RuntimeDesignDocumentOptions = {
  emit?: RuntimeDataEmitter;
  widgetEmit?: RuntimeWidgetEmitter;
  globalLayout?: RuntimeDesignLayoutItem[];
  /** Branch-local ancestry permits reuse in siblings while stopping recursive designs. */
  designPath?: string[];
};

function collectLeaves(node: LayoutNode | null, leaves: LayoutNode[] = []): LayoutNode[] {
  if (!node) return leaves;
  if (node.type === 'split') {
    node.children.forEach(child => collectLeaves(child, leaves));
    return leaves;
  }
  leaves.push(node);
  return leaves;
}

function collectPlacementHosts(
  node: LayoutNode | null,
  hosts: LayoutNode[] = [],
  isRoot = true
): LayoutNode[] {
  if (!node) return hosts;
  // The page root only orders Sections. Every Section and nested Container is
  // a real placement host, including Containers that own further Containers.
  if (node.section || node.type === 'leaf' || !isRoot) hosts.push(node);
  if (node.type === 'split') {
    node.children.forEach(child => collectPlacementHosts(child, hosts, false));
  }
  return hosts;
}

function structuralItemsForHost(
  host: LayoutNode,
  idMap: Map<string, HTMLElement>
): Array<{ element: HTMLElement; item: RuntimeDesignLayoutItem }> {
  if (host.type !== 'split') return [];
  return host.children.flatMap(child => {
    const childId = String(child.nodeId || '').trim();
    const element = childId ? idMap.get(childId) : null;
    if (!element) return [];
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

function primaryWorkareaId(tree: LayoutNode | null): string | null {
  const hosts = collectPlacementHosts(tree);
  const workarea = hosts.find(host => host.workarea) || hosts.find(host => host.section) || hosts[0] || null;
  return workarea?.nodeId || null;
}

function placementWorkareaId(item: RuntimeDesignLayoutItem): string {
  const meta = item.code?.meta && typeof item.code.meta === 'object'
    ? item.code.meta as Record<string, unknown>
    : {};
  return String(
    item.workareaId
      ?? item.workarea_id
      ?? meta.workareaId
      ?? meta.workarea_id
      ?? ''
  ).trim();
}

function placementsForWorkarea(
  placements: RuntimeDesignLayoutItem[],
  workareaId: string | null,
  fallbackWorkareaId: string | null
): RuntimeDesignLayoutItem[] {
  return placements.filter(item => {
    const itemWorkareaId = placementWorkareaId(item);
    if (itemWorkareaId) return itemWorkareaId === workareaId;
    return workareaId === fallbackWorkareaId;
  });
}

async function renderDesignRefLeaf({
  leaf,
  container,
  allWidgets,
  lane,
  options
}: {
  leaf: LayoutNode;
  container: HTMLElement;
  allWidgets: RuntimeWidgetDefinition[];
  lane: string;
  options: RuntimeDesignDocumentOptions;
}): Promise<void> {
  if (leaf.type !== 'leaf' || !leaf.designRef || typeof options.emit !== 'function') return;
  const designPath = options.designPath || [];
  if (designPath.includes(String(leaf.designRef)) || designPath.length >= 16) {
    console.warn('[RuntimeDesignDocument] RUNTIME_DESIGN_REF_CYCLE_OR_DEPTH', leaf.designRef);
    return;
  }
  try {
    const response = await fetchRuntimeDesign(options.emit, leaf.designRef, lane);
    const layout = getRuntimeDesignLayout(response);
    // Embedded designs use the same structural renderer as the outer page.
    // Do not flatten their containers or repeat the page's global widgets.
    applyRuntimeDesignStyles(container, response?.design);
    const rendered = await renderRuntimeDesignDocument(
      container,
      getRuntimeDesignDocument({ ...response, placements: layout }),
      allWidgets,
      lane,
      { emit: options.emit, widgetEmit: options.widgetEmit, designPath: [...designPath, String(leaf.designRef)] }
    );
    if (!rendered && layout.length) {
      await renderStaticRuntimeGrid(container, layout, allWidgets, lane, {
        widgetEmit: options.widgetEmit
      });
    }
  } catch (err) {
    console.warn('[RuntimeDesignDocument] RUNTIME_DESIGN_REF_RENDER_FAILED', leaf.designRef, err);
  }
}

export function getRuntimeDesignDocument(response: unknown): DesignDocument {
  return extractDesignDocument(response);
}

/** Resolve only the outer document's slot; nested designs own their own hosts. */
export function getRuntimeDesignContentMount(target: HTMLElement): HTMLElement {
  const shell = target.querySelector<HTMLElement>('.runtime-design-document');
  if (!shell) return target;
  const ownHosts = Array.from(shell.querySelectorAll<HTMLElement>('.runtime-layout-container'))
    .filter(host => host.closest('.runtime-design-document') === shell);
  return ownHosts.find(host => host.dataset.dynamicHost === 'true')
    || ownHosts.find(host => host.dataset.workarea === 'true')
    || target;
}

export async function renderRuntimeDesignDocument(
  target: HTMLElement,
  document: DesignDocument,
  allWidgets: RuntimeWidgetDefinition[],
  lane: string,
  options: RuntimeDesignDocumentOptions = {}
): Promise<boolean> {
  const tree = normalizeLayoutTree(document.layoutTree);
  if (!target || !tree) return false;

  const shell = window.document.createElement('div');
  shell.className = 'runtime-design-document';
  const idMap = renderLayoutTree(tree, shell);
  target.appendChild(shell);

  const fallbackWorkareaId = primaryWorkareaId(tree);
  const leaves = collectLeaves(tree);
  const placementHosts = collectPlacementHosts(tree);
  const placements = document.placements as RuntimeDesignLayoutItem[];

  for (const leaf of leaves) {
    const leafId = leaf.nodeId || '';
    const container = leafId ? idMap.get(String(leafId)) : null;
    if (!container) continue;
    await renderDesignRefLeaf({ leaf, container, allWidgets, lane, options });
  }

  for (const host of placementHosts) {
    const hostId = host.nodeId || '';
    const container = hostId ? idMap.get(String(hostId)) : null;
    if (!container) continue;
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
