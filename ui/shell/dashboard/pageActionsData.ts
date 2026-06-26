type DashboardActionsEmitter = Window['meltdownEmit'];

// Keep dashboard event contracts here so DOM handlers stay focused on UI flow.
const PAGES_MANAGER_MODULE = {
  moduleName: 'pagesManager',
  moduleType: 'core'
} as const;

const PLAINSPACE_MODULE = {
  moduleName: 'plainspace',
  moduleType: 'core'
} as const;

function requireEmitter(emit: DashboardActionsEmitter): NonNullable<DashboardActionsEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('SHELL_PAGE_ACTIONS_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function createPublicPage(
  emit: DashboardActionsEmitter,
  jwt: string | null | undefined,
  title: string,
  slug: string
): Promise<string | number | null> {
  const meltdownEmit = requireEmitter(emit);
  const result = await meltdownEmit('createPage', {
    jwt,
    ...PAGES_MANAGER_MODULE,
    title,
    slug,
    lane: 'public',
    status: 'published'
  });

  return result && typeof result === 'object'
    ? ((result as { pageId?: string | number }).pageId ?? null)
    : null;
}

export async function savePublicLayoutTemplate(
  emit: DashboardActionsEmitter,
  jwt: string | null | undefined,
  layoutName: string
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('saveLayoutTemplate', {
    jwt,
    ...PLAINSPACE_MODULE,
    name: layoutName.trim(),
    lane: 'public',
    viewport: 'desktop',
    layout: [],
    previewPath: ''
  });
}
