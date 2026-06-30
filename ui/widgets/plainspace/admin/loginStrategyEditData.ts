import { emitRuntimeAdmin, runtimeAdminPayload } from '../../../shared/api-client/runtimeFacade.js';

export type LoginStrategyScope = 'admin' | 'public' | 'both';

export interface LoginStrategyEditSettings {
  clientId: string;
  clientSecret: string;
  scope: LoginStrategyScope;
}

export const loginStrategyScopes = ['admin', 'public', 'both'] as const;

type LoginStrategyEditEmitter = Window['meltdownEmit'];
type LoginStrategySettingSuffix = 'CLIENT_ID' | 'CLIENT_SECRET' | 'SCOPE';

// Keep strategy setting keys and settings facade payloads out of the DOM widget.
function requireEmitter(emit: LoginStrategyEditEmitter): NonNullable<LoginStrategyEditEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_LOGIN_STRATEGY_EDIT_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function asSetting(value: unknown, fallback = ''): string {
  return value == null ? fallback : String(value);
}

export function normalizeScope(value: unknown): LoginStrategyScope {
  const candidate = String(value);
  return loginStrategyScopes.includes(candidate as LoginStrategyScope)
    ? candidate as LoginStrategyScope
    : 'admin';
}

export function strategySettingKey(strategy: string, suffix: LoginStrategySettingSuffix): string {
  return `${strategy.toUpperCase()}_${suffix}`;
}

export function buildLoginStrategySettingPayloads(
  jwt: string | null | undefined,
  strategy: string,
  settings: LoginStrategyEditSettings
): Record<string, unknown>[] {
  return [
    runtimeAdminPayload(jwt, 'settings', 'set', {
      key: strategySettingKey(strategy, 'CLIENT_ID'),
      value: settings.clientId
    }),
    runtimeAdminPayload(jwt, 'settings', 'set', {
      key: strategySettingKey(strategy, 'CLIENT_SECRET'),
      value: settings.clientSecret
    }),
    runtimeAdminPayload(jwt, 'settings', 'set', {
      key: strategySettingKey(strategy, 'SCOPE'),
      value: settings.scope
    })
  ];
}

export async function fetchLoginStrategySettings(
  emit: LoginStrategyEditEmitter,
  jwt: string | null | undefined,
  strategy: string
): Promise<LoginStrategyEditSettings> {
  const meltdownEmit = requireEmitter(emit);
  const [clientId, clientSecret, scope] = await Promise.all([
    emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: strategySettingKey(strategy, 'CLIENT_ID') }),
    emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: strategySettingKey(strategy, 'CLIENT_SECRET') }),
    emitRuntimeAdmin(meltdownEmit, jwt, 'settings', 'get', { key: strategySettingKey(strategy, 'SCOPE') })
  ]);

  return {
    clientId: asSetting(clientId),
    clientSecret: asSetting(clientSecret),
    scope: normalizeScope(scope)
  };
}

export async function saveLoginStrategySettings(
  emit: LoginStrategyEditEmitter,
  jwt: string | null | undefined,
  strategy: string,
  settings: LoginStrategyEditSettings
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  for (const payload of buildLoginStrategySettingPayloads(jwt, strategy, settings)) {
    await meltdownEmit('cmsAdminApiRequest', payload);
  }
}
