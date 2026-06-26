export type LooseRecord = Record<string, any>;

export function laneAuthPayload(lane: string): LooseRecord {
  return lane === 'admin'
    ? { jwt: window.ADMIN_TOKEN }
    : { jwt: window.PUBLIC_TOKEN };
}

export function adminLaneAuthPayload(lane: string): LooseRecord {
  return lane === 'admin' ? { jwt: window.ADMIN_TOKEN } : {};
}

export function normalizeLayoutResponse(response: unknown): LooseRecord[] {
  const source = response && typeof response === 'object'
    ? response as LooseRecord
    : {};
  return Array.isArray(source.layout) ? source.layout : [];
}

export function normalizeDataList(response: unknown): LooseRecord[] {
  if (Array.isArray(response)) return response;
  const source = response && typeof response === 'object'
    ? response as LooseRecord
    : {};
  return Array.isArray(source.data) ? source.data : [];
}

export function unwrapData(response: unknown): any {
  return response && typeof response === 'object' && 'data' in response
    ? (response as LooseRecord).data
    : response;
}

export function resolveRuntimeWidgetLane(
  lane: string,
  config: LooseRecord = {},
  warn: (...args: any[]) => void = console.warn
): string {
  const requestedLane = lane === 'admin'
    ? (config.widgetLane || 'admin')
    : (config.widgetLane || 'public');
  if (lane !== 'admin' && requestedLane === 'admin') {
    warn('[Renderer] widgetLane="admin" on public page => forcing "public"');
    return 'public';
  }
  return lane === 'admin' ? requestedLane : 'public';
}
