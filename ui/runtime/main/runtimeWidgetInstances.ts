import { applyWidgetOptions } from './widgetRuntimeGateway.js';
import type { RendererGrid } from './runtimeGridMetrics.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetRenderer.js';

type LooseRecord = Record<string, any>;

export type RuntimeEmitter = (
  eventName: string,
  payload?: LooseRecord
) => Promise<any>;

function parseWidgetOptions(content: unknown): LooseRecord | null {
  if (!content) return null;
  if (typeof content === 'object') return content as LooseRecord;
  if (typeof content !== 'string') return null;
  return JSON.parse(content) as LooseRecord;
}

export async function applyDefaultWidgetInstanceOptions(
  wrapper: HTMLElement,
  def: RuntimeWidgetDefinition,
  grid: RendererGrid | null | undefined,
  emit: RuntimeEmitter,
  lane = 'public'
): Promise<void> {
  try {
    const res = await emit('getWidgetInstance', {
      moduleName: 'plainspace',
      moduleType: 'core',
      instanceId: `default.${def.id}`,
      ...(lane === 'admin' ? { jwt: window.ADMIN_TOKEN } : {})
    });
    const opts = parseWidgetOptions(res?.content) ?? undefined;
    applyWidgetOptions(wrapper, opts, grid as any);
  } catch {}
}
