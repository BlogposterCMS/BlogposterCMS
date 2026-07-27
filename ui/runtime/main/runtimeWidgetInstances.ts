import { applyWidgetOptions } from './widgetRuntimeGateway.js';
import {
  runtimePublicPayload,
  unwrapRuntimeFacadeData
} from '../../shared/api-client/runtimeFacade.js';
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
  if (lane === 'admin') {
    return;
  }

  try {
    // Public pages and the sandboxed Live Preview share the audited Runtime
    // Manager facade. Direct PlainSpace events cannot cross the AppLoader
    // bridge and would make widget defaults disappear only in the preview.
    const response = await emit(
      'cmsPublicRuntimeRequest',
      runtimePublicPayload(window.PUBLIC_TOKEN, 'plainSpace', 'widgetInstance', {
        instanceId: `default.${def.id}`
      })
    );
    const res = unwrapRuntimeFacadeData<LooseRecord>(response);
    const parsedOptions = parseWidgetOptions(res?.content);
    applyWidgetOptions(wrapper, parsedOptions ?? undefined, grid as any);
  } catch {}
}
