import {
  normalizeLayoutTree,
  type LayoutNode,
  type LayoutOrientation
} from './layoutDocument.js';

type LayoutLabels = {
  splitHint?: string;
  workareaLabel?: string;
};

type LayoutDomOptions = {
  labels?: LayoutLabels;
  generateNodeId?: () => string;
};

type LayoutElement = HTMLElement & {
  dataset: DOMStringMap;
};

const DEFAULT_LABELS = {
  splitHint: 'Click to add container',
  workareaLabel: 'Design area'
};

function labelsFor(options: LayoutDomOptions = {}): Required<LayoutLabels> {
  return {
    splitHint: options.labels?.splitHint || DEFAULT_LABELS.splitHint,
    workareaLabel: options.labels?.workareaLabel || DEFAULT_LABELS.workareaLabel
  };
}

function nextNodeId(options: LayoutDomOptions = {}): string {
  return typeof options.generateNodeId === 'function'
    ? options.generateNodeId()
    : `layout-${Math.random().toString(36).slice(2, 10)}`;
}

function childLayoutContainers(container: Element): LayoutElement[] {
  return Array.from(container.children)
    .filter((child): child is LayoutElement => child instanceof HTMLElement && child.classList.contains('layout-container'));
}

function flexDirectionFor(orientation: LayoutOrientation): string {
  return orientation === 'horizontal' ? 'column' : 'row';
}

function splitOrientationForPosition(position: string): LayoutOrientation {
  if (position === 'left' || position === 'right') return 'vertical';
  return 'horizontal';
}

export function serializeLayout(container: HTMLElement | null): LayoutNode | null {
  if (!container) return null;
  const isSplit = container.dataset.split === 'true';
  const workarea = container.dataset.workarea === 'true';
  const nodeId = container.dataset.nodeId;
  if (isSplit) {
    const orientation: LayoutOrientation = container.dataset.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    const children = childLayoutContainers(container)
      .map(child => serializeLayout(child))
      .filter((child): child is LayoutNode => Boolean(child));
    const sizes = childLayoutContainers(container)
      .map(child => {
        const flex = parseFloat(child.style.flex);
        return Number.isFinite(flex) ? flex : 1;
      });
    const obj: LayoutNode = {
      type: 'split',
      orientation,
      children,
      ...(workarea ? { workarea: true } : {}),
      ...(nodeId ? { nodeId } : {})
    };
    if (sizes.some(size => size !== 1)) {
      obj.sizes = sizes;
    }
    return obj;
  }
  const leaf: LayoutNode = {
    type: 'leaf',
    ...(workarea ? { workarea: true } : {}),
    ...(nodeId ? { nodeId } : {})
  };
  const designRef = container.dataset.designRef;
  if (designRef) leaf.designRef = designRef;
  return leaf;
}

export function deserializeLayout(obj: unknown, container: HTMLElement | null, options: LayoutDomOptions = {}): void {
  if (!container) return;
  const node = normalizeLayoutTree(obj);
  if (!node) return;
  const labels = labelsFor(options);
  container.replaceChildren();
  if (node.type === 'split') {
    const orientation = node.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    container.dataset.split = 'true';
    container.dataset.orientation = orientation;
    container.style.display = 'flex';
    container.style.flexDirection = flexDirectionFor(orientation);
    const sizes = Array.isArray(node.sizes) ? node.sizes : [];
    node.children.forEach((child, index) => {
      const div = document.createElement('div');
      const size = sizes[index];
      div.style.flex = Number.isFinite(size) ? `${size} 1 0` : '1 1 0';
      container.appendChild(div);
      deserializeLayout(child, div, options);
    });
    container.classList.add('layout-container');
  } else {
    container.className = 'layout-container builder-grid canvas-grid';
    container.style.flex = container.style.flex || '1 1 0';
    delete container.dataset.split;
    delete container.dataset.orientation;
  }
  container.dataset.emptyHint = labels.splitHint;
  if (node.workarea) {
    container.dataset.workarea = 'true';
    container.dataset.workareaLabel = labels.workareaLabel;
  } else {
    delete container.dataset.workarea;
    delete container.dataset.workareaLabel;
  }
  container.dataset.nodeId = node.nodeId || nextNodeId(options);
  if (node.type === 'leaf' && node.designRef) {
    container.dataset.designRef = node.designRef;
  } else {
    delete container.dataset.designRef;
  }
}

