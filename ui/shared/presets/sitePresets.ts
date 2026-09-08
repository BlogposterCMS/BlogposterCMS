import {
  emitRuntimeAdmin,
  type MeltdownEmitter
} from '/ui/shared/api-client/runtimeFacade.js';
import type { ColorScheme } from '/ui/shared/colors/colorLibrary.js';
import type { FontPackage } from '/ui/shared/fonts/fontPackages.js';
import { normalizeKitComponents, componentSupported, type KitComponent } from '../design-system/componentDefinitions.js';

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
  components?: KitComponent[];
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

export function sitePresetsAgentState(kitId = snapshot.lastAppliedId || 'site-preset-default'): Record<string, unknown> {
  const kit = snapshot.presets.find(preset => preset.id === kitId);
  return {
    status,
    version: snapshot.version,
    presetCount: snapshot.presets.length,
    lastAppliedId: snapshot.lastAppliedId || null,
    // Keep the catalog shallow enough for AgentManager's existing depth/array limits.
    componentKitId: kit?.id || null,
    components: (kit?.components || []).map(component => ({ id: component.id, name: component.name, type: component.type, supported: componentSupported(component) })),
    presets: snapshot.presets.map(preset => ({
      id: preset.id,
      name: preset.name,
      source: preset.source,
      componentCount: preset.components?.length || 0,
      colorScheme: preset.colorScheme?.name || null,
      fontPackage: preset.fontPackage?.name || null,
      pageDemos: (preset.pageDemos || []).map(demo => ({ id: demo.id, name: demo.name }))
    })),
    errorCode: lastErrorCode || null
  };
}

/** Agents request one definition only when its props or styles need inspection. */
export function sitePresetComponentJson(componentId: string, kitId = snapshot.lastAppliedId || 'site-preset-default'): string {
  const component = snapshot.presets.find(kit => kit.id === kitId)?.components?.find(entry => entry.id === componentId);
  if (!component) throw new Error('UI_KIT_COMPONENT_NOT_FOUND: Select an existing kit/component id.');
  return JSON.stringify(component);
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
    if (result.library) publish({ ...result.library, lastAppliedId: result.library.lastAppliedId ?? snapshot.lastAppliedId });
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

/** Portable UI kits use the existing declarative Site Preset schema. */
export function exportSitePresetJson(id: string): string {
  const preset = snapshot.presets.find(entry => entry.id === id);
  if (!preset) throw new Error('SITE_PRESETS_NOT_FOUND: Select a UI kit to export.');
  const { schemaVersion, name, version, developer, builderSettings, colorScheme, fontPackage, pageDemos } = preset;
  // Installation ids and timestamps do not travel; import always creates a kit.
  return JSON.stringify({ schemaVersion, name, version, developer, builderSettings, colorScheme, fontPackage, pageDemos, components: preset.components }, null, 2);
}

export function parseSitePresetJson(json: string): Record<string, unknown> {
  if (typeof json !== 'string' || new TextEncoder().encode(json).length > 524288) {
    throw new Error('SITE_PRESETS_JSON_SIZE: UI kit JSON must be smaller than 512 KB.');
  }
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('SITE_PRESETS_JSON_INVALID: Enter valid UI kit JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as Record<string, unknown>).schemaVersion !== 1) {
    throw new Error('SITE_PRESETS_JSON_VERSION: UI kit schemaVersion must be 1.');
  }
  const source = value as Record<string, unknown>;
  if (source.components !== undefined) source.components = normalizeKitComponents(source.components);
  return source;
}

export async function importSitePresetJson(json: string): Promise<SitePreset | null> {
  // The domain validates all properties, trusted component ids and permissions.
  // Importing a kit does not activate its colors/fonts or replace the document.
  return createSitePreset(parseSitePresetJson(json));
}

/** AgentManager bounds each string to 4000 characters and arrays to 80 items.
 * Transport JSON as small base64 parts so trimming/control-character cleanup
 * cannot corrupt the document. This stays on the existing command contract. */
export function sitePresetJsonParts(json: string): string[] {
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > 180000) throw new Error('SITE_PRESETS_AGENT_JSON_SIZE: Use the UI JSON importer for kits larger than 180 KB.');
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary).match(/.{1,3000}/g) || [];
}

export function sitePresetJsonFromParts(parts: unknown): string {
  if (!Array.isArray(parts) || !parts.length || parts.length > 80
    || parts.some(part => typeof part !== 'string' || !part.length || part.length > 3000 || !/^[A-Za-z0-9+/=]+$/.test(part))) {
    throw new Error('SITE_PRESETS_AGENT_JSON_INVALID: Provide at most 80 base64 parts of 3000 characters each.');
  }
  try {
    const bytes = Uint8Array.from(atob(parts.join('')), char => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { throw new Error('SITE_PRESETS_AGENT_JSON_INVALID: UI kit parts must encode UTF-8 JSON.'); }
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
