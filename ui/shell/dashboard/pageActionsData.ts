type DashboardActionsEmitter = Window['meltdownEmit'];

import { emitRuntimeAdmin } from '../../shared/api-client/runtimeFacade.js';

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
  const result = await emitRuntimeAdmin<{ pageId?: string | number }>(meltdownEmit, jwt, 'pages', 'create', {
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
  await emitRuntimeAdmin(meltdownEmit, jwt, 'plainSpace', 'saveLayoutTemplate', {
    name: layoutName.trim(),
    lane: 'public',
    viewport: 'desktop',
    layout: [],
    previewPath: ''
  });
}
