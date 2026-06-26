export interface AdminPageRecord {
  id?: string | number;
  slug?: string;
  title?: string;
}

type ContentHeaderEmitter = Window['meltdownEmit'];

// Keep admin-page delete contracts here so the header module remains DOM-focused.
const PAGES_MANAGER_MODULE = {
  moduleName: 'pagesManager',
  moduleType: 'core'
} as const;

const PROTECTED_ROOT_WORKSPACES = new Set(['home', 'settings']);

function requireEmitter(emit: ContentHeaderEmitter): NonNullable<ContentHeaderEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('SHELL_CONTENT_HEADER_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toAdminPage(value: unknown): AdminPageRecord | null {
  if (Array.isArray(value)) {
    return value[0] && typeof value[0] === 'object' ? value[0] as AdminPageRecord : null;
  }
  return value && typeof value === 'object' ? value as AdminPageRecord : null;
}

export function normalizeAdminBase(adminBase: string | null | undefined): string {
  return (adminBase || '/admin/').replace(/\/+/g, '/');
}

export function adminSlugFromPath(pathname: string, adminBase: string | null | undefined): string {
  const normalizedBase = normalizeAdminBase(adminBase);
  let rel = pathname;
  if (rel.startsWith(normalizedBase)) rel = rel.slice(normalizedBase.length);
  return rel.replace(/^\/|\/$/g, '');
}

export function adminBaseHref(adminBase: string | null | undefined): string {
  const normalizedBase = normalizeAdminBase(adminBase);
  return normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase;
}

export function isProtectedAdminWorkspace(page: AdminPageRecord): boolean {
  const slug = String(page.slug || '');
  const baseSlug = slug.split('/')[0] || '';
  return PROTECTED_ROOT_WORKSPACES.has(baseSlug) && baseSlug === slug;
}

export async function fetchAdminPageBySlug(
  emit: ContentHeaderEmitter,
  jwt: string | null | undefined,
  slug: string
): Promise<AdminPageRecord | null> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('getPageBySlug', {
    jwt,
    ...PAGES_MANAGER_MODULE,
    slug,
    lane: 'admin'
  });
  return toAdminPage(res);
}

export async function deleteAdminPage(
  emit: ContentHeaderEmitter,
  jwt: string | null | undefined,
  pageId: string | number
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('deletePage', {
    jwt,
    ...PAGES_MANAGER_MODULE,
    pageId
  });
}
