/** Declarative data only. Shared by Site Presets validation and browser renderers. */
export const UI_KIT_COMPONENT_TYPES = ['text', 'image', 'button', 'input', 'textarea', 'select', 'multiselect', 'checkbox', 'radio', 'switch', 'tabs', 'popover', 'tooltip', 'separator'];
export const COMPONENT_STYLE_PROPERTIES = new Set([
    'color', 'background', 'backgroundColor', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap', 'width', 'minWidth', 'maxWidth',
    'height', 'minHeight', 'maxHeight', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
    'textAlign', 'textDecoration', 'textTransform', 'opacity', 'boxShadow', 'outlineColor', 'outlineWidth', 'outlineStyle', 'accentColor'
]);
export const COMPONENT_STATES = ['hover', 'focus', 'active', 'disabled', 'checked', 'invalid', 'placeholder'];
const forbiddenKey = /^(?:__proto__|prototype|constructor|on[a-z]+|html|css|javascript|script|scripts|module|modules|events|permissions)$/i;
const styleFunctions = new Set(['var', 'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'calc', 'min', 'max', 'clamp', 'linear-gradient', 'radial-gradient', 'conic-gradient', 'repeating-linear-gradient', 'repeating-radial-gradient']);
function failure(code, detail) { throw Object.assign(new Error(`${code}: ${detail}`), { code }); }
function checkData(value, depth = 0) {
    if (depth > 10)
        failure('UI_KIT_COMPONENT_DEPTH', 'Component data may nest at most 10 levels.');
    if (typeof value === 'string' && value.length > 8000)
        failure('UI_KIT_COMPONENT_TEXT_LIMIT', 'Component strings are limited to 8000 characters.');
    if (!value || typeof value !== 'object')
        return;
    for (const [key, entry] of Object.entries(value)) {
        if (forbiddenKey.test(key))
            failure('UI_KIT_COMPONENT_EXECUTABLE_FIELD', `Unsupported executable field: ${key}`);
        checkData(entry, depth + 1);
    }
}
function validateStyles(value) {
    if (value === undefined)
        return;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        failure('UI_KIT_COMPONENT_STYLES_INVALID', 'Styles must be a JSON object.');
    for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'string' || item.length > 256 || /[;{}<>\\]|url\s*\(|expression\s*\(|@/i.test(item)) {
            failure('UI_KIT_COMPONENT_STYLE_VALUE', `Invalid style value for ${key}.`);
        }
        if (Array.from(item.matchAll(/([a-z-]+)\s*\(/gi)).some(match => !styleFunctions.has(match[1].toLowerCase())))
            failure('UI_KIT_COMPONENT_STYLE_VALUE', `Unsupported CSS function for ${key}.`);
        // Unknown properties remain data for future editors, but never reach CSS.
    }
}
export function normalizeKitComponents(value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.length > 64)
        failure('UI_KIT_COMPONENT_LIMIT', 'Provide at most 64 components.');
    const serialized = JSON.stringify(value);
    if (serialized.length > 131072)
        failure('UI_KIT_COMPONENT_SIZE', 'Component definitions must fit within 128 KB.');
    const ids = new Set();
    return value.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            failure('UI_KIT_COMPONENT_INVALID', `Component ${index + 1} must be an object.`);
        checkData(entry);
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        const type = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : '';
        const id = entry.id === undefined ? `component-${index + 1}` : String(entry.id);
        if (!name || name.length > 100 || !/^[a-z][a-z0-9-]{0,63}$/.test(type) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id)) {
            failure('UI_KIT_COMPONENT_IDENTITY', 'Each component needs a name, type and optional stable id.');
        }
        if (ids.has(id))
            failure('UI_KIT_COMPONENT_DUPLICATE_ID', `Duplicate component id: ${id}`);
        ids.add(id);
        if (entry.props !== undefined && (!entry.props || typeof entry.props !== 'object' || Array.isArray(entry.props)))
            failure('UI_KIT_COMPONENT_PROPS_INVALID', 'Props must be a JSON object.');
        // Known collection props have bounded, predictable shapes for renderer/editor parity.
        for (const field of ['options', 'tabs']) {
            const items = entry.props?.[field];
            if (items === undefined)
                continue;
            const limit = field === 'tabs' ? 32 : 100;
            if (!Array.isArray(items) || items.length > limit || items.some(item => field === 'options' && typeof item === 'string' ? false : !item || typeof item !== 'object' || Array.isArray(item))) {
                failure('UI_KIT_COMPONENT_PROPS_INVALID', `${field} must contain at most ${limit} ${field === 'options' ? 'strings or objects' : 'objects'}.`);
            }
        }
        validateStyles(entry.styles);
        validateStyles(entry.darkStyles);
        for (const group of ['states', 'darkStates', 'parts']) {
            if (entry[group] === undefined)
                continue;
            if (!entry[group] || typeof entry[group] !== 'object' || Array.isArray(entry[group]))
                failure('UI_KIT_COMPONENT_STATES_INVALID', `${group} must be an object.`);
            Object.values(entry[group]).forEach(validateStyles);
        }
        return { ...JSON.parse(JSON.stringify(entry)), id, name, type };
    });
}
export function componentSupported(component) {
    return UI_KIT_COMPONENT_TYPES.includes(component.type);
}
/** Numbered palette slots retain the existing Color Library authority. */
export function componentCssValue(value) {
    const slots = { primary: 1, text: 2, background: 3, muted: 4, accent: 5 };
    return Object.hasOwn(slots, value) ? `var(--bp-color-default-${slots[value]})` : value;
}
/** Resolve once at insertion; instances retain a portable preset snapshot. */
export function resolveKitComponent(presets, kitId, componentId, props) {
    const component = presets.find(kit => kit.id === kitId)?.components?.find(entry => entry.id === componentId);
    if (!component)
        failure('UI_KIT_COMPONENT_NOT_FOUND', `${kitId}/${componentId}`);
    if (!componentSupported(component))
        failure('UI_KIT_COMPONENT_RENDERER_MISSING', component.type);
    if (props !== undefined && (!props || typeof props !== 'object' || Array.isArray(props)))
        failure('UI_KIT_COMPONENT_PROPS_INVALID', 'Overrides must be an object.');
    return normalizeKitComponents([{ ...component, props: { ...component.props, ...(props || {}) } }])[0];
}
export function componentWidgetPreset(component, sourcePresetId = '') {
    return {
        id: `ui-kit:${sourcePresetId}:${component.id}`, title: component.name, widgetId: 'uiKitComponent',
        size: { w: component.type === 'tabs' ? 520 : 320, h: ['tabs', 'textarea'].includes(component.type) ? 240 : 100 },
        minSize: { w: 80, h: 32 }, settings: { component, sourcePresetId }
    };
}
