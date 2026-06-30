import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';

export interface FontProvider {
  name: string;
  description?: string;
  isEnabled?: boolean;
}

export interface FontProvidersState {
  providers: FontProvider[];
  googleFontsKey: string;
}

type FontsEmitter = Window['meltdownEmit'];

function requireEmitter(emit: FontsEmitter): NonNullable<FontsEmitter> {
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

export function toProviders(value: unknown): FontProvider[] {
  return toArray(value).filter((item): item is FontProvider => (
    Boolean(item) &&
    typeof item === 'object' &&
    typeof (item as FontProvider).name === 'string'
  ));
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function fetchFontProviders(
  emit: FontsEmitter,
  jwt: string | null | undefined
): Promise<FontProvider[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'fonts', 'listProviders');
  return toProviders(res);
}

export async function fetchGoogleFontsKey(
  emit: FontsEmitter,
  jwt: string | null | undefined
): Promise<string> {
  const meltdownEmit = requireEmitter(emit);
  try {
    const keyRes = await emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', {
      key: 'GOOGLE_FONTS_API_KEY'
    });
    return String(keyRes || '').trim();
  } catch {
    return '';
  }
}

export async function fetchFontProvidersState(
  emit: FontsEmitter,
  jwt: string | null | undefined
): Promise<FontProvidersState> {
  const [providers, googleFontsKey] = await Promise.all([
    fetchFontProviders(emit, jwt),
    fetchGoogleFontsKey(emit, jwt)
  ]);
  return { providers, googleFontsKey };
}

export async function setFontProviderEnabled(
  emit: FontsEmitter,
  jwt: string | null | undefined,
  providerName: string,
  enabled: boolean
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'fonts', 'setProviderEnabled', {
    providerName,
    enabled
  });
}

export async function saveGoogleFontsKey(
  emit: FontsEmitter,
  jwt: string | null | undefined,
  value: string
): Promise<string> {
  const nextKey = value.trim();
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'set', {
    key: 'GOOGLE_FONTS_API_KEY',
    value: nextKey
  });
  return nextKey;
}

export async function refreshFontProviderCatalog(
  emit: FontsEmitter,
  jwt: string | null | undefined,
  providerName: string,
  wasEnabled: boolean
): Promise<void> {
  if (wasEnabled) {
    await setFontProviderEnabled(emit, jwt, providerName, false);
  }
  await setFontProviderEnabled(emit, jwt, providerName, true);
}
