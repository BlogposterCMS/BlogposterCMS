const MODULE_LOADER_MODULE = {
    moduleName: 'moduleLoader',
    moduleType: 'core'
};
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_MODULES_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
function toArray(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object' && Array.isArray(value.data)) {
        return value.data;
    }
    return [];
}
export function toModules(value) {
    return toArray(value).filter((item) => Boolean(item) && typeof item === 'object');
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function renderModuleMeta(info) {
    const pieces = [];
    if (info.version)
        pieces.push(`v${info.version}`);
    pieces.push(info.developer || 'Unknown Developer');
    if (info.description)
        pieces.push(info.description);
    return pieces.join(' \u2022 ');
}
export function zipDataFromDataUrl(value) {
    const raw = typeof value === 'string' ? value : '';
    const zipData = raw.includes(',') ? raw.split(',')[1] : '';
    if (!zipData) {
        throw new Error('PLAINSPACE_MODULES_ZIP_DATA_UNAVAILABLE: Could not read ZIP data');
    }
    return zipData;
}
export async function fetchModuleLists(emit, jwt) {
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
export async function toggleModuleRegistryActivation(emit, jwt, moduleRecord) {
    const meltdownEmit = requireEmitter(emit);
    const nextActive = !moduleRecord.is_active;
    await meltdownEmit(moduleRecord.is_active ? 'deactivateModuleInRegistry' : 'activateModuleInRegistry', {
        jwt,
        ...MODULE_LOADER_MODULE,
        targetModuleName: moduleRecord.module_name
    });
    return nextActive;
}
export async function installModuleZip(emit, jwt, zipData) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('installModuleFromZip', {
        jwt,
        ...MODULE_LOADER_MODULE,
        zipData
    });
}
