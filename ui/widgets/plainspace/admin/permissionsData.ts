import {
  createRoleRecord,
  deleteRoleRecord,
  errorMessage,
  fetchRoles,
  permissionsPromptDefault,
  updateRoleRecord,
  type RoleRecord
} from './usersListData.js';

export {
  createRoleRecord,
  deleteRoleRecord,
  errorMessage,
  fetchRoles,
  permissionsPromptDefault,
  updateRoleRecord,
  type RoleRecord
};

export interface PermissionRecord {
  permission_key?: string;
  description?: string;
}

type PermissionsEmitter = Window['meltdownEmit'];

function requireEmitter(emit: PermissionsEmitter): NonNullable<PermissionsEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('meltdownEmit unavailable');
  }
  return emit;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: unknown[] }).data;
  }
  return [];
}

export function toPermissions(value: unknown): PermissionRecord[] {
  return toArray(value).filter((item): item is PermissionRecord => Boolean(item) && typeof item === 'object');
}

export async function fetchPermissions(
  emit: PermissionsEmitter,
  jwt: string | null | undefined
): Promise<PermissionRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('getAllPermissions', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core'
  });
  return toPermissions(res);
}

export async function fetchPermissionsState(
  emit: PermissionsEmitter,
  jwt: string | null | undefined
): Promise<{ permissions: PermissionRecord[]; roles: RoleRecord[] }> {
  const [permissions, roles] = await Promise.all([
    fetchPermissions(emit, jwt),
    fetchRoles(emit, jwt)
  ]);
  return { permissions, roles };
}

export async function createPermissionRecord(
  emit: PermissionsEmitter,
  jwt: string | null | undefined,
  permission: { permissionKey: string; description: string }
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('createPermission', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    permissionKey: permission.permissionKey,
    description: permission.description
  });
}
