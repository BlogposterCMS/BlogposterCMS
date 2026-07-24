import {
  emitRuntimeAdmin,
  emitRuntimePublic,
  type MeltdownEmitter
} from '/ui/shared/api-client/runtimeFacade.js';

export const FONT_PACKAGE_ROLES = [
  'body',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'paragraph',
  'link',
  'button',
  'label',
  'small',
  'blockquote',
  'code'
] as const;

export type FontPackageRole = typeof FONT_PACKAGE_ROLES[number];

export interface FontRoleStyles {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  color: string;
  fontStyle: string;
  textTransform: string;
  textDecoration: string;
}

export interface FontPackage {
  id: string;
  name: string;
  roles: Record<FontPackageRole, FontRoleStyles>;
  createdAt?: string;
  updatedAt?: string;
}

export interface FontPackagesSnapshot {
  version: number;
  activePackageId: string;
  packages: FontPackage[];
}

interface PublicFontPackageResponse {
  version?: unknown;
  activePackage?: unknown;
}

interface FontPackageMutationResponse {
  library?: FontPackagesSnapshot;
  package?: FontPackage;
  role?: FontPackageRole;
  roleStyles?: FontRoleStyles;
}

type FontPackagesLane = 'admin' | 'public';
type FontPackagesStatus = 'idle' | 'loading' | 'ready' | 'error';
type FontPackagesListener = (snapshot: FontPackagesSnapshot) => void;

interface FontPackagesTransport {
  emit: NonNullable<MeltdownEmitter>;
  token: string | null | undefined;
  lane: FontPackagesLane;
}

const TOKEN_STYLE_ID = 'bp-font-package-tokens';
const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{7,79}$/;
const SAFE_CSS_VALUE_PATTERN = /^[^{};<>\r\n]+$/;
const CSS_FONT_FAMILY_KEYWORDS = new Set([
  'inherit',
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace'
]);
const ROLE_SELECTORS: Record<FontPackageRole, string[]> = {
  body: [
    '.builder-themed',
    ':root[data-bp-font-packages-lane="public"] #content'
  ],
  h1: [
    '.builder-themed h1',
    ':root[data-bp-font-packages-lane="public"] #content h1'
  ],
  h2: [
    '.builder-themed h2',
    ':root[data-bp-font-packages-lane="public"] #content h2'
  ],
  h3: [
    '.builder-themed h3',
    ':root[data-bp-font-packages-lane="public"] #content h3'
  ],
  h4: [
    '.builder-themed h4',
    ':root[data-bp-font-packages-lane="public"] #content h4'
  ],
  h5: [
    '.builder-themed h5',
    ':root[data-bp-font-packages-lane="public"] #content h5'
  ],
  h6: [
    '.builder-themed h6',
    ':root[data-bp-font-packages-lane="public"] #content h6'
  ],
  paragraph: [
    '.builder-themed p',
    ':root[data-bp-font-packages-lane="public"] #content p'
  ],
  link: [
    '.builder-themed a',
    ':root[data-bp-font-packages-lane="public"] #content a'
  ],
  button: [
    '.builder-themed button',
    '.builder-themed [role="button"]',
    ':root[data-bp-font-packages-lane="public"] #content button',
    ':root[data-bp-font-packages-lane="public"] #content [role="button"]'
  ],
  label: [
    '.builder-themed label',
    ':root[data-bp-font-packages-lane="public"] #content label'
  ],
  small: [
    '.builder-themed small',
    ':root[data-bp-font-packages-lane="public"] #content small'
  ],
  blockquote: [
    '.builder-themed blockquote',
    ':root[data-bp-font-packages-lane="public"] #content blockquote'
  ],
  code: [
    '.builder-themed code',
    '.builder-themed pre',
    ':root[data-bp-font-packages-lane="public"] #content code',
    ':root[data-bp-font-packages-lane="public"] #content pre'
  ]
};

const EMPTY_ROLE: FontRoleStyles = {
  fontFamily: 'system-ui',
  fontSize: '16px',
  fontWeight: '400',
  lineHeight: '1.5',
  letterSpacing: '0px',
  color: '#111827',
  fontStyle: 'normal',
  textTransform: 'none',
  textDecoration: 'none'
};

