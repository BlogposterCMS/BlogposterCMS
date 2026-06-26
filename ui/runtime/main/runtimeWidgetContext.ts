import { normalizeEffects } from './sceneRuntime.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetRenderer.js';

type LooseRecord = Record<string, any>;

export type RuntimeWidgetContext = LooseRecord & {
  id?: string;
  widgetId: string;
  metadata?: LooseRecord;
  scene: {
    behavior: string;
    sceneId: string;
    sceneTitle: string;
    sceneBackground: string;
    scrollStart: string;
    scrollEnd: string;
    effects: LooseRecord[];
  };
  jwt?: string;
};

export function createRuntimeWidgetContext(
  wrapper: HTMLElement,
  def: RuntimeWidgetDefinition,
  lane: string
): RuntimeWidgetContext {
  const host = (wrapper.closest('.canvas-item') || wrapper) as HTMLElement;
  const ctx: RuntimeWidgetContext = {
    id: host.dataset.instanceId,
    widgetId: def.id,
    metadata: def.metadata,
    scene: {
      behavior: host.dataset.behavior || '',
      sceneId: host.dataset.sceneId || '',
      sceneTitle: host.dataset.sceneTitle || '',
      sceneBackground: host.dataset.sceneBackground || '',
      scrollStart: host.dataset.scrollStart || '',
      scrollEnd: host.dataset.scrollEnd || '',
      effects: normalizeEffects(host.dataset.effects),
    }
  };
  if (lane === 'admin' && window.ADMIN_TOKEN) {
    ctx.jwt = window.ADMIN_TOKEN;
  }
  return ctx;
}
