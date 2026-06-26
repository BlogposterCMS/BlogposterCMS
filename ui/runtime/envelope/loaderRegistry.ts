export interface LoaderContext {
  meltdownEmit: import('../../shared/api-client/meltdownClient').MeltdownClient['emit'];
  publicToken?: string | null;
  env?: 'csr' | string;
  activeLayout?: unknown;
  activeLayoutRef?: unknown;
}

export type LoaderFunction = (
  descriptor: unknown,
  ctx: LoaderContext
) => Promise<unknown> | unknown;

const REG = new Map<string, LoaderFunction>();

export const register = (type: string, fn: LoaderFunction): void => {
  if (typeof type === 'string' && typeof fn === 'function') {
    REG.set(type, fn);
  }
};

export const get = (type: string): LoaderFunction | undefined => REG.get(type);
