export interface AppFrameMessage {
  type?: string;
  data?: unknown;
  requestId?: string | number;
  eventName?: string;
  payload?: unknown;
  events?: unknown[];
}

type AppFrameEmitter = Window['meltdownEmit'];

export const APP_BRIDGE_REQUEST = 'cms-app-meltdown-request';
export const APP_BRIDGE_BATCH_REQUEST = 'cms-app-meltdown-batch-request';
export const APP_BRIDGE_RESPONSE = 'cms-app-meltdown-response';

const APP_LOADER_MODULE = {
  moduleName: 'appLoader',
  moduleType: 'core'
} as const;

function requireEmitter(emit: AppFrameEmitter): NonNullable<AppFrameEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('SHELL_APP_FRAME_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function unwrapAppEventResult(result: unknown): unknown {
  return result && typeof result === 'object' && 'data' in result
    ? (result as { data?: unknown }).data
    : result;
}

export async function dispatchAppMeltdownRequest(
  emit: AppFrameEmitter,
  jwt: string | null | undefined,
  appName: string,
  eventName: string,
  payload: unknown
): Promise<unknown> {
  const meltdownEmit = requireEmitter(emit);
  const safeEventName = eventName.trim();
  if (!safeEventName) {
    throw new Error('SHELL_APP_FRAME_EVENT_NAME_MISSING: Missing bridge eventName');
  }

  const result = await meltdownEmit('dispatchAppEvent', {
    jwt,
    ...APP_LOADER_MODULE,
    appName,
    event: 'cms-meltdown-request',
    data: {
      eventName: safeEventName,
      payload: objectPayload(payload)
    }
  });
  return unwrapAppEventResult(result);
}

export async function dispatchAppMeltdownBatch(
  emit: AppFrameEmitter,
  jwt: string | null | undefined,
  appName: string,
  events: unknown
): Promise<unknown> {
  const meltdownEmit = requireEmitter(emit);
  const result = await meltdownEmit('dispatchAppEvent', {
    jwt,
    ...APP_LOADER_MODULE,
    appName,
    event: 'cms-meltdown-batch-request',
    data: {
      events: Array.isArray(events) ? events : []
    }
  });
  return unwrapAppEventResult(result);
}

export async function dispatchAppLifecycleMessage(
  emit: AppFrameEmitter,
  jwt: string | null | undefined,
  appName: string,
  eventType: string,
  data: unknown
): Promise<unknown> {
  const meltdownEmit = requireEmitter(emit);
  return meltdownEmit('dispatchAppEvent', {
    jwt,
    ...APP_LOADER_MODULE,
    appName,
    event: eventType,
    data: data || {}
  });
}
