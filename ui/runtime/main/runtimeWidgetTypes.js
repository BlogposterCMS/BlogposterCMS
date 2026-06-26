function isSizeContract(value) {
    return Boolean(value) && typeof value === 'object';
}
export function getRuntimeWidgetSizeContract(def) {
    if (isSizeContract(def.layout))
        return def.layout;
    if (isSizeContract(def.metadata?.layout))
        return def.metadata.layout;
    if (isSizeContract(def.metadata?.sizeContract))
        return def.metadata.sizeContract;
    return null;
}