let transport: FontPackagesTransport | null = null;
let snapshot: FontPackagesSnapshot = {
  version: 1,
  activePackageId: '',
  packages: []
};
let status: FontPackagesStatus = 'idle';
let lastErrorCode = '';
let fontEventsBound = false;
const listeners = new Set<FontPackagesListener>();

function normalizedId(value: unknown): string {
  const id = String(value || '').trim().toLowerCase();
  return PACKAGE_ID_PATTERN.test(id) ? id : '';
}

function safeCssValue(value: unknown, fallback: string): string {
  const normalized = String(value || '').trim();
  return normalized && SAFE_CSS_VALUE_PATTERN.test(normalized) ? normalized : fallback;
}

function normalizeRoleStyles(value: unknown): FontRoleStyles {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    fontFamily: safeCssValue(source.fontFamily, EMPTY_ROLE.fontFamily),
    fontSize: safeCssValue(source.fontSize, EMPTY_ROLE.fontSize),
    fontWeight: safeCssValue(source.fontWeight, EMPTY_ROLE.fontWeight),
    lineHeight: safeCssValue(source.lineHeight, EMPTY_ROLE.lineHeight),
    letterSpacing: safeCssValue(source.letterSpacing, EMPTY_ROLE.letterSpacing),
    color: safeCssValue(source.color, EMPTY_ROLE.color),
    fontStyle: safeCssValue(source.fontStyle, EMPTY_ROLE.fontStyle),
    textTransform: safeCssValue(source.textTransform, EMPTY_ROLE.textTransform),
    textDecoration: safeCssValue(source.textDecoration, EMPTY_ROLE.textDecoration)
  };
}

function normalizeFontPackage(value: unknown): FontPackage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = normalizedId(source.id);
  const name = String(source.name || '').replace(/\s+/g, ' ').trim();
  if (!id || !name) return null;
  const rolesSource = source.roles && typeof source.roles === 'object' && !Array.isArray(source.roles)
    ? source.roles as Record<string, unknown>
    : {};
  const roles = Object.fromEntries(FONT_PACKAGE_ROLES.map(role => [
    role,
    normalizeRoleStyles(rolesSource[role])
  ])) as Record<FontPackageRole, FontRoleStyles>;
  return {
    id,
    name,
    roles,
    ...(typeof source.createdAt === 'string' ? { createdAt: source.createdAt } : {}),
    ...(typeof source.updatedAt === 'string' ? { updatedAt: source.updatedAt } : {})
  };
}

export function normalizeFontPackagesSnapshot(value: unknown): FontPackagesSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { version: 1, activePackageId: '', packages: [] };
  }
  const source = value as Record<string, unknown>;
  const packages = Array.isArray(source.packages)
    ? source.packages.map(normalizeFontPackage).filter((entry): entry is FontPackage => Boolean(entry))
    : [];
  const requestedActiveId = normalizedId(source.activePackageId);
  return {
    version: 1,
    activePackageId: packages.some(pkg => pkg.id === requestedActiveId)
      ? requestedActiveId
      : packages[0]?.id || '',
    packages
  };
}

function normalizePublicResponse(value: unknown): FontPackagesSnapshot {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as PublicFontPackageResponse
    : {};
  const activePackage = normalizeFontPackage(source.activePackage);
  return activePackage
    ? { version: 1, activePackageId: activePackage.id, packages: [activePackage] }
    : { version: 1, activePackageId: '', packages: [] };
}

function cssFontFamily(value: string): string {
  const family = safeCssValue(value, 'system-ui');
  if (CSS_FONT_FAMILY_KEYWORDS.has(family.toLowerCase())) return family;
  return `"${family.replace(/["\\]/g, '')}", system-ui, sans-serif`;
}

