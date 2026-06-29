import {
  hasStyleSourceSettings,
  normalizeStyleSourceSettings,
  type StyleSourceSettings
} from './styleSource.js';

export const DESIGN_DOCUMENT_VERSION = 1;

export type LayoutOrientation = 'horizontal' | 'vertical';
export type LayoutContainerMode = 'free' | 'stack' | 'row' | 'grid';

export interface LayoutContainerSettings {
  mode?: LayoutContainerMode;
  gap?: string;
  padding?: string;
  background?: string;
  maxWidth?: string;
  minHeight?: string;
  overflow?: 'visible' | 'hidden' | 'auto';
}

export interface SceneSection {
  id: string;
  title: string;
  background?: string;
}

export interface LayoutNodeBase {
  type: 'leaf' | 'split';
  workarea?: boolean;
  nodeId?: string;
  scenes?: SceneSection[];
  settings?: LayoutContainerSettings;
  styleSource?: StyleSourceSettings;
}

export interface LayoutLeafNode extends LayoutNodeBase {
  type: 'leaf';
  designRef?: string;
}

export interface LayoutSplitNode extends LayoutNodeBase {
  type: 'split';
  orientation: LayoutOrientation;
  children: LayoutNode[];
  sizes?: number[];
}

export type LayoutNode = LayoutLeafNode | LayoutSplitNode;

export interface WidgetPlacement {
  id?: string;
  widgetId?: string;
  workareaId?: string;
  styleSource?: StyleSourceSettings;
  sceneId?: string;
  [key: string]: unknown;
}

export interface DesignDocument {
  version: number;
  layoutTree: LayoutNode | null;
  placements: WidgetPlacement[];
  scenes: SceneSection[];
  styles: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

type LooseRecord = Record<string, unknown>;

function isRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonRecord(value: unknown): LooseRecord | null {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeNodeId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return undefined;
}

function normalizeContainerMode(value: unknown): LayoutContainerMode | undefined {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (mode === 'free' || mode === 'stack' || mode === 'row' || mode === 'grid') {
    return mode;
  }
  return undefined;
}

function normalizeCssLength(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return `${Math.round(value)}px`;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80 || /[;{}]/.test(trimmed)) return undefined;
  if (/^\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)$/i.test(trimmed)) return trimmed;
  if (/^(?:auto|min-content|max-content|fit-content)$/i.test(trimmed)) return trimmed;
  return undefined;
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80 || /[;{}]/.test(trimmed)) return undefined;
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed;
  if (/^(?:transparent|currentcolor)$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^(?:rgb|rgba|hsl|hsla)\([0-9%.,\s-]+\)$/i.test(trimmed)) return trimmed;
  return undefined;
}

function normalizeOverflow(value: unknown): LayoutContainerSettings['overflow'] | undefined {
  return value === 'visible' || value === 'hidden' || value === 'auto'
    ? value
    : undefined;
}

export function normalizeLayoutContainerSettings(value: unknown): LayoutContainerSettings {
  const source = isRecord(value) ? value : {};
  const settings: LayoutContainerSettings = {};
  const mode = normalizeContainerMode(source.mode ?? source.layoutMode ?? source.layout_mode);
  const gap = normalizeCssLength(source.gap ?? source.layoutGap ?? source.layout_gap);
  const padding = normalizeCssLength(source.padding ?? source.layoutPadding ?? source.layout_padding);
  const background = normalizeColor(source.background ?? source.bg ?? source.backgroundColor ?? source.background_color);
  const maxWidth = normalizeCssLength(source.maxWidth ?? source.max_width);
  const minHeight = normalizeCssLength(source.minHeight ?? source.min_height);
  const overflow = normalizeOverflow(source.overflow);

  if (mode) settings.mode = mode;
  if (gap) settings.gap = gap;
  if (padding) settings.padding = padding;
  if (background) settings.background = background;
  if (maxWidth) settings.maxWidth = maxWidth;
  if (minHeight) settings.minHeight = minHeight;
  if (overflow) settings.overflow = overflow;
  return settings;
}

export function normalizeSceneSections(value: unknown): SceneSection[] {
  return Array.isArray(value)
    ? value
      .filter(isRecord)
      .map(scene => {
        const id = String(scene.id || scene.sceneId || '').trim();
        const title = String(scene.title || scene.sceneTitle || id).trim();
        const background = String(scene.background || scene.bgColor || scene.bg_color || '').trim();
        if (!id) return null;
        return {
          id,
          title: title || id,
          ...(background ? { background } : {})
        };
      })
      .filter((scene): scene is SceneSection => Boolean(scene))
    : [];
}

export function normalizeLayoutTree(value: unknown): LayoutNode | null {
  const source = parseJsonRecord(value);
  if (!source) return null;

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
      .filter((child): child is LayoutNode => Boolean(child));
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

export function normalizeWidgetPlacements(value: unknown): WidgetPlacement[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map(item => {
      const styleSource = normalizeStyleSourceSettings(item.styleSource ?? item.style_source ?? item.styleLink ?? item.style_link);
      const placement = { ...item } as WidgetPlacement & LooseRecord;
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

function pickLayoutSource(source: LooseRecord): unknown {
  return source.layoutTree
    ?? source.layout_tree
    ?? source.layout
    ?? source.layout_json
    ?? (isRecord(source.design) ? source.design.layout ?? source.design.layout_json : null);
}

export function extractDesignDocument(response: unknown): DesignDocument {
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

export function createDesignDocument(input: {
  layoutTree?: unknown;
  placements?: unknown;
  scenes?: unknown;
  styles?: unknown;
  metadata?: unknown;
} = {}): DesignDocument {
  return {
    version: DESIGN_DOCUMENT_VERSION,
    layoutTree: normalizeLayoutTree(input.layoutTree),
    placements: normalizeWidgetPlacements(input.placements),
    scenes: normalizeSceneSections(input.scenes),
    styles: isRecord(input.styles) ? { ...input.styles } : {},
    metadata: isRecord(input.metadata) ? { ...input.metadata } : {}
  };
}
