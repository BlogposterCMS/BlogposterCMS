const API_ACTION_PART_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export function normalizeWidgetApiActions(metadata = {}) {
    const raw = metadata.apiActions;
    if (!Array.isArray(raw))
        return [];
    const seen = new Set();
    return raw.reduce((actions, item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            return actions;
        const resource = typeof item.resource === 'string' ? item.resource.trim() : '';
        const action = typeof item.action === 'string' ? item.action.trim() : '';
        if (!API_ACTION_PART_PATTERN.test(resource) || !API_ACTION_PART_PATTERN.test(action)) {
            return actions;
        }
        const key = `${resource}:${action}`;
        if (seen.has(key))
            return actions;
        seen.add(key);
        actions.push({ resource, action });
        return actions;
    }, []);
}
