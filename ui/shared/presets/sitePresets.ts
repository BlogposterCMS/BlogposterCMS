import {
  emitRuntimeAdmin,
  type MeltdownEmitter
} from '/ui/shared/api-client/runtimeFacade.js';
import type { ColorScheme } from '/ui/shared/colors/colorLibrary.js';
import type { FontPackage } from '/ui/shared/fonts/fontPackages.js';

export interface SitePresetDemoElement {
  presetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SitePresetPageDemo {
  id: string;
  name: string;
  scene: {
    title: string;
    background: string;
  };
  elements: SitePresetDemoElement[];
}

export interface SitePreset {
  schemaVersion: number;
  id: string;
  name: string;
  version: string;
  developer: string;
  source: 'installed' | 'user';
  builderSettings: {
    layoutMode: 'free' | 'stack' | 'row' | 'grid';
    gap: number;
    padding: number;
    sceneBackground: string;
  };
  colorScheme: ColorScheme;
  fontPackage: FontPackage;
  pageDemos: SitePresetPageDemo[];
}

export interface SitePresetsSnapshot {
  version: number;
  lastAppliedId: string;
  presets: SitePreset[];
}

export interface SitePresetApplyResult {
  applied: boolean;
  preset: SitePreset;
  builderSettings: SitePreset['builderSettings'];
  pageDemos: SitePresetPageDemo[];
}

interface SitePresetTransport {
  emit: NonNullable<MeltdownEmitter>;
  token: string | null | undefined;
}

interface SitePresetMutationResponse {
  preset?: SitePreset;
  library?: SitePresetsSnapshot;
}

type SitePresetStatus = 'idle' | 'loading' | 'ready' | 'error';
type SitePresetListener = (snapshot: SitePresetsSnapshot) => void;

let transport: SitePresetTransport | null = null;
let snapshot: SitePresetsSnapshot = {
  version: 1,
  lastAppliedId: '',
  presets: []
};
let status: SitePresetStatus = 'idle';
let lastErrorCode = '';
const listeners = new Set<SitePresetListener>();

function normalizedId(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeSitePreset(value: unknown): SitePreset | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = normalizedId(source.id);
  const name = String(source.name || '').trim();
  if (!id || !name) return null;
  return source as unknown as SitePreset;
}

export function normalizeSitePresetsSnapshot(value: unknown): SitePresetsSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { version: 1, lastAppliedId: '', presets: [] };
  }
  const source = value as Record<string, unknown>;
  const presets = Array.isArray(source.presets)
    ? source.presets.map(normalizeSitePreset).filter((preset): preset is SitePreset => Boolean(preset))
    : [];
  const lastAppliedId = normalizedId(source.lastAppliedId);
  return {
    version: 1,
    lastAppliedId: presets.some(preset => preset.id === lastAppliedId) ? lastAppliedId : '',
    presets
  };
}

function errorCode(error: unknown): string {
  const explicit = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  if (explicit) return explicit;
  const match = String(error instanceof Error ? error.message : error || '').match(/(SITE_PRESETS_[A-Z_]+)/);
  return match?.[1] || 'SITE_PRESETS_REQUEST_FAILED';
}

function publish(value: unknown): SitePresetsSnapshot {
  snapshot = normalizeSitePresetsSnapshot(value);
  status = 'ready';
  lastErrorCode = '';
  listeners.forEach(listener => listener(getSitePresetsSnapshot()));
  document.dispatchEvent(new CustomEvent('bp:site-presets-changed', {
    detail: getSitePresetsSnapshot()
  }));
  return getSitePresetsSnapshot();
}

function requireTransport(): SitePresetTransport {
  if (!transport) {
    throw new Error('SITE_PRESETS_CLIENT_NOT_CONFIGURED: Configure the Site Presets client first.');
  }
  return transport;
}

export function configureSitePresetsClient(next: SitePresetTransport): void {
  if (!next || typeof next.emit !== 'function') {
    throw new Error('SITE_PRESETS_EMITTER_UNAVAILABLE: A meltdown emitter is required.');
  }
  transport = next;
}

export function getSitePresetsSnapshot(): SitePresetsSnapshot {
  return {
    version: snapshot.version,
    lastAppliedId: snapshot.lastAppliedId,
    // Site Preset payloads are strictly JSON data, so this also supports
    // browser/test environments that do not expose structuredClone yet.
    presets: snapshot.presets.map(preset => JSON.parse(JSON.stringify(preset)) as SitePreset)
  };
}

export function subscribeSitePresets(listener: SitePresetListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function sitePresetsAgentState(): Record<string, unknown> {
  return {
    status,
    version: snapshot.version,
    presetCount: snapshot.presets.length,
    lastAppliedId: snapshot.lastAppliedId || null,
    presets: snapshot.presets.map(preset => ({
      id: preset.id,
      name: preset.name,
      source: preset.source,
      colorScheme: preset.colorScheme?.name || null,
      fontPackage: preset.fontPackage?.name || null,
      pageDemos: (preset.pageDemos || []).map(demo => ({ id: demo.id, name: demo.name }))
    })),
    errorCode: lastErrorCode || null
  };
}

export async function refreshSitePresets(): Promise<SitePresetsSnapshot> {
  const current = requireTransport();
  status = 'loading';
  try {
    const result = await emitRuntimeAdmin<SitePresetsSnapshot>(
      current.emit,
      current.token,
      'sitePresets',
      'list'
    );
    return publish(result);
  } catch (error) {
    status = 'error';
    lastErrorCode = errorCode(error);
    throw error;
  }
}

async function mutate(
  action: 'create' | 'delete',
  params: Record<string, unknown>
): Promise<SitePresetMutationResponse> {
  const current = requireTransport();
  try {
    const result = await emitRuntimeAdmin<SitePresetMutationResponse>(
      current.emit,
      current.token,
      'sitePresets',
      action,
      params
    );
    if (result.library) publish(result.library);
    return result;
  } catch (error) {
    status = 'error';
    lastErrorCode = errorCode(error);
    throw error;
  }
}

export async function createSitePreset(preset: Record<string, unknown>): Promise<SitePreset | null> {
  const result = await mutate('create', { preset });
  return result.preset || null;
}

export async function deleteSitePreset(id: string): Promise<SitePreset | null> {
  const result = await mutate('delete', { id });
  return result.preset || null;
}

export async function applySitePreset(id: string): Promise<SitePresetApplyResult> {
  const current = requireTransport();
  try {
    const result = await emitRuntimeAdmin<SitePresetApplyResult>(
      current.emit,
      current.token,
      'sitePresets',
      'apply',
      { id }
    );
    await refreshSitePresets();
    return result;
  } catch (error) {
    status = 'error';
    lastErrorCode = errorCode(error);
    throw error;
  }
}
