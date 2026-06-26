type TopHeaderEmitter = Window['meltdownEmit'];

// SettingsManager payloads stay in this data helper so the header UI only
// coordinates controls and visible state.
const MAINTENANCE_SETTING = {
  moduleName: 'settingsManager',
  moduleType: 'core',
  key: 'MAINTENANCE_MODE'
} as const;

const PROJECT_NAME_SETTING = {
  moduleName: 'settingsManager',
  moduleType: 'core',
  key: 'SITE_TITLE'
} as const;

export const PROJECT_NAME_FALLBACK = 'Blogposter';

function requireEmitter(emit: TopHeaderEmitter): NonNullable<TopHeaderEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('SHELL_TOP_HEADER_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function buildMaintenanceSettingPayload(
  jwt: string | null | undefined,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return buildSettingPayload(MAINTENANCE_SETTING, jwt, extra);
}

export function buildProjectNameSettingPayload(
  jwt: string | null | undefined,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return buildSettingPayload(PROJECT_NAME_SETTING, jwt, extra);
}

function buildSettingPayload(
  setting: typeof MAINTENANCE_SETTING | typeof PROJECT_NAME_SETTING,
  jwt: string | null | undefined,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...setting };
  if (jwt) {
    payload.jwt = jwt;
  }
  return Object.assign(payload, extra);
}

export function parseMaintenanceValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const raw = (value as { value?: unknown }).value;
    return typeof raw === 'string' ? raw.toLowerCase() === 'true' : Boolean(raw);
  }
  return false;
}

export function parseSettingText(value: unknown, fallback = PROJECT_NAME_FALLBACK): string {
  const raw = value && typeof value === 'object' && 'value' in value
    ? (value as { value?: unknown }).value
    : value;
  const text = typeof raw === 'string'
    ? raw.trim()
    : raw == null
      ? ''
      : String(raw).trim();
  return text || fallback;
}

export async function fetchMaintenanceMode(
  emit: TopHeaderEmitter,
  jwt: string | null | undefined
): Promise<boolean> {
  const meltdownEmit = requireEmitter(emit);
  const value = await meltdownEmit('getSetting', buildMaintenanceSettingPayload(jwt));
  return parseMaintenanceValue(value);
}

export async function fetchProjectName(
  emit: TopHeaderEmitter,
  jwt: string | null | undefined
): Promise<string> {
  const meltdownEmit = requireEmitter(emit);
  const value = await meltdownEmit('getSetting', buildProjectNameSettingPayload(jwt));
  return parseSettingText(value);
}

export async function disableMaintenanceMode(
  emit: TopHeaderEmitter,
  jwt: string | null | undefined
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('setSetting', buildMaintenanceSettingPayload(jwt, { value: 'false' }));
}