export function renderLayoutTree(tree: unknown, mountEl: HTMLElement | null): Map<string, HTMLElement> {
  const node = normalizeLayoutTree(tree);
  const map = new Map<string, HTMLElement>();
  if (!mountEl || !node) return map;
  mountEl.replaceChildren();

  const walk = (current: LayoutNode, parent: HTMLElement): HTMLElement => {
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
      const sizes = Array.isArray(current.sizes) ? current.sizes : [];
      current.children.forEach((child, index) => {
        const childEl = walk(child, el);
        const size = sizes[index];
        if (Number.isFinite(size)) {
          childEl.style.flex = `${size} 1 0`;
        }
      });
    } else if (current.designRef) {
      el.dataset.designRef = current.designRef;
    }
    parent.appendChild(el);
    return el;
  };
  walk(node, mountEl);
  return map;
}

export function createLeaf(options: LayoutDomOptions = {}): HTMLElement {
  const labels = labelsFor(options);
  const div = document.createElement('div');
  div.className = 'layout-container builder-grid canvas-grid';
  div.style.flex = '1 1 0';
  div.dataset.emptyHint = labels.splitHint;
  div.dataset.nodeId = nextNodeId(options);
  return div;
}

export function ensureLayoutRootContainer(layoutRoot: HTMLElement | null, options: LayoutDomOptions = {}): HTMLElement | null {
  if (!layoutRoot) return null;
  const labels = labelsFor(options);
  layoutRoot.classList.add('layout-root');
  let rootContainer: HTMLElement | null = layoutRoot;
  if (!layoutRoot.classList.contains('layout-container')) {
    rootContainer = layoutRoot.querySelector(':scope > .layout-container');
  }
  if (!rootContainer) {
    layoutRoot.classList.add('layout-container', 'builder-grid', 'canvas-grid');
    layoutRoot.dataset.emptyHint = labels.splitHint;
    layoutRoot.dataset.nodeId = layoutRoot.dataset.nodeId || nextNodeId(options);
    rootContainer = layoutRoot;
  } else {
    rootContainer.dataset.nodeId = rootContainer.dataset.nodeId || nextNodeId(options);
    rootContainer.dataset.emptyHint = rootContainer.dataset.emptyHint || labels.splitHint;
  }
  return rootContainer;
}

