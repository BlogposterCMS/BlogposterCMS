export interface DesignRecord {
  id?: string | number;
  title?: string;
  thumbnail?: string;
  updated_at?: string | number | Date;
  [key: string]: unknown;
}

export interface PageRecord {
  slug?: string;
  title?: string;
  lane?: string;
  is_content?: boolean;
  meta?: {
    layoutTemplate?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface DraftDesignRecord {
  id: null;
  title: string;
  description: string;
  thumbnail: string;
  ownerId: string | number;
  bgColor: string;
  bgMediaId: string;
  bgMediaUrl: string;
  version: number;
  isLayout: boolean;
  isGlobal: boolean;
  isDraft: boolean;
}

type ContentSummaryEmitter = Window['meltdownEmit'];

const DESIGNER_MODULE = {
  moduleName: 'designer',
  moduleType: 'community'
} as const;

const PAGES_MODULE = {
  moduleName: 'pagesManager',
  moduleType: 'core'
} as const;

function requireEmitter(emit: ContentSummaryEmitter): NonNullable<ContentSummaryEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_CONTENT_SUMMARY_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function toDesigns(value: unknown): DesignRecord[] {
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { designs?: unknown }).designs)
  ) {
    return (value as { designs: unknown[] }).designs.filter((item): item is DesignRecord => (
      Boolean(item) && typeof item === 'object'
    ));
  }
  return [];
}

export function toPages(value: unknown): PageRecord[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : [];
  return items.filter((item): item is PageRecord => Boolean(item) && typeof item === 'object');
}

export function uploadedContentPages(value: unknown): PageRecord[] {
  return toPages(value).filter(page => (
    page.is_content &&
    !page.meta?.layoutTemplate &&
    page.lane === 'public'
  ));
}

export function decodeAdminId(
  jwt: string | null | undefined,
  decodeBase64: ((value: string) => string) | undefined = typeof globalThis.atob === 'function'
    ? globalThis.atob.bind(globalThis)
    : undefined
): string | number | null {
  if (!jwt || typeof jwt !== 'string') return null;
  if (!decodeBase64) return null;
  const parts = jwt.split('.');
  const payload = parts[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(decodeBase64(payload)) as {
      userId?: string | number;
      sub?: string | number;
      id?: string | number;
      user?: { id?: string | number };
    };
    return json.userId || json.sub || json.id || json.user?.id || null;
  } catch {
    return null;
  }
}

export function buildDefaultDesignTitle(
  timestamp: Date,
  locale?: string | string[]
): string {
  const titleStamp = timestamp.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `New Design ${titleStamp}`;
}

export function buildDraftDesignRecord(
  ownerId: string | number | null,
  title: string
): DraftDesignRecord {
  return {
    id: null,
    title,
    description: '',
    thumbnail: '',
    ownerId: ownerId || '',
    bgColor: '',
    bgMediaId: '',
    bgMediaUrl: '',
    version: 0,
    isLayout: false,
    isGlobal: false,
    isDraft: true
  };
}

export function designIdFromResult(value: unknown): string | number | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as { id?: unknown; designId?: unknown };
  return typeof result.id === 'string' || typeof result.id === 'number'
    ? result.id
    : typeof result.designId === 'string' || typeof result.designId === 'number'
      ? result.designId
      : null;
}

export async function fetchContentDesigns(
  emit: ContentSummaryEmitter,
  jwt: string | null | undefined
): Promise<DesignRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('designer.listDesigns', {
    jwt,
    ...DESIGNER_MODULE
  });
  return toDesigns(res);
}

export async function fetchUploadedContentPages(
  emit: ContentSummaryEmitter,
  jwt: string | null | undefined
): Promise<PageRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('getAllPages', {
    jwt,
    ...PAGES_MODULE
  });
  return uploadedContentPages(res);
}

export async function createDraftDesign(
  emit: ContentSummaryEmitter,
  jwt: string | null | undefined,
  ownerId: string | number | null,
  timestamp = new Date()
): Promise<string | number | null> {
  const meltdownEmit = requireEmitter(emit);
  const title = buildDefaultDesignTitle(timestamp);
  const res = await meltdownEmit('designer.saveDesign', {
    jwt,
    ...DESIGNER_MODULE,
    design: buildDraftDesignRecord(ownerId, title),
    widgets: [],
    layout: null
  }, 20000);
  return designIdFromResult(res);
}
