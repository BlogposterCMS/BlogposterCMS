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
  columns?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
  background?: string;
  maxWidth?: string;
  minHeight?: string;
  overflow?: 'visible' | 'hidden' | 'auto';
}

export interface SceneSection {
  id: string;
  title: string;
  background?: string;
  backgroundImageUrl?: string;
  backgroundImageId?: string;
}

export interface LayoutNodePlacement {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  xPercent?: number;
  yPercent?: number;
  wPercent?: number;
  hPercent?: number;
  responsivePlacement?: Record<string, unknown>;
}

export interface LayoutNodeBase {
  type: 'leaf' | 'split';
  workarea?: boolean;
  nodeId?: string;
  section?: SceneSection;
  scenes?: SceneSection[];
  settings?: LayoutContainerSettings;
  placement?: LayoutNodePlacement;
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

function normalizeMediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const url = value.trim();
  if (!url || url.length > 2048 || /[\u0000-\u001f"'\\]/.test(url)) return undefined;
  return /^(?:https?:\/\/|\/(?!\/))/i.test(url) ? url : undefined;
}

function normalizeOverflow(value: unknown): LayoutContainerSettings['overflow'] | undefined {
  return value === 'visible' || value === 'hidden' || value === 'auto'
    ? value
    : undefined;
}

function normalizeColumns(value: unknown): number | undefined {
  const columns = Number(value);
  return Number.isInteger(columns) && columns >= 1 && columns <= 12
    ? columns
    : undefined;
}

function finitePlacementNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function normalizeLayoutNodePlacement(value: unknown): LayoutNodePlacement | undefined {
  const source = isRecord(value) ? value : {};
  const placement: LayoutNodePlacement = {};
  const numericKeys: Array<keyof Omit<LayoutNodePlacement, 'responsivePlacement'>> = [
    'x',
    'y',
    'w',
    'h',
    'xPercent',
    'yPercent',
    'wPercent',
    'hPercent'
  ];
  numericKeys.forEach(key => {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    const number = finitePlacementNumber(source[key] ?? source[snakeKey]);
    if (number !== undefined) placement[key] = number;
  });
  const responsivePlacement = source.responsivePlacement ?? source.responsive_placement;
  if (isRecord(responsivePlacement)) {
    placement.responsivePlacement = responsivePlacement;
  }
  return Object.keys(placement).length ? placement : undefined;
}

function normalizeAlignment(value: unknown): LayoutContainerSettings['align'] | undefined {
  return value === 'start' || value === 'center' || value === 'end' || value === 'stretch'
    ? value
    : undefined;
}

export function normalizeLayoutContainerSettings(value: unknown): LayoutContainerSettings {
  const source = isRecord(value) ? value : {};
  const settings: LayoutContainerSettings = {};
  const mode = normalizeContainerMode(source.mode ?? source.layoutMode ?? source.layout_mode);
  const gap = normalizeCssLength(source.gap ?? source.layoutGap ?? source.layout_gap);
  const padding = normalizeCssLength(source.padding ?? source.layoutPadding ?? source.layout_padding);
  const columns = normalizeColumns(source.columns ?? source.layoutColumns ?? source.layout_columns);
  const align = normalizeAlignment(source.align ?? source.alignment ?? source.layoutAlign ?? source.layout_align);
  const background = normalizeColor(source.background ?? source.bg ?? source.backgroundColor ?? source.background_color);
  const maxWidth = normalizeCssLength(source.maxWidth ?? source.max_width);
  const minHeight = normalizeCssLength(source.minHeight ?? source.min_height);
  const overflow = normalizeOverflow(source.overflow);

  if (mode) settings.mode = mode;
  if (gap) settings.gap = gap;
  if (padding) settings.padding = padding;
  if (columns) settings.columns = columns;
  if (align) settings.align = align;
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
        const backgroundImageUrl = normalizeMediaUrl(
          scene.backgroundImageUrl ||
          scene.background_image_url ||
          scene.bgImageUrl ||
          scene.bg_image_url ||
          ''
        );
        const backgroundImageId = normalizeNodeId(
          scene.backgroundImageId ||
          scene.background_image_id ||
          scene.bgImageId ||
          scene.bg_image_id ||
          ''
        );
        if (!id) return null;
        return {
          id,
          title: title || id,
          ...(background ? { background } : {}),
          ...(backgroundImageUrl ? { backgroundImageUrl } : {}),
          ...(backgroundImageId ? { backgroundImageId } : {})
        };
      })
      .filter((scene): scene is SceneSection => Boolean(scene))
    : [];
}

export function normalizeSceneSection(value: unknown): SceneSection | undefined {
  const [section] = normalizeSceneSections(isRecord(value) ? [value] : []);
  return section;
}

export function collectLayoutSections(tree: LayoutNode | null): SceneSection[] {
  if (!tree) return [];
  const sections: SceneSection[] = [];
  const visit = (node: LayoutNode): void => {
    if (node.section) {
      sections.push({
        ...node.section,
        ...(node.section.background || !node.settings?.background
          ? {}
          : { background: node.settings.background })
      });
    }
    if (node.type === 'split') node.children.forEach(visit);
  };
  visit(tree);
  return sections;
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
    section: normalizeSceneSection(source.section ?? (
      source.sectionId || source.section_id
        ? {
            id: source.sectionId ?? source.section_id,
            title: source.sectionTitle ?? source.section_title,
            background: source.sectionBackground ?? source.section_background,
            backgroundImageUrl: source.sectionBackgroundImageUrl ??
              source.section_background_image_url ??
              source.bgImageUrl ??
              source.bg_image_url,
            backgroundImageId: source.sectionBackgroundImageId ??
              source.section_background_image_id ??
              source.bgImageId ??
              source.bg_image_id
          }
        : undefined
    )),
    scenes: normalizeSceneSections(source.scenes),
    settings: normalizeLayoutContainerSettings(source.settings ?? source.container ?? source),
    placement: normalizeLayoutNodePlacement(source.placement ?? source.gridPlacement ?? source.grid_placement),
    styleSource: normalizeStyleSourceSettings(source.styleSource ?? source.style_source ?? source.styleLink ?? source.style_link)
  };
  const commonFields = {
    ...(common.workarea ? { workarea: true } : {}),
    ...(common.nodeId ? { nodeId: common.nodeId } : {}),
    ...(common.section ? { section: common.section } : {}),
    ...(common.scenes.length ? { scenes: common.scenes } : {}),
    ...(Object.keys(common.settings).length ? { settings: common.settings } : {}),
    ...(common.placement ? { placement: common.placement } : {}),
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

  if (declaredType !== 'leaf' && !common.workarea && !common.nodeId && !source.designRef && !source.design_ref && !common.section && !common.scenes.length) {
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
  const canonicalSections = collectLayoutSections(layoutTree);
  const sourceScenes = canonicalSections.length
    ? canonicalSections
    : (layoutTree?.scenes?.length
        ? layoutTree.scenes
        : normalizeSceneSections(source.scenes ?? design.scenes));

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