export function setDefaultWorkarea(root: HTMLElement | null, options: LayoutDomOptions = {}): void {
  if (!root) return;
  if (root.querySelector('.layout-container[data-workarea="true"]')) return;
  const labels = labelsFor(options);
  const all = Array.from(root.querySelectorAll<HTMLElement>('.layout-container'));
  const candidates = all.filter(el => el.dataset.split !== 'true');
  const containers = candidates.length ? candidates : all.slice(0, 1);
  let largest: HTMLElement | null = null;
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

export function setDynamicHost(layoutRoot: HTMLElement | null, el: HTMLElement | null, options: LayoutDomOptions = {}): void {
  if (!layoutRoot) return;
  const labels = labelsFor(options);
  layoutRoot.querySelectorAll<HTMLElement>('.layout-container[data-workarea="true"]').forEach(node => {
    node.removeAttribute('data-workarea');
    node.removeAttribute('data-workarea-label');
  });
  if (el) {
    el.dataset.workarea = 'true';
    el.dataset.workareaLabel = labels.workareaLabel;
  }
}

export function setDesignRef(el: HTMLElement | null, designId: string | null | undefined): void {
  if (!el) return;
  if (designId) el.dataset.designRef = String(designId);
  else delete el.dataset.designRef;
}

export function placeContainer(
  targetEl: HTMLElement | null,
  position: string,
  { layoutRoot, onAfterChange, ...options }: LayoutDomOptions & { layoutRoot?: HTMLElement | null; onAfterChange?: (payload: { layoutRoot?: HTMLElement | null }) => void } = {}
): void {
  if (!targetEl) return;
  const orientation = splitOrientationForPosition(position);
  const newLeaf = createLeaf(options);
  if (position === 'inside') {
    if (targetEl.dataset.split === 'true') {
      targetEl.appendChild(newLeaf);
    } else {
      const frag = document.createDocumentFragment();
      while (targetEl.firstChild) frag.appendChild(targetEl.firstChild);
      targetEl.dataset.split = 'true';
      targetEl.dataset.orientation = orientation;
      targetEl.style.display = 'flex';
      targetEl.style.flexDirection = flexDirectionFor(orientation);
      const existing = createLeaf(options);
      existing.appendChild(frag);
      targetEl.append(existing, newLeaf);
    }
  } else {
    insertAdjacentContainer(targetEl, newLeaf, position, orientation, options);
  }
  onAfterChange?.({ layoutRoot: layoutRoot || targetEl.closest<HTMLElement>('.layout-root') });
}

function insertAdjacentContainer(
  targetEl: HTMLElement,
  movingEl: HTMLElement,
  position: string,
  orientation: LayoutOrientation,
  options: LayoutDomOptions
): void {
  const parent = targetEl.parentElement;
  if (parent && parent.dataset.split === 'true' && parent.dataset.orientation === orientation) {
    if (position === 'left' || position === 'top') parent.insertBefore(movingEl, targetEl);
    else parent.insertBefore(movingEl, targetEl.nextSibling);
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
  if (parent) parent.replaceChild(wrapper, targetEl);
  wrapper.appendChild(targetEl);
  targetEl.style.flex = '1 1 0';
  if (position === 'left' || position === 'top') wrapper.insertBefore(movingEl, targetEl);
  else wrapper.appendChild(movingEl);
}

function collapseSingleChildSplit(parent: HTMLElement | null): void {
  if (!parent || parent.dataset?.split !== 'true') return;
  const children = Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  if (children.length !== 1) return;
  const only = children[0];
  if (!only) return;
  if (parent.dataset.workarea === 'true') {
    only.dataset.workarea = 'true';
    only.dataset.workareaLabel = parent.dataset.workareaLabel || DEFAULT_LABELS.workareaLabel;
  }
  parent.replaceWith(only);
}

export function deleteContainer(
  targetEl: HTMLElement | null,
  { onAfterChange }: { onAfterChange?: (payload: { layoutRoot?: HTMLElement | null }) => void } = {}
): void {
  if (!targetEl) return;
  const parent = targetEl.parentElement;
  targetEl.remove();
  collapseSingleChildSplit(parent);
  onAfterChange?.({ layoutRoot: parent?.closest?.('.layout-root') || parent });
}

export function moveContainer(
  srcEl: HTMLElement | null,
  targetEl: HTMLElement | null,
  position: string,
  { onAfterChange, ...options }: LayoutDomOptions & { onAfterChange?: (payload: { layoutRoot?: HTMLElement | null }) => void } = {}
): void {
  if (!srcEl || !targetEl || srcEl === targetEl) return;
  const orientation = position === 'inside'
    ? (targetEl.dataset.orientation === 'vertical' ? 'vertical' : 'horizontal')
    : splitOrientationForPosition(position);
  const srcParent = srcEl.parentElement;
  if (position === 'inside') {
    if (targetEl.dataset.split === 'true') {
      targetEl.appendChild(srcEl);
    } else {
      const frag = document.createDocumentFragment();
      while (targetEl.firstChild) frag.appendChild(targetEl.firstChild);
      targetEl.dataset.split = 'true';
      targetEl.dataset.orientation = orientation;
      targetEl.style.display = 'flex';
      targetEl.style.flexDirection = flexDirectionFor(orientation);
      const existing = createLeaf(options);
      existing.appendChild(frag);
      targetEl.append(existing, srcEl);
    }
  } else {
    insertAdjacentContainer(targetEl, srcEl, position, orientation, options);
  }
  collapseSingleChildSplit(srcParent);
  onAfterChange?.({ layoutRoot: targetEl.closest<HTMLElement>('.layout-root') });
}