function cssVariableName(role: FontPackageRole, field: keyof FontRoleStyles): string {
  return `--bp-type-${role}-${field.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
}

function roleDeclarations(role: FontPackageRole): string[] {
  return [
    `font-family: var(${cssVariableName(role, 'fontFamily')})`,
    `font-size: var(${cssVariableName(role, 'fontSize')})`,
    `font-weight: var(${cssVariableName(role, 'fontWeight')})`,
    `line-height: var(${cssVariableName(role, 'lineHeight')})`,
    `letter-spacing: var(${cssVariableName(role, 'letterSpacing')})`,
    `color: var(${cssVariableName(role, 'color')})`,
    `font-style: var(${cssVariableName(role, 'fontStyle')})`,
    `text-transform: var(${cssVariableName(role, 'textTransform')})`,
    `text-decoration: var(${cssVariableName(role, 'textDecoration')})`
  ];
}

function activeFontPackage(library: FontPackagesSnapshot = snapshot): FontPackage | null {
  return library.packages.find(pkg => pkg.id === library.activePackageId)
    || library.packages[0]
    || null;
}

function loadPackageFonts(pkg: FontPackage | null): void {
  if (!pkg || typeof window.loadFontCss !== 'function') return;
  const families = new Set(
    FONT_PACKAGE_ROLES
      .map(role => pkg.roles[role]?.fontFamily)
      .filter((family): family is string => Boolean(family))
  );
  families.forEach(family => {
    if (!CSS_FONT_FAMILY_KEYWORDS.has(family.toLowerCase())) {
      window.loadFontCss?.(family);
    }
  });
}

export function applyActiveFontPackage(
  library: FontPackagesSnapshot = snapshot,
  documentRef: Document = document
): HTMLStyleElement {
  let style = documentRef.getElementById(TOKEN_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = documentRef.createElement('style');
    style.id = TOKEN_STYLE_ID;
    style.dataset.fontPackages = 'true';
    documentRef.head.appendChild(style);
  }
  const pkg = activeFontPackage(library);
  if (!pkg) {
    style.textContent = '';
    return style;
  }

  const variables = FONT_PACKAGE_ROLES.flatMap(role => {
    const roleStyles = pkg.roles[role];
    return [
      `  ${cssVariableName(role, 'fontFamily')}: ${cssFontFamily(roleStyles.fontFamily)};`,
      `  ${cssVariableName(role, 'fontSize')}: ${roleStyles.fontSize};`,
      `  ${cssVariableName(role, 'fontWeight')}: ${roleStyles.fontWeight};`,
      `  ${cssVariableName(role, 'lineHeight')}: ${roleStyles.lineHeight};`,
      `  ${cssVariableName(role, 'letterSpacing')}: ${roleStyles.letterSpacing};`,
      `  ${cssVariableName(role, 'color')}: ${roleStyles.color};`,
      `  ${cssVariableName(role, 'fontStyle')}: ${roleStyles.fontStyle};`,
      `  ${cssVariableName(role, 'textTransform')}: ${roleStyles.textTransform};`,
      `  ${cssVariableName(role, 'textDecoration')}: ${roleStyles.textDecoration};`
    ];
  }).join('\n');

  const rules = FONT_PACKAGE_ROLES.map(role => {
    const selector = `:where(${ROLE_SELECTORS[role].join(', ')})`;
    return `${selector} {\n  ${roleDeclarations(role).join(';\n  ')};\n}`;
  }).join('\n\n');

  style.textContent = `:root {\n${variables}\n}\n\n${rules}`;
  documentRef.documentElement.dataset.bpFontPackageReady = 'true';
  loadPackageFonts(pkg);
  return style;
}

function errorCode(error: unknown): string {
  const explicit = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  if (explicit) return explicit;
  const match = String(error instanceof Error ? error.message : error || '').match(/(FONT_PACKAGES_[A-Z_]+)/);
  return match?.[1] || 'FONT_PACKAGES_REQUEST_FAILED';
}

function publish(next: FontPackagesSnapshot): FontPackagesSnapshot {
  snapshot = normalizeFontPackagesSnapshot(next);
  status = 'ready';
  lastErrorCode = '';
  applyActiveFontPackage(snapshot);
  listeners.forEach(listener => listener(getFontPackagesSnapshot()));
  document.dispatchEvent(new CustomEvent('bp:font-packages-changed', {
    detail: getFontPackagesSnapshot()
  }));
  return getFontPackagesSnapshot();
}

function requireTransport(): FontPackagesTransport {
  if (!transport) {
    throw new Error('FONT_PACKAGES_CLIENT_NOT_CONFIGURED: Configure the font package client first.');
  }
  return transport;
}

export function configureFontPackagesClient(next: FontPackagesTransport): void {
  if (!next || typeof next.emit !== 'function') {
    throw new Error('FONT_PACKAGES_EMITTER_UNAVAILABLE: A meltdown emitter is required.');
  }
  transport = next;
  document.documentElement.dataset.bpFontPackagesLane = next.lane;
  if (!fontEventsBound) {
    document.addEventListener('fontsUpdated', () => loadPackageFonts(activeFontPackage()));
    fontEventsBound = true;
  }
}

export function getFontPackagesSnapshot(): FontPackagesSnapshot {
  return {
    version: snapshot.version,
    activePackageId: snapshot.activePackageId,
    packages: snapshot.packages.map(pkg => ({
      ...pkg,
      roles: Object.fromEntries(FONT_PACKAGE_ROLES.map(role => [
        role,
        { ...pkg.roles[role] }
      ])) as Record<FontPackageRole, FontRoleStyles>
    }))
  };
}

export function getActiveFontPackage(): FontPackage | null {
  const pkg = activeFontPackage();
  if (!pkg) return null;
  return getFontPackagesSnapshot().packages.find(entry => entry.id === pkg.id) || null;
}

export function subscribeFontPackages(listener: FontPackagesListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function fontPackagesAgentState(): Record<string, unknown> {
  const active = activeFontPackage();
  return {
    status,
    version: snapshot.version,
    packageCount: snapshot.packages.length,
    activePackageId: active?.id || null,
    activePackageName: active?.name || null,
    packages: snapshot.packages.map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      active: pkg.id === snapshot.activePackageId
    })),
    activeRoles: active
      ? Object.fromEntries(FONT_PACKAGE_ROLES.map(role => [role, { ...active.roles[role] }]))
      : {},
    errorCode: lastErrorCode || null
  };
}

export async function refreshFontPackages(): Promise<FontPackagesSnapshot> {
  const current = requireTransport();
  status = 'loading';
  try {
    const result = current.lane === 'admin'
      ? await emitRuntimeAdmin<FontPackagesSnapshot>(
        current.emit,
        current.token,
        'fontPackages',
        'list'
      )
      : normalizePublicResponse(await emitRuntimePublic<PublicFontPackageResponse>(
        current.emit,
        current.token,
        'fontPackages',
        'active'
      ));
    return publish(result);
  } catch (error) {
    status = 'error';
    lastErrorCode = errorCode(error);
    throw error;
  }
}

async function mutateFontPackages(
  action: 'create' | 'update' | 'updateRole' | 'resetRole' | 'activate' | 'delete',
  params: Record<string, unknown>
): Promise<FontPackageMutationResponse> {
  const current = requireTransport();
  if (current.lane !== 'admin') {
    throw new Error('FONT_PACKAGES_ADMIN_REQUIRED: Font packages can only be changed from an admin surface.');
  }
  try {
    const result = await emitRuntimeAdmin<FontPackageMutationResponse>(
      current.emit,
      current.token,
      'fontPackages',
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

export async function createFontPackage(input: {
  name: string;
  copyFromId?: string;
}): Promise<FontPackage | null> {
  const result = await mutateFontPackages('create', input);
  return result.package || null;
}

export async function renameFontPackage(id: string, name: string): Promise<FontPackage | null> {
  const result = await mutateFontPackages('update', { id, name });
  return result.package || null;
}

export async function updateFontPackageRole(input: {
  id: string;
  role: FontPackageRole;
  settings: Partial<FontRoleStyles>;
}): Promise<FontPackage | null> {
  const result = await mutateFontPackages('updateRole', input);
  return result.package || null;
}

export async function resetFontPackageRole(
  id: string,
  role: FontPackageRole
): Promise<FontPackage | null> {
  const result = await mutateFontPackages('resetRole', { id, role });
  return result.package || null;
}

export async function activateFontPackage(id: string): Promise<FontPackage | null> {
  const result = await mutateFontPackages('activate', { id });
  return result.package || null;
}

export async function deleteFontPackage(id: string): Promise<FontPackageMutationResponse> {
  return mutateFontPackages('delete', { id });
}
