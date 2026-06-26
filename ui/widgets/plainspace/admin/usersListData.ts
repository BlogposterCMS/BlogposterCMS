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

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function permissionsPromptDefault(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value || {});
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

export async function createUserRecord(
  emit: UsersEmitter,
  jwt: string | null | undefined,
  user: { username: string; password: string; email: string }
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('createUser', {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    username: user.username,
    password: user.password,
    email: user.email
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
