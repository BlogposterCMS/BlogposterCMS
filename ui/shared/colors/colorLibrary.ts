import {
  emitRuntimeAdmin,
  emitRuntimePublic,
  type MeltdownEmitter
} from '/ui/shared/api-client/runtimeFacade.js';

export interface SavedColor {
  id: string;
  name: string;
  value: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ColorScheme {
  id: string;
  name: string;
  colors: SavedColor[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ColorLibrarySnapshot {
  version: number;
  activeSchemeId: string;
  schemes: ColorScheme[];
  colors: SavedColor[];
}

export interface ColorPickerSavedColor extends SavedColor {
  cssValue: string;
}

export interface LinkedColorReference {
  id: string;
  fallback: string;
}

type ColorLibraryLane = 'admin' | 'public';
type ColorLibraryStatus = 'idle' | 'loading' | 'ready' | 'error';
type ColorLibraryListener = (snapshot: ColorLibrarySnapshot) => void;

interface ColorLibraryTransport {
  emit: NonNullable<MeltdownEmitter>;
  token: string | null | undefined;
  lane: ColorLibraryLane;
}

interface ColorLibraryMutationResponse {
  library?: ColorLibrarySnapshot;
  color?: SavedColor;
  scheme?: ColorScheme;
  linkedUsesKeepFallback?: boolean;
}

const TOKEN_STYLE_ID = 'bp-color-library-tokens';
const LINKED_COLOR_PATTERN = /^var\(\s*--bp-color-([a-z0-9-]+)\s*,\s*(#[0-9a-f]{6}(?:[0-9a-f]{2})?)\s*\)$/i;
const HEX_PATTERN = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

let transport: ColorLibraryTransport | null = null;
let snapshot: ColorLibrarySnapshot = {
  version: 2,
  activeSchemeId: '',
  schemes: [],
  colors: []
};
let status: ColorLibraryStatus = 'idle';
let lastErrorCode = '';
const listeners = new Set<ColorLibraryListener>();

function normalizedId(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function normalizedHex(value: unknown): string {
  const hex = String(value || '').trim().toUpperCase();
  return HEX_PATTERN.test(hex) ? hex : '#000000';
}

function normalizeSavedColor(value: unknown): SavedColor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = normalizedId(source.id);
  const name = String(source.name || '').replace(/\s+/g, ' ').trim();
  const colorValue = normalizedHex(source.value);
  if (!id || !name) return null;
  return {
    id,
    name,
    value: colorValue,
    ...(typeof source.createdAt === 'string' ? { createdAt: source.createdAt } : {}),
    ...(typeof source.updatedAt === 'string' ? { updatedAt: source.updatedAt } : {})
  };
}

function normalizeColorScheme(value: unknown): ColorScheme | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = normalizedId(source.id);
  const name = String(source.name || '').replace(/\s+/g, ' ').trim();
  const colors = Array.isArray(source.colors)
    ? source.colors.map(normalizeSavedColor).filter((color): color is SavedColor => Boolean(color))
    : [];
  if (!id || !name || !colors.length) return null;
  return {
    id,
    name,
    colors,
    ...(typeof source.createdAt === 'string' ? { createdAt: source.createdAt } : {}),
    ...(typeof source.updatedAt === 'string' ? { updatedAt: source.updatedAt } : {})
  };
}

export function normalizeColorLibrarySnapshot(value: unknown): ColorLibrarySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { version: 2, activeSchemeId: '', schemes: [], colors: [] };
  }
  const source = value as Record<string, unknown>;
  const schemes = Array.isArray(source.schemes)
    ? source.schemes.map(normalizeColorScheme).filter((scheme): scheme is ColorScheme => Boolean(scheme))
    : [];
  const requestedActiveId = normalizedId(source.activeSchemeId);
  const activeScheme = schemes.find(scheme => scheme.id === requestedActiveId) || schemes[0] || null;
  const colors = activeScheme?.colors || (
    Array.isArray(source.colors)
      ? source.colors.map(normalizeSavedColor).filter((color): color is SavedColor => Boolean(color))
      : []
  );
  return {
    version: 2,
    activeSchemeId: activeScheme?.id || '',
    schemes,
    colors
  };
}

export function colorTokenName(id: string): string {
  const safeId = normalizedId(id);
  if (!safeId) {
    throw new Error('COLOR_LIBRARY_INVALID_ID: A saved color id is required.');
  }
  return `--bp-color-${safeId}`;
}

export function linkedColorValue(color: Pick<SavedColor, 'id' | 'value'>): string {
  return `var(${colorTokenName(color.id)}, ${normalizedHex(color.value)})`;
}

export function parseLinkedColorValue(value: unknown): LinkedColorReference | null {
  const match = String(value || '').trim().match(LINKED_COLOR_PATTERN);
  return match
    ? { id: normalizedId(match[1]), fallback: normalizedHex(match[2]) }
    : null;
}

export function applyColorLibraryVariables(
  library: ColorLibrarySnapshot = snapshot,
  documentRef: Document = document
): HTMLStyleElement {
  let style = documentRef.getElementById(TOKEN_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = documentRef.createElement('style');
    style.id = TOKEN_STYLE_ID;
    style.dataset.colorLibrary = 'true';
    documentRef.head.appendChild(style);
  }
  const declarations = library.colors
    .map(color => `  ${colorTokenName(color.id)}: ${normalizedHex(color.value)};`)
    .join('\n');
  style.textContent = declarations ? `:root {\n${declarations}\n}` : '';
  documentRef.documentElement.dataset.bpColorLibraryReady = 'true';
  return style;
}

function errorCode(error: unknown): string {
  const explicit = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  if (explicit) return explicit;
  const match = String(error instanceof Error ? error.message : error || '').match(/(COLOR_LIBRARY_[A-Z_]+)/);
  return match?.[1] || 'COLOR_LIBRARY_REQUEST_FAILED';
}

function publish(next: ColorLibrarySnapshot): ColorLibrarySnapshot {
  snapshot = normalizeColorLibrarySnapshot(next);
  status = 'ready';
  lastErrorCode = '';
  applyColorLibraryVariables(snapshot);
  listeners.forEach(listener => listener(snapshot));
  document.dispatchEvent(new CustomEvent('bp:color-library-changed', {
    detail: snapshot
  }));
  return snapshot;
}

function requireTransport(): ColorLibraryTransport {
  if (!transport) {
    throw new Error('COLOR_LIBRARY_CLIENT_NOT_CONFIGURED: Configure the color library client first.');
  }
  return transport;
}

export function configureColorLibraryClient(next: ColorLibraryTransport): void {
  if (!next || typeof next.emit !== 'function') {
    throw new Error('COLOR_LIBRARY_EMITTER_UNAVAILABLE: A meltdown emitter is required.');
  }
  transport = next;
}

export function getColorLibrarySnapshot(): ColorLibrarySnapshot {
  return {
    version: snapshot.version,
    activeSchemeId: snapshot.activeSchemeId,
    schemes: snapshot.schemes.map(scheme => ({
      ...scheme,
      colors: scheme.colors.map(color => ({ ...color }))
    })),
    colors: snapshot.colors.map(color => ({ ...color }))
  };
}

export function getActiveColorScheme(): ColorScheme | null {
  const scheme = snapshot.schemes.find(entry => entry.id === snapshot.activeSchemeId)
    || snapshot.schemes[0]
    || null;
  return scheme
    ? { ...scheme, colors: scheme.colors.map(color => ({ ...color })) }
    : null;
}

export function getColorPickerSavedColors(): ColorPickerSavedColor[] {
  return snapshot.colors.map(color => ({
    ...color,
    cssValue: linkedColorValue(color)
  }));
}

export function colorLibraryAgentState(): Record<string, unknown> {
  return {
    status,
    version: snapshot.version,
    schemeCount: snapshot.schemes.length,
    activeSchemeId: snapshot.activeSchemeId || null,
    activeSchemeName: getActiveColorScheme()?.name || null,
    schemes: snapshot.schemes.map(scheme => ({
      id: scheme.id,
      name: scheme.name,
      active: scheme.id === snapshot.activeSchemeId,
      slotCount: scheme.colors.length
    })),
    colorCount: snapshot.colors.length,
    defaultSlots: snapshot.colors.map((color, index) => ({
      id: color.id,
      slot: index + 1,
      name: color.name,
      value: color.value,
      token: colorTokenName(color.id)
    })),
    errorCode: lastErrorCode || null
  };
}

export function subscribeColorLibrary(listener: ColorLibraryListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshColorLibrary(): Promise<ColorLibrarySnapshot> {
  const current = requireTransport();
  status = 'loading';
  try {
    const result = current.lane === 'admin'
      ? await emitRuntimeAdmin<ColorLibrarySnapshot>(
        current.emit,
        current.token,
        'colors',
        'list'
      )
      : await emitRuntimePublic<ColorLibrarySnapshot>(
        current.emit,
        current.token,
        'colors',
        'list'
      );
    return publish(result);
  } catch (error) {
    status = 'error';
    lastErrorCode = errorCode(error);
    throw error;
  }
}

async function mutateColorLibrary(
  action: 'create' | 'update' | 'delete' | 'createScheme' | 'updateScheme' | 'activateScheme' | 'deleteScheme',
  params: Record<string, unknown>
): Promise<ColorLibraryMutationResponse> {
  const current = requireTransport();
  if (current.lane !== 'admin') {
    throw new Error('COLOR_LIBRARY_ADMIN_REQUIRED: Saved colors can only be changed from an admin surface.');
  }
  try {
    const result = await emitRuntimeAdmin<ColorLibraryMutationResponse>(
      current.emit,
      current.token,
      'colors',
      action,
      params
    );
    if (result?.library) publish(result.library);
    return result;
  } catch (error) {
    status = 'error';
    lastErrorCode = errorCode(error);
    throw error;
  }
}

export async function createLibraryColor(input: {
  name: string;
  value: string;
  schemeId?: string;
}): Promise<SavedColor | null> {
  const result = await mutateColorLibrary('create', input);
  return result.color || null;
}

export async function updateLibraryColor(input: {
  id: string;
  name?: string;
  value?: string;
  schemeId?: string;
}): Promise<SavedColor | null> {
  const result = await mutateColorLibrary('update', input);
  return result.color || null;
}

export async function deleteLibraryColor(
  id: string,
  schemeId?: string
): Promise<ColorLibraryMutationResponse> {
  return mutateColorLibrary('delete', { id, schemeId });
}

export async function createColorScheme(input: {
  name: string;
  copyFromId?: string;
}): Promise<ColorScheme | null> {
  const result = await mutateColorLibrary('createScheme', input);
  return result.scheme || null;
}

export async function renameColorScheme(id: string, name: string): Promise<ColorScheme | null> {
  const result = await mutateColorLibrary('updateScheme', { id, name });
  return result.scheme || null;
}

export async function activateColorScheme(id: string): Promise<ColorScheme | null> {
  const result = await mutateColorLibrary('activateScheme', { id });
  return result.scheme || null;
}

export async function deleteColorScheme(id: string): Promise<ColorLibraryMutationResponse> {
  return mutateColorLibrary('deleteScheme', { id });
}
