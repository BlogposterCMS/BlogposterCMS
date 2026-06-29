export type StyleSourceRole = 'source' | 'follower';

export interface StyleSourceSettings {
  enabled?: boolean;
  role?: StyleSourceRole;
  sourceId?: string;
  syncLayout?: boolean;
  syncDesign?: boolean;
}

type LooseRecord = Record<string, unknown>;

function isRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return undefined;
}

function normalizeId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function normalizeRole(value: unknown): StyleSourceRole | undefined {
  const role = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return role === 'source' || role === 'follower' ? role : undefined;
}

export function normalizeStyleSourceSettings(value: unknown): StyleSourceSettings {
  const source = isRecord(value) ? value : {};
  const settings: StyleSourceSettings = {};
  const enabled = normalizeBoolean(source.enabled ?? source.styleSourceEnabled ?? source.style_source_enabled);
  const role = normalizeRole(source.role ?? source.styleSourceRole ?? source.style_source_role);
  const sourceId = normalizeId(source.sourceId ?? source.source_id ?? source.styleSourceId ?? source.style_source_id);
  const syncLayout = normalizeBoolean(source.syncLayout ?? source.sync_layout);
  const syncDesign = normalizeBoolean(source.syncDesign ?? source.sync_design);

  if (enabled !== undefined) settings.enabled = enabled;
  if (role) settings.role = role;
  if (sourceId) settings.sourceId = sourceId;
  if (syncLayout !== undefined) settings.syncLayout = syncLayout;
  if (syncDesign !== undefined) settings.syncDesign = syncDesign;
  return settings;
}

export function hasStyleSourceSettings(value: StyleSourceSettings | undefined): value is StyleSourceSettings {
  return Boolean(value && Object.keys(value).length > 0);
}
