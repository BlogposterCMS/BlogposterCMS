export interface AdminPage {
  id?: string;
  slug: string;
  title?: string;
  lane?: string;
  weight?: number | null;
  meta?: {
    icon?: string | null;
    workspace?: string | null;
  } | null;
  config?: {
    icon?: string | null;
  } | null;
}

import { emitRuntimeAdmin } from '../../shared/api-client/runtimeFacade.js';

export const ADMIN_LANE = 'admin';

type WorkspacesEmitter = Window['meltdownEmit'];

interface WorkspacePageInput {
  title: string;
  slug: string;
  icon: string;
}

interface WorkspaceSubpageInput extends WorkspacePageInput {
  workspace: string;
  parentId: string | null;
}

function requireEmitter(emit: WorkspacesEmitter): NonNullable<WorkspacesEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('SHELL_WORKSPACES_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function toAdminPages(value: unknown): AdminPage[] {
  if (Array.isArray(value)) {
    return value as AdminPage[];
  }
  if (value && typeof value === 'object') {
    const container = value as { pages?: unknown; data?: unknown };
    const maybePages = container.pages ?? container.data;
    if (Array.isArray(maybePages)) {
      return maybePages as AdminPage[];
    }
    if (maybePages && typeof maybePages === 'object' && 'slug' in (maybePages as Record<string, unknown>)) {
      return [maybePages as AdminPage];
    }
    if ('slug' in (value as Record<string, unknown>)) {
      return [value as AdminPage];
    }
  }
  return [];
}

export async function fetchAdminPagesByLane(
  emit: WorkspacesEmitter,
  jwt: string | null | undefined
): Promise<AdminPage[]> {
  const meltdownEmit = requireEmitter(emit);
  const response = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'byLane', {
    lane: ADMIN_LANE
  });
  return toAdminPages(response);
}

export async function fetchAdminPageBySlug(
  emit: WorkspacesEmitter,
  jwt: string | null | undefined,
  slug: string
): Promise<AdminPage | null> {
  const meltdownEmit = requireEmitter(emit);
  const response = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'getBySlug', {
    slug,
    lane: ADMIN_LANE
  });
  return toAdminPages(response)[0] ?? null;
}

export async function createWorkspacePage(
  emit: WorkspacesEmitter,
  jwt: string | null | undefined,
  input: WorkspacePageInput
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'create', {
    title: input.title,
    slug: input.slug,
    lane: ADMIN_LANE,
    status: 'published',
    parent_id: null,
    meta: { icon: input.icon, workspace: input.slug }
  });
}

export async function createWorkspaceSubpage(
  emit: WorkspacesEmitter,
  jwt: string | null | undefined,
  input: WorkspaceSubpageInput
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'create', {
    title: input.title,
    slug: `${input.workspace}/${input.slug}`,
    lane: ADMIN_LANE,
    status: 'published',
    parent_id: input.parentId,
    meta: { icon: input.icon }
  });
}
