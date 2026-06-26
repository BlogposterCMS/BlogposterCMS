import {
  getSceneMetadata,
  mergeSceneMetaIntoCode,
  normalizeEffects,
  readSceneValue
} from './sceneRuntime.js';
import type { RuntimeCanvasItemMeta } from './runtimeCanvasItems.js';

export type { RuntimeCanvasItemMeta } from './runtimeCanvasItems.js';

export type RuntimeCanvasMetaResolver = (
  instanceId: string,
  el: HTMLElement
) => RuntimeCanvasItemMeta | null | undefined;

function readCanvasSceneValue(
  el: HTMLElement,
  meta: RuntimeCanvasItemMeta,
  sceneMeta: RuntimeCanvasItemMeta,
  datasetKey: string,
  keys: string[]
): unknown {
  return el.dataset[datasetKey] || readSceneValue(meta, sceneMeta, keys);
}

export function serializeRuntimeCanvasItem(
  el: HTMLElement,
  meta: RuntimeCanvasItemMeta = {}
): RuntimeCanvasItemMeta {
  const instanceId = el.dataset.instanceId;
  const sceneMeta = getSceneMetadata(meta);
  const behavior = readCanvasSceneValue(el, meta, sceneMeta, 'behavior', ['behavior', 'behaviour']);
  const sceneId = readCanvasSceneValue(el, meta, sceneMeta, 'sceneId', ['sceneId', 'scene_id']);
  const sceneTitle = readCanvasSceneValue(el, meta, sceneMeta, 'sceneTitle', ['sceneTitle', 'scene_title']);
  const sceneBackground = readCanvasSceneValue(el, meta, sceneMeta, 'sceneBackground', ['sceneBackground', 'scene_background']);
  const scrollStart = readCanvasSceneValue(el, meta, sceneMeta, 'scrollStart', ['scrollStart', 'scroll_start']);
  const scrollEnd = readCanvasSceneValue(el, meta, sceneMeta, 'scrollEnd', ['scrollEnd', 'scroll_end']);
  const elementName = readCanvasSceneValue(el, meta, sceneMeta, 'elementName', ['elementName', 'element_name', 'name']);
  const opacity = readCanvasSceneValue(el, meta, sceneMeta, 'opacity', ['opacity']);
  const radius = readCanvasSceneValue(el, meta, sceneMeta, 'radius', ['radius', 'cornerRadius', 'corner_radius']);
  const effects = normalizeEffects(
    el.dataset.effects || readSceneValue(meta, sceneMeta, ['effects'])
  );
  const code = mergeSceneMetaIntoCode(meta.code || null, {
    ...meta,
    behavior,
    sceneId,
    sceneTitle,
    sceneBackground,
    scrollStart,
    scrollEnd,
    elementName,
    opacity,
    radius,
    effects,
  });

  return {
    id: instanceId,
    widgetId: el.dataset.widgetId,
    x: Number(el.dataset.x) || 0,
    y: Number(el.dataset.y) || 0,
    w: Number(el.getAttribute('gs-w')),
    h: Number(el.getAttribute('gs-h')),
    ...(behavior ? { behavior } : {}),
    ...(sceneId ? { sceneId } : {}),
    ...(sceneTitle ? { sceneTitle } : {}),
    ...(sceneBackground ? { sceneBackground } : {}),
    ...(scrollStart ? { scrollStart } : {}),
    ...(scrollEnd ? { scrollEnd } : {}),
    ...(elementName ? { elementName } : {}),
    ...(opacity !== undefined && opacity !== '' ? { opacity } : {}),
    ...(radius !== undefined && radius !== '' ? { radius } : {}),
    ...(effects.length ? { effects } : {}),
    code
  };
}

export function serializeRuntimeCanvasLayout(
  gridEl: HTMLElement,
  resolveMeta: RuntimeCanvasMetaResolver = () => ({})
): RuntimeCanvasItemMeta[] {
  return Array.from(gridEl.querySelectorAll<HTMLElement>('.canvas-item'))
    .map(el => serializeRuntimeCanvasItem(
      el,
      resolveMeta(el.dataset.instanceId || '', el) || {}
    ));
}
