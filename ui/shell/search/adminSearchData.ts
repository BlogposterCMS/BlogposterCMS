import { emitRuntimeAdmin } from '../../shared/api-client/runtimeFacade.js';

export interface SearchPage {
  id: string | number;
  slug?: string;
  lane?: string;
  title?: string;
}

interface SearchResultPayload {
  pages?: unknown[];
  rows?: unknown[];
}

type SearchEmitter = Window['meltdownEmit'];

function requireEmitter(emit: SearchEmitter): NonNullable<SearchEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('SHELL_ADMIN_SEARCH_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

function isSearchPage(value: unknown): value is SearchPage {
  return Boolean(value) &&
    typeof value === 'object' &&
    (typeof (value as SearchPage).id === 'string' || typeof (value as SearchPage).id === 'number');
}

export function resultPages(res: unknown): SearchPage[] {
  const items = Array.isArray(res)
    ? res
    : res && typeof res === 'object'
      ? ((res as SearchResultPayload).pages || (res as SearchResultPayload).rows || [])
      : [];
  return items.filter(isSearchPage);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function adminSearchDisabledPlaceholder(err: unknown): string | null {
  const message = errorMessage(err);
  if (/permission/i.test(message)) return 'Search unavailable';
  if (/(token|auth)/i.test(message)) return 'Login required';
  return null;
}

export async function fetchAdminSearchPages(
  emit: SearchEmitter,
  jwt: string | null | undefined,
  query: string,
  limit = 10
): Promise<SearchPage[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'search', {
    query,
    lane: 'all',
    limit
  });
  return resultPages(res);
}
