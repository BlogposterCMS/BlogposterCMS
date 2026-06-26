export interface PageRecord {
  id?: string | number;
  slug?: string;
  title?: string;
  lane?: string;
  [key: string]: unknown;
}

export interface GeneralSettingsState {
  siteTitle: string;
  siteDescription: string;
}

export interface DesignSettingsState {
  faviconUrl: string;
  googleFontsApiKey: string;
}

export interface SeoSettingsState {
  metaDescription: string;
  titleTemplate: string;
  indexingEnabled: boolean;
}

export interface SecuritySettingsState {
  allowRegistration: boolean;
  firstInstallDone: boolean;
  maintenanceMode: boolean;
  maintenancePageId: string;
  publicPages: PageRecord[];
}

type SettingsPanelsEmitter = Window['meltdownEmit'];

type SettingKey =
  | 'SITE_TITLE'
  | 'SITE_DESC'
  | 'FAVICON_URL'
  | 'GOOGLE_FONTS_API_KEY'
  | 'SEO_META_DESCRIPTION'
  | 'SEO_TITLE_TEMPLATE'
  | 'SEO_INDEXING_ENABLED'
  | 'ALLOW_REGISTRATION'
  | 'FIRST_INSTALL_DONE'
  | 'MAINTENANCE_MODE'
  | 'MAINTENANCE_PAGE_ID';

const SETTINGS_MODULE = {
  moduleName: 'settingsManager',
  moduleType: 'core'
} as const;

const PAGES_MODULE = {
  moduleName: 'pagesManager',
  moduleType: 'core'
} as const;

function requireEmitter(emit: SettingsPanelsEmitter): NonNullable<SettingsPanelsEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_SETTINGS_PANELS_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function asSetting(value: unknown): string {
  return value == null ? '' : String(value);
}

export function boolToString(value: boolean): 'true' | 'false' {
  return value ? 'true' : 'false';
}

export function stringToBool(value: unknown): boolean {
  return String(value).toLowerCase() === 'true';
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toPages(value: unknown): PageRecord[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : [];
  return items.filter((item): item is PageRecord => Boolean(item) && typeof item === 'object');
}

export function publicPages(value: unknown): PageRecord[] {
  return toPages(value).filter(page => page.lane === 'public');
}

export async function fetchSettingValue(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined,
  key: SettingKey
): Promise<string> {
  const meltdownEmit = requireEmitter(emit);
  const value = await meltdownEmit('getSetting', {
    jwt,
    ...SETTINGS_MODULE,
    key
  });
  return asSetting(value);
}

export async function saveSettingValue(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined,
  key: SettingKey,
  value: string
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('setSetting', {
    jwt,
    ...SETTINGS_MODULE,
    key,
    value
  });
}

export async function fetchSettingValues<K extends SettingKey>(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined,
  keys: readonly K[]
): Promise<Record<K, string>> {
  const entries = await Promise.all(keys.map(async key => [
    key,
    await fetchSettingValue(emit, jwt, key)
  ] as const));
  return Object.fromEntries(entries) as Record<K, string>;
}

export async function saveSettingValues(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined,
  values: Partial<Record<SettingKey, string>>
): Promise<void> {
  await Promise.all(Object.entries(values).map(([key, value]) => (
    saveSettingValue(emit, jwt, key as SettingKey, value ?? '')
  )));
}

export async function fetchGeneralSettings(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined
): Promise<GeneralSettingsState> {
  const values = await fetchSettingValues(emit, jwt, ['SITE_TITLE', 'SITE_DESC']);
  return {
    siteTitle: values.SITE_TITLE,
    siteDescription: values.SITE_DESC
  };
}

export async function saveGeneralSettings(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined,
  values: GeneralSettingsState
): Promise<void> {
  await saveSettingValues(emit, jwt, {
    SITE_TITLE: values.siteTitle,
    SITE_DESC: values.siteDescription
  });
}

export async function fetchDesignSettings(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined
): Promise<DesignSettingsState> {
  const values = await fetchSettingValues(emit, jwt, ['FAVICON_URL', 'GOOGLE_FONTS_API_KEY']);
  return {
    faviconUrl: values.FAVICON_URL,
    googleFontsApiKey: values.GOOGLE_FONTS_API_KEY
  };
}

export async function saveFaviconUrl(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined,
  value: string
): Promise<void> {
  await saveSettingValue(emit, jwt, 'FAVICON_URL', value);
}

export async function saveGoogleFontsApiKey(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined,
  value: string
): Promise<void> {
  await saveSettingValue(emit, jwt, 'GOOGLE_FONTS_API_KEY', value);
}

export async function pickMediaShareUrl(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined
): Promise<string | null> {
  const meltdownEmit = requireEmitter(emit);
  const picked = await meltdownEmit('openMediaExplorer', { jwt });
  if (
    picked &&
    typeof picked === 'object' &&
    !(picked as { cancelled?: unknown }).cancelled &&
    typeof (picked as { shareURL?: unknown }).shareURL === 'string'
  ) {
    return (picked as { shareURL: string }).shareURL;
  }
  return null;
}

export async function fetchSeoSettings(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined
): Promise<SeoSettingsState> {
  const values = await fetchSettingValues(emit, jwt, [
    'SEO_META_DESCRIPTION',
    'SEO_TITLE_TEMPLATE',
    'SEO_INDEXING_ENABLED'
  ]);
  return {
    metaDescription: values.SEO_META_DESCRIPTION,
    titleTemplate: values.SEO_TITLE_TEMPLATE,
    indexingEnabled: values.SEO_INDEXING_ENABLED === '' ? true : stringToBool(values.SEO_INDEXING_ENABLED)
  };
}

export async function saveSeoSettings(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined,
  values: SeoSettingsState
): Promise<void> {
  await saveSettingValues(emit, jwt, {
    SEO_TITLE_TEMPLATE: values.titleTemplate,
    SEO_META_DESCRIPTION: values.metaDescription,
    SEO_INDEXING_ENABLED: boolToString(values.indexingEnabled)
  });
}

export async function fetchAllPages(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined
): Promise<PageRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('getAllPages', {
    jwt,
    ...PAGES_MODULE
  });
  return toPages(res);
}

export async function fetchSecuritySettings(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined
): Promise<SecuritySettingsState> {
  const [pages, values] = await Promise.all([
    fetchAllPages(emit, jwt),
    fetchSettingValues(emit, jwt, [
      'ALLOW_REGISTRATION',
      'FIRST_INSTALL_DONE',
      'MAINTENANCE_MODE',
      'MAINTENANCE_PAGE_ID'
    ])
  ]);

  return {
    allowRegistration: stringToBool(values.ALLOW_REGISTRATION),
    firstInstallDone: stringToBool(values.FIRST_INSTALL_DONE),
    maintenanceMode: stringToBool(values.MAINTENANCE_MODE),
    maintenancePageId: values.MAINTENANCE_PAGE_ID,
    publicPages: publicPages(pages)
  };
}

export async function saveAllowRegistration(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined,
  value: boolean
): Promise<void> {
  await saveSettingValue(emit, jwt, 'ALLOW_REGISTRATION', boolToString(value));
}

export async function saveMaintenanceSettings(
  emit: SettingsPanelsEmitter,
  jwt: string | null | undefined,
  maintenanceMode: boolean,
  maintenancePageId: string
): Promise<void> {
  await saveSettingValues(emit, jwt, {
    MAINTENANCE_MODE: boolToString(maintenanceMode),
    MAINTENANCE_PAGE_ID: maintenancePageId
  });
}
