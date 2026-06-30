import { emitRuntimePublic } from '../../shared/api-client/runtimeFacade.js';

export interface LoginStrategy {
  name?: string;
  scope?: string;
}

interface StrategyPayload {
  data?: unknown[];
}

type LoginStrategiesEmitter = Window['meltdownEmit'];

function requireEmitter(emit: LoginStrategiesEmitter): NonNullable<LoginStrategiesEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('SHELL_LOGIN_STRATEGIES_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

function isLoginStrategy(value: unknown): value is LoginStrategy {
  return Boolean(value) && typeof value === 'object';
}

export function strategyList(value: unknown): LoginStrategy[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as StrategyPayload).data)
      ? (value as StrategyPayload).data || []
      : [];
  return raw.filter(isLoginStrategy);
}

export function publicStrategies(value: unknown): LoginStrategy[] {
  return strategyList(value).filter(strategy =>
    strategy.name !== 'adminLocal' && (strategy.scope === 'public' || strategy.scope === 'global')
  );
}

export async function issueLoginPublicToken(emit: LoginStrategiesEmitter): Promise<unknown> {
  const meltdownEmit = requireEmitter(emit);
  return meltdownEmit('issuePublicToken', {
    purpose: 'login',
    moduleName: 'auth'
  });
}

export async function fetchPublicLoginStrategies(emit: LoginStrategiesEmitter): Promise<LoginStrategy[]> {
  const meltdownEmit = requireEmitter(emit);
  const loginJwt = await issueLoginPublicToken(meltdownEmit);
  const response = await emitRuntimePublic(meltdownEmit, loginJwt as string | null | undefined, 'auth', 'activeLoginStrategies');
  return publicStrategies(response);
}
