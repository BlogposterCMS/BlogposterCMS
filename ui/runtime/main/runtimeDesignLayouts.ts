import {
  normalizeEffects,
  parseMetadata
} from './sceneRuntime.js';
import { sanitizeUrl } from './runtimePageShell.js';

type LooseRecord = Record<string, any>;

export type RuntimeDesignLayoutItem = LooseRecord;

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : null;
}

export function normalizeRuntimeDesignWidget(
  widget: LooseRecord = {}
): RuntimeDesignLayoutItem | null {
  if (!widget || typeof widget !== 'object') return null;
  const meta = parseMetadata(widget.metadata);
  const layer = widget.layer ?? widget.zIndex ?? widget.z_index;
  const rotation = widget.rotationDeg ?? widget.rotation_deg;
  const opacity = widget.opacity ?? meta.opacity;
  const radius = widget.radius ?? widget.cornerRadius ?? widget.corner_radius
    ?? meta.radius ?? meta.cornerRadius ?? meta.corner_radius;
  const elementName = widget.elementName ?? widget.element_name
    ?? meta.elementName ?? meta.element_name ?? meta.name;

  return {
    id: widget.instance_id || widget.instanceId,
    widgetId: widget.widget_id || widget.widgetId,
    xPercent: widget.x_percent ?? widget.xPercent,
    yPercent: widget.y_percent ?? widget.yPercent,
    wPercent: widget.w_percent ?? widget.wPercent,
    hPercent: widget.h_percent ?? widget.hPercent,
    layer: finiteNumber(layer),
    rotationDeg: finiteNumber(rotation),
    opacity: finiteNumber(opacity),
    radius: finiteNumber(radius),
    elementName,
    behavior: widget.behavior ?? widget.behaviour ?? meta.behavior,
    sceneId: widget.sceneId ?? widget.scene_id ?? meta.sceneId ?? meta.scene_id,
    sceneTitle: widget.sceneTitle ?? widget.scene_title ?? meta.sceneTitle ?? meta.scene_title,
    sceneBackground: widget.sceneBackground ?? widget.scene_background
      ?? meta.sceneBackground ?? meta.scene_background,
    scrollStart: widget.scrollStart ?? widget.scroll_start ?? meta.scrollStart ?? meta.scroll_start,
    scrollEnd: widget.scrollEnd ?? widget.scroll_end ?? meta.scrollEnd ?? meta.scroll_end,
    effects: normalizeEffects(widget.effects ?? meta.effects),
    zIndex: widget.zIndex ?? widget.z_index ?? widget.layer ?? meta.zIndex ?? meta.z_index,
    code: {
      html: widget.html,
      css: widget.css,
      js: widget.js,
      meta,
      metadata: widget.metadata,
    },
  };
}

export function getRuntimeDesignLayout(response: unknown): RuntimeDesignLayoutItem[] {
  const source = response && typeof response === 'object'
    ? response as LooseRecord
    : {};
  return Array.isArray(source.widgets)
    ? source.widgets
      .map(widget => normalizeRuntimeDesignWidget(widget))
      .filter((item): item is RuntimeDesignLayoutItem => Boolean(item))
    : [];
}

export function applyRuntimeDesignStyles(
  target: HTMLElement,
  design: unknown
): void {
  if (!target || !design || typeof design !== 'object') return;
  const source = design as LooseRecord;
  if (source.bg_color) {
    target.style.backgroundColor = String(source.bg_color);
  }
  if (source.bg_media_url) {
    const url = sanitizeUrl(String(source.bg_media_url));
    if (url) target.style.backgroundImage = `url('${url}')`;
  }
}
