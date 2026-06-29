function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function normalizeBoolean(value) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized))
            return true;
        if (['false', '0', 'no', 'off'].includes(normalized))
            return false;
    }
    return undefined;
}
function normalizeId(value) {
    if (typeof value === 'string' && value.trim())
        return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    return undefined;
}
function normalizeRole(value) {
    const role = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return role === 'source' || role === 'follower' ? role : undefined;
}
export function normalizeStyleSourceSettings(value) {
    const source = isRecord(value) ? value : {};
    const settings = {};
    const enabled = normalizeBoolean(source.enabled ?? source.styleSourceEnabled ?? source.style_source_enabled);
    const role = normalizeRole(source.role ?? source.styleSourceRole ?? source.style_source_role);
    const sourceId = normalizeId(source.sourceId ?? source.source_id ?? source.styleSourceId ?? source.style_source_id);
    const syncLayout = normalizeBoolean(source.syncLayout ?? source.sync_layout);
    const syncDesign = normalizeBoolean(source.syncDesign ?? source.sync_design);
    if (enabled !== undefined)
        settings.enabled = enabled;
    if (role)
        settings.role = role;
    if (sourceId)
        settings.sourceId = sourceId;
    if (syncLayout !== undefined)
        settings.syncLayout = syncLayout;
    if (syncDesign !== undefined)
        settings.syncDesign = syncDesign;
    return settings;
}
export function hasStyleSourceSettings(value) {
    return Boolean(value && Object.keys(value).length > 0);
}
