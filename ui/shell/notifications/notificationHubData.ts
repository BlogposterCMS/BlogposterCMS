import { emitRuntimeAdmin } from '../../shared/api-client/runtimeFacade.js';

export interface NotificationSummary {
  priority?: string;
  moduleName?: string;
  timestamp?: string | number | Date;
  message?: string;
}

type NotificationEmitter = Window['meltdownEmit'];

function requireEmitter(emit: NotificationEmitter): NonNullable<NotificationEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('SHELL_NOTIFICATION_HUB_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function notificationItems(data: unknown): NotificationSummary[] {
  return Array.isArray(data)
    ? data.filter((item): item is NotificationSummary => Boolean(item) && typeof item === 'object')
    : [];
}

export async function fetchRecentNotifications(
  emit: NotificationEmitter,
  jwt: string | null | undefined,
  limit = 5
): Promise<NotificationSummary[]> {
  const meltdownEmit = requireEmitter(emit);
  const data = await emitRuntimeAdmin(meltdownEmit, jwt, 'notifications', 'recent', { limit });
  return notificationItems(data);
}
