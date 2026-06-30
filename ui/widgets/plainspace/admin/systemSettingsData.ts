import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';

export interface PageRecord {
  id?: string | number;
  lane?: string;
  title?: string;
}

export interface SystemSettingsState {
  siteTitle: string;
  siteDescription: string;
  maintenanceMode: boolean;
  maintenancePageId: string;
  maintenancePage?: PageRecord;
  faviconUrl: string;
  pages: PageRecord[];
  googleFontsApiKey: string;
}

export type SystemSettingKey =
  | 'SITE_TITLE'
  | 'SITE_DESC'
  | 'MAINTENANCE_MODE'
  | 'MAINTENANCE_PAGE_ID'
  | 'FAVICON_URL'
  | 'GOOGLE_FONTS_API_KEY';

type SystemSettingsEmitter = Window['meltdownEmit'];

function requireEmitter(emit: SystemSettingsEmitter): NonNullable<SystemSettingsEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('meltdownEmit unavailable');
  }
  return emit;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: unknown[] }).data;
  }
  return [];
}

export function toPages(value: unknown): PageRecord[] {
  return toArray(value).filter((item): item is PageRecord => Boolean(item) && typeof item === 'object');
}

export function asSetting(value: unknown): string {
  return value == null ? '' : String(value);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function fetchSystemSettings(
  emit: SystemSettingsEmitter,
  jwt: string | null | undefined
): Promise<SystemSettingsState> {
  const meltdownEmit = requireEmitter(emit);
  const [title, desc, isMaint, pageId, faviconUrl, pagesRes, googleFontsKey] = await Promise.all([
    emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: 'SITE_TITLE' }),
    emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: 'SITE_DESC' }),
    emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: 'MAINTENANCE_MODE' }),
    emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: 'MAINTENANCE_PAGE_ID' }),
    emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: 'FAVICON_URL' }),
    emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'list'),
    emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: 'GOOGLE_FONTS_API_KEY' })
  ]);
  const pages = toPages(pagesRes);
  const maintenancePageId = asSetting(pageId);

  return {
    siteTitle: asSetting(title),
    siteDescription: asSetting(desc),
    maintenanceMode: asSetting(isMaint) === 'true',
    maintenancePageId,
    maintenancePage: pages.find(page => String(page.id) === maintenancePageId),
    faviconUrl: asSetting(faviconUrl),
    pages,
    googleFontsApiKey: asSetting(googleFontsKey).trim()
  };
}

export async function setSystemSetting(
  emit: SystemSettingsEmitter,
  jwt: string | null | undefined,
  key: SystemSettingKey,
  value: string
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'set', {
    key,
    value
  });
}

export async function pickFaviconUrl(
  emit: SystemSettingsEmitter,
  jwt: string | null | undefined
): Promise<string | null> {
  const meltdownEmit = requireEmitter(emit);
  const result = await meltdownEmit('openMediaExplorer', { jwt });
  const shareURL = result && typeof result === 'object' ? (result as { shareURL?: string }).shareURL : '';
  const cancelled = result && typeof result === 'object' ? Boolean((result as { cancelled?: unknown }).cancelled) : false;
  return !cancelled && shareURL ? shareURL : null;
}
