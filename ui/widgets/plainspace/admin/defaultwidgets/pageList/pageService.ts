const runtimeManagerOptions = { moduleName: 'runtimeManager', moduleType: 'core' } as const;

interface PageRecord {
  id?: string | number;
  slug?: string;
  status?: string;
  seo_image?: string | null;
  parent_id?: string | number | null;
  is_content?: boolean;
  lane?: string;
  language?: string | null;
  title?: string;
  meta?: Record<string, unknown> | null;
}

type PagePatch = Partial<PageRecord>;

function getRuntime() {
  const runtimeWindow = typeof window === 'undefined' ? null : window;
  const meltdownEmit = runtimeWindow?.meltdownEmit;
  if (typeof meltdownEmit !== 'function') {
    throw new Error('meltdownEmit is not available');
  }
  return {
    meltdownEmit,
    jwt: runtimeWindow?.ADMIN_TOKEN
  };
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: unknown[] }).data;
  }
  return [];
}

function unwrapRuntimeResult(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    'resource' in value &&
    'action' in value &&
    'data' in value
  ) {
    return (value as { data?: unknown }).data;
  }
  return value;
}

async function requestPageAction(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const { meltdownEmit, jwt } = getRuntime();
  const result = await meltdownEmit('cmsAdminApiRequest', {
    ...runtimeManagerOptions,
    jwt,
    resource: 'pages',
    action,
    params
  });
  return unwrapRuntimeResult(result);
}

export const sanitizeSlug = (raw: unknown): string =>
  (raw == null ? '' : String(raw))
    .trim()
    .toLowerCase()
    .replace(/^\/+/g, '')
    .replace(/[^a-z0-9/-]/gi, '')
    .replace(/\/+/g, '/')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .replace(/\/+$/, '');

export const pageService = {
  async getPagesByLane(lane = 'public'): Promise<unknown[]> {
    const safeLane = typeof lane === 'string' && lane.trim() ? lane.trim() : 'public';
    const res = await requestPageAction('byLane', { lane: safeLane });
    return toArray(res);
  },

  async getAll(): Promise<unknown[]> {
    return this.getPagesByLane('public');
  },

  async create({
    title,
    slug,
    status = 'published',
    meta
  }: {
    title: string;
    slug: string;
    status?: string;
    meta?: Record<string, unknown>;
  }): Promise<unknown> {
    return requestPageAction('create', {
      title,
      slug,
      lane: 'public',
      status,
      ...(meta ? { meta } : {})
    });
  },

  async update(page: PageRecord, patch: PagePatch): Promise<unknown> {
    return requestPageAction('update', {
      pageId: page.id,
      slug: page.slug,
      status: page.status,
      seo_Image: page.seo_image,
      parent_id: page.parent_id,
      is_content: page.is_content,
      lane: page.lane,
      language: page.language,
      title: page.title,
      meta: page.meta,
      ...patch
    });
  },

  updateSlug(page: PageRecord, slug: string): Promise<unknown> {
    return this.update(page, { slug });
  },

  updateTitle(page: PageRecord, title: string): Promise<unknown> {
    return this.update(page, { title });
  },

  updateStatus(page: PageRecord, status: string): Promise<unknown> {
    return this.update(page, { status });
  },

  updateParent(page: PageRecord, parent_id: string | number | null): Promise<unknown> {
    return this.update(page, { parent_id });
  },

  async setAsStart(id: string | number): Promise<unknown> {
    return requestPageAction('setStart', { pageId: id });
  },

  async delete(id: string | number): Promise<unknown> {
    return requestPageAction('delete', { pageId: id });
  }
};
