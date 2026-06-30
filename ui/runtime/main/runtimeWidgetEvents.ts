import { runtimeAdminPayload, runtimePublicPayload } from '../../shared/api-client/runtimeFacade.js';
import { normalizeWidgetApiActions } from '../../widgets/rendering/widgetEvents.js';

type LooseRecord = Record<string, any>;

export type RuntimeWidgetEventDefinition = {
  id: string;
  metadata?: LooseRecord;
};

type QueueItem = {
  eventName: string;
  payload: LooseRecord;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

export function createDebouncedEmitter(delay = 150) {
  let queue: QueueItem[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function(eventName: string, payload: LooseRecord = {}) {
    return new Promise((resolve, reject) => {
      queue.push({ eventName, payload, resolve, reject });
      if (!timer) {
        timer = setTimeout(async () => {
          const batch = queue.slice();
          queue = [];
          timer = null;
          try {
            const emitBatch = window.meltdownEmitBatch;
            if (typeof emitBatch !== 'function') {
              throw new Error('meltdownEmitBatch is not available');
            }
            const results = await emitBatch(
              batch.map(it => ({ eventName: it.eventName, payload: it.payload }))
            );
            batch.forEach((item, idx) => item.resolve(results[idx]));
          } catch (err) {
            batch.forEach(item => item.reject(err));
          }
        }, delay);
      }
    });
  };
}

export async function registerRuntimeWidgetEvents(
  def: RuntimeWidgetEventDefinition,
  lane: string
): Promise<void> {
  if (typeof window.meltdownEmit !== 'function') return;
  const actions = normalizeWidgetApiActions(def?.metadata || {});
  if (!actions.length) return;
  const jwt = lane === 'admin' ? window.ADMIN_TOKEN : window.PUBLIC_TOKEN;
  if (!jwt) return;
  try {
    await window.meltdownEmit(
      lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest',
      lane === 'admin'
        ? runtimeAdminPayload(jwt, 'widgets', 'registerUsage', { actions })
        : runtimePublicPayload(jwt, 'widgets', 'registerUsage', { actions })
    );
  } catch (err) {
    console.warn(`[Renderer] registerWidgetUsage failed for ${def.id}`, err);
  }
}
