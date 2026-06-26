export interface UserEditRecord {
  id?: string | number;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  phone?: string;
  company?: string;
  website?: string;
  avatar_url?: string;
  bio?: string;
  ui_color?: string;
}

export const userEditTextFields = [
  'username',
  'email',
  'first_name',
  'last_name',
  'display_name',
  'phone',
  'company',
  'website',
  'avatar_url',
  'bio'
] as const;

export type UserEditTextField = typeof userEditTextFields[number];
export type UserEditFieldValues = Record<UserEditTextField, string>;

export interface UserEditFormValues extends UserEditFieldValues {
  uiColor: string;
  password?: string;
}

type UserEditEmitter = Window['meltdownEmit'];

const USER_MANAGEMENT_MODULE = {
  moduleName: 'userManagement',
  moduleType: 'core'
} as const;

// Keep user-management event names and payload shapes outside the DOM widget.
function requireEmitter(emit: UserEditEmitter): NonNullable<UserEditEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_USER_EDIT_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toUser(value: unknown): UserEditRecord | null {
  const candidate = value && typeof value === 'object' && 'data' in value
    ? (value as { data?: unknown }).data
    : value;
  return candidate && typeof candidate === 'object' ? candidate as UserEditRecord : null;
}

export function userValue(user: UserEditRecord, field: UserEditTextField): string {
  return user[field] == null ? '' : String(user[field]);
}

export function buildUserProfilePayload(
  jwt: string | null | undefined,
  userId: string | number | undefined,
  values: UserEditFormValues
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    jwt,
    ...USER_MANAGEMENT_MODULE,
    userId,
    newUsername: values.username.trim(),
    newEmail: values.email.trim(),
    newFirstName: values.first_name.trim(),
    newLastName: values.last_name.trim(),
    newDisplayName: values.display_name.trim(),
    newPhone: values.phone.trim(),
    newCompany: values.company.trim(),
    newWebsite: values.website.trim(),
    newAvatarUrl: values.avatar_url.trim(),
    newBio: values.bio,
    newUiColor: values.uiColor
  };
  const newPassword = values.password?.trim();
  if (newPassword) {
    payload.newPassword = newPassword;
  }
  return payload;
}

export async function fetchUserDetails(
  emit: UserEditEmitter,
  jwt: string | null | undefined,
  userId: string | number | null | undefined
): Promise<UserEditRecord | null> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('getUserDetailsById', {
    jwt,
    ...USER_MANAGEMENT_MODULE,
    userId
  });
  return toUser(res);
}

export async function updateUserProfile(
  emit: UserEditEmitter,
  jwt: string | null | undefined,
  userId: string | number | undefined,
  values: UserEditFormValues
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('updateUserProfile', buildUserProfilePayload(jwt, userId, values));
}

export async function deleteUserRecord(
  emit: UserEditEmitter,
  jwt: string | null | undefined,
  userId: string | number | undefined
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('deleteUser', {
    jwt,
    ...USER_MANAGEMENT_MODULE,
    userId
  });
}
