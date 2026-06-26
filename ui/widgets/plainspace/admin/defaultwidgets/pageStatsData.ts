export interface PageRecord {
  status?: string;
  [key: string]: unknown;
}

interface PageListPayload {
  data?: unknown[];
}

export interface PageStatsSummary {
  total: number;
  published: number;
  draft: number;
  adminCount: number;
}

type PageStatsEmitter = Window['meltdownEmit'];

const PAGES_MODULE = {
  moduleName: 'pagesManager',
  moduleType: 'core'
} as const;

function requireEmitter(emit: PageStatsEmitter): NonNullable<PageStatsEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_PAGE_STATS_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function toPages(value: unknown): PageRecord[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is PageRecord => Boolean(item) && typeof item === 'object');
  }
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as PageListPayload).data)
  ) {
    return ((value as PageListPayload).data || []).filter((item): item is PageRecord => (
      Boolean(item) && typeof item === 'object'
    ));
  }
  return [];
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function buildPageLanePayload(
  jwt: string | null | undefined,
  lane: 'public' | 'admin'
): Record<string, unknown> {
  return {
    jwt,
    ...PAGES_MODULE,
    lane
  };
}

export function summarizePageStats(
  publicPages: PageRecord[],
  adminPages: PageRecord[]
): PageStatsSummary {
  return {
    total: publicPages.length + adminPages.length,
    published: publicPages.filter(page => page.status === 'published').length,
    draft: publicPages.filter(page => page.status === 'draft').length,
    adminCount: adminPages.length
  };
}

export async function fetchPagesByLane(
  emit: PageStatsEmitter,
  jwt: string | null | undefined,
  lane: 'public' | 'admin'
): Promise<PageRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('getPagesByLane', buildPageLanePayload(jwt, lane));
  return toPages(res);
}

export async function fetchPageStats(
  emit: PageStatsEmitter,
  jwt: string | null | undefined
): Promise<PageStatsSummary> {
  const meltdownEmit = requireEmitter(emit);
  const [publicPages, adminPages] = await Promise.all([
    fetchPagesByLane(meltdownEmit, jwt, 'public'),
    fetchPagesByLane(meltdownEmit, jwt, 'admin')
  ]);
  return summarizePageStats(publicPages, adminPages);
}
