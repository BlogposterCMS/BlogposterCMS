export interface UserRecord {
  id?: string | number;
  username?: string;
  email?: string;
  display_name?: string;
}

export interface RoleRecord {
  id?: string | number;
  role_name?: string;
  description?: string;
  permissions?: unknown;
  is_system_role?: boolean;
}

export interface PermissionRecord {
  permission_key?: string;
  key?: string;
  description?: string;
}

type UsersEmitter = Window['meltdownEmit'];

function requireEmitter(emit: UsersEmitter): NonNullable<UsersEmitter> {
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

export function toUsers(value: unknown): UserRecord[] {
  return toArray(value).filter((item): item is UserRecord => Boolean(item) && typeof item === 'object');
}

export function toRoles(value: unknown): RoleRecord[] {
  return toArray(value).filter((item): item is RoleRecord => Boolean(item) && typeof item === 'object');
}

export function toPermissions(value: unknown): PermissionRecord[] {
  return toArray(value).filter((item): item is PermissionRecord => Boolean(item) && typeof item === 'object');
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function permissionsPromptDefault(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value || {});
}

export function isManagedDirectRole(role: RoleRecord): boolean {
  return String(role.role_name || '').startsWith('__user_direct_');
}

export function visiblePermissionGroups(roles: RoleRecord[]): RoleRecord[] {
  return roles.filter(role => !isManagedDirectRole(role));
}

function setPermissionPath(target: Record<string, unknown>, parts: string[]): void {
  let cursor = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = true;
      return;
    }
    const next = cursor[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  });
}

export function permissionBlobFromKeys(keys: string[]): Record<string, unknown> {
  const blob: Record<string, unknown> = {};
  Array.from(new Set(keys.map(key => key.trim()).filter(Boolean))).sort().forEach(key => {
    setPermissionPath(blob, key.split('.').filter(Boolean));
  });
  return blob;
}

export function permissionKeysFromBlob(blob: unknown, prefix = ''): string[] {
  if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return [];
  const result: string[] = [];
  Object.entries(blob as Record<string, unknown>).forEach(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value === true) {
      result.push(nextKey);
    } else {
      result.push(...permissionKeysFromBlob(value, nextKey));
    }
  });
  return result;
}

export function permissionKey(record: PermissionRecord): string {
  return record.permission_key || record.key || '';
}

export function permissionGroupForKey(key: string): string {
  const [group] = key.split('.');
  return group || 'other';
}

export async function fetchUsers(
  emit: UsersEmitter,
  jwt: string | null | undefined
): Promise<UserRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('getAllUsers', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core'
  });
  return toUsers(res);
}

export async function fetchRoles(
  emit: UsersEmitter,
  jwt: string | null | undefined
): Promise<RoleRecord[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('getAllRoles', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core'
  });
  return toRoles(res);
}

export async function fetchPermissions(
  emit: UsersEmitter,
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

export async function createUserRecord(
  emit: UsersEmitter,
  jwt: string | null | undefined,
  user: { username: string; password: string; email: string; roleIds?: Array<string | number>; directPermissions?: unknown }
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('createUser', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    username: user.username,
    password: user.password,
    email: user.email,
    roleIds: user.roleIds || [],
    directPermissions: user.directPermissions || {}
  });
}

export async function createRoleRecord(
  emit: UsersEmitter,
  jwt: string | null | undefined,
  role: { roleName: string; permissions: unknown }
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('createRole', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    roleName: role.roleName,
    permissions: role.permissions
  });
}

export async function updateRoleRecord(
  emit: UsersEmitter,
  jwt: string | null | undefined,
  role: RoleRecord,
  values: { roleName: string; description: string; permissions: unknown }
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('updateRole', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    roleId: role.id,
    newRoleName: values.roleName,
    newDescription: values.description,
    newPermissions: values.permissions
  });
}

export async function deleteRoleRecord(
  emit: UsersEmitter,
  jwt: string | null | undefined,
  role: RoleRecord
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('deleteRole', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    roleId: role.id
  });
}
