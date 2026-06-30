import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';

export interface LoginStrategy {
  name: string;
  scope?: string;
  description?: string;
  isEnabled?: boolean;
}

type LoginStrategiesEmitter = Window['meltdownEmit'];

function requireEmitter(emit: LoginStrategiesEmitter): NonNullable<LoginStrategiesEmitter> {
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

export function toStrategies(value: unknown): LoginStrategy[] {
  return toArray(value).filter((item): item is LoginStrategy => (
    Boolean(item) &&
    typeof item === 'object' &&
    typeof (item as LoginStrategy).name === 'string'
  ));
}

export function visibleLoginStrategies(strategies: LoginStrategy[]): LoginStrategy[] {
  return strategies.filter(strategy => strategy.name !== 'adminLocal');
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function fetchLoginStrategies(
  emit: LoginStrategiesEmitter,
  jwt: string | null | undefined
): Promise<LoginStrategy[]> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'auth', 'loginStrategies');
  return visibleLoginStrategies(toStrategies(res));
}

export async function setLoginStrategyEnabled(
  emit: LoginStrategiesEmitter,
  jwt: string | null | undefined,
  strategyName: string,
  enabled: boolean
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'auth', 'setStrategyEnabled', {
    strategyName,
    enabled
  });
}
