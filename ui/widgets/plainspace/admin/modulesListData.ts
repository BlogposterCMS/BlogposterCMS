export interface ModuleInfo {
  moduleName?: string;
  version?: string;
  developer?: string;
  description?: string;
}

export interface ModuleRecord {
  module_name?: string;
  module_info?: ModuleInfo;
  moduleInfo?: ModuleInfo;
  is_active?: boolean;
}

type ModulesEmitter = Window['meltdownEmit'];

const MODULE_LOADER_MODULE = {
  moduleName: 'moduleLoader',
  moduleType: 'core'
} as const;

function requireEmitter(emit: ModulesEmitter): NonNullable<ModulesEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_MODULES_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
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

export function toModules(value: unknown): ModuleRecord[] {
  return toArray(value).filter((item): item is ModuleRecord => Boolean(item) && typeof item === 'object');
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function renderModuleMeta(info: ModuleInfo): string {
  const pieces: string[] = [];
  if (info.version) pieces.push(`v${info.version}`);
  pieces.push(info.developer || 'Unknown Developer');
  if (info.description) pieces.push(info.description);
  return pieces.join(' \u2022 ');
}

export function zipDataFromDataUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const zipData = raw.includes(',') ? raw.split(',')[1] : '';
  if (!zipData) {
    throw new Error('PLAINSPACE_MODULES_ZIP_DATA_UNAVAILABLE: Could not read ZIP data');
  }
  return zipData;
}

export async function fetchModuleLists(
  emit: ModulesEmitter,
  jwt: string | null | undefined
): Promise<{ installed: ModuleRecord[]; system: ModuleRecord[] }> {
  const meltdownEmit = requireEmitter(emit);
  const [installedRes, systemRes] = await Promise.all([
    meltdownEmit('getModuleRegistry', {
      jwt,
      ...MODULE_LOADER_MODULE
    }),
    meltdownEmit('listSystemModules', {
      jwt,
      ...MODULE_LOADER_MODULE
    })
  ]);

  return {
    installed: toModules(installedRes),
    system: toModules(systemRes)
  };
}

export async function toggleModuleRegistryActivation(
  emit: ModulesEmitter,
  jwt: string | null | undefined,
  moduleRecord: ModuleRecord
): Promise<boolean> {
  const meltdownEmit = requireEmitter(emit);
  const nextActive = !moduleRecord.is_active;
  await meltdownEmit(moduleRecord.is_active ? 'deactivateModuleInRegistry' : 'activateModuleInRegistry', {
    jwt,
    ...MODULE_LOADER_MODULE,
    targetModuleName: moduleRecord.module_name
  });
  return nextActive;
}

export async function installModuleZip(
  emit: ModulesEmitter,
  jwt: string | null | undefined,
  zipData: string
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('installModuleFromZip', {
    jwt,
    ...MODULE_LOADER_MODULE,
    zipData
  });
}
