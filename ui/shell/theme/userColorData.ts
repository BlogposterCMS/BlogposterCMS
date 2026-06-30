import { emitRuntimeAdmin } from '../../shared/api-client/runtimeFacade.js';

export interface TokenValidationResult {
  userId?: string | number;
}

export interface UserDetailsResult {
  data?: {
    ui_color?: unknown;
  };
  ui_color?: unknown;
}

type UserColorEmitter = Window['meltdownEmit'];

function requireEmitter(emit: UserColorEmitter): NonNullable<UserColorEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('SHELL_USER_COLOR_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function isValidHex(color: unknown): color is string {
  return typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color);
}

export function userIdFromTokenResult(value: unknown): string | number | null {
  if (!value || typeof value !== 'object') return null;
  const userId = (value as TokenValidationResult).userId;
  return typeof userId === 'string' || typeof userId === 'number' ? userId : null;
}

export function uiColorFromUserDetails(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as UserDetailsResult;
  const user = result.data ?? result;
  return isValidHex(user.ui_color) ? user.ui_color : null;
}

export async function fetchUserColor(
  emit: UserColorEmitter,
  jwt: string | null | undefined
): Promise<string | null> {
  if (!jwt) return null;
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'users', 'me');
  return uiColorFromUserDetails(res);
}
