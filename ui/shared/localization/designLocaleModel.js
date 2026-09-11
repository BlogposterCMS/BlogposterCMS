import { applyJsonDelta, jsonDelta, validateJsonDelta } from './jsonDelta.js';
export const normalizeContentLocale = (value, fallback = 'en') => typeof value === 'string' && /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(value) && value.length <= 35 ? value.toLowerCase() : fallback;
const parse = (value) => { try {
    const result = typeof value === 'string' ? JSON.parse(value) : value;
    return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
}
catch {
    return {};
} };
export function readDesignLocalizations(layout, sourceLanguage = 'en') {
    const data = parse(parse(layout).localizations);
    if (!Object.keys(data).length)
        return { version: 1, primaryLanguage: normalizeContentLocale(sourceLanguage), variants: {} };
    if (JSON.stringify(data).length > 2000000 || data.version !== 1 || Object.keys(parse(data.variants)).length > 60)
        throw new Error('DESIGN_LOCALE_DOCUMENT_INVALID');
    const variants = {};
    for (const [locale, value] of Object.entries(parse(data.variants))) {
        if (normalizeContentLocale(locale, '') !== locale)
            throw new Error('DESIGN_LOCALE_CODE_INVALID');
        validateJsonDelta(value);
        variants[locale] = value;
    }
    return { version: 1, primaryLanguage: normalizeContentLocale(data.primaryLanguage), variants };
}
/** Canonicalizes the existing database/editor aliases before diffing. No extra content store. */
export function localeWidget(value) {
    const code = parse(value.code), meta = parse(value.metadata ?? code.meta);
    const result = { id: String(value.instanceId ?? value.instance_id ?? value.id ?? ''), widgetId: String(value.widgetId ?? value.widget_id ?? ''),
        code: { html: value.html ?? code.html ?? '', css: value.css ?? code.css ?? '', js: value.js ?? code.js ?? '', meta } };
    for (const key of ['xPercent', 'yPercent', 'wPercent', 'hPercent', 'zIndex', 'rotationDeg', 'opacity']) {
        const snake = key.replace(/[A-Z]/g, character => `_${character.toLowerCase()}`);
        result[key] = Number(value[key] ?? value[snake] ?? (key === 'opacity' ? 1 : 0));
    }
    for (const key of ['workareaId', 'sceneId', 'sceneTitle', 'sceneBackground', 'behavior', 'effects', 'elementName', 'radius', 'responsivePlacement']) {
        const own = value[key] ?? meta[key];
        if (own !== undefined)
            result[key] = own;
    }
    return result;
}
export function localeDesign(response) {
    const design = response.design || response;
    const layout = { ...parse(response.layout ?? design.layout ?? design.layout_json) };
    delete layout.localizations;
    return { layout: Object.keys(layout).length ? layout : null, widgets: (response.widgets || []).map(localeWidget),
        styles: { bgColor: design.bgColor ?? design.bg_color ?? '', bgMediaId: design.bgMediaId ?? design.bg_media_id ?? '', bgMediaUrl: design.bgMediaUrl ?? design.bg_media_url ?? '' } };
}
export function resolveDesignLocale(base, localizations, language) {
    const locale = normalizeContentLocale(language, localizations.primaryLanguage);
    const parent = locale.split('-')[0] || locale;
    // Existing widget-level translations are inherited inputs. Explicit Designer
    // locale edits must win over them in both Studio and the public renderer.
    let result = locale === localizations.primaryLanguage ? base : { ...base, widgets: base.widgets.map(widget => {
            const meta = { ...widget.code.meta }, settings = { ...parse(meta.settings) };
            const translations = parse(meta.translations ?? settings.translations);
            delete meta.translations;
            delete settings.translations;
            if (meta.settings)
                meta.settings = settings;
            return { ...widget, code: { ...widget.code, meta: { ...meta, ...parse(translations[parent]), ...parse(translations[locale]) } } };
        }) };
    if (parent !== locale && parent !== localizations.primaryLanguage)
        result = applyJsonDelta(result, localizations.variants[parent]);
    return locale === localizations.primaryLanguage ? applyJsonDelta(base) : applyJsonDelta(result, localizations.variants[locale]);
}
export function saveDesignLocale(base, localizations, language, edited) {
    const locale = normalizeContentLocale(language, localizations.primaryLanguage);
    if (locale === localizations.primaryLanguage)
        return { base: edited, localizations };
    const inherited = resolveDesignLocale(base, { ...localizations, variants: Object.fromEntries(Object.entries(localizations.variants).filter(([key]) => key !== locale)) }, locale);
    const change = jsonDelta(inherited, edited);
    const variants = { ...localizations.variants };
    if (change)
        variants[locale] = change;
    else
        delete variants[locale];
    return { base, localizations: { ...localizations, variants } };
}
export function projectLocalizedDesign(response, language) {
    if (!response || typeof response !== 'object')
        return response;
    const design = response.design || response;
    const localizations = readDesignLocalizations(design.layout ?? design.layout_json);
    const selected = resolveDesignLocale(localeDesign(response), localizations, language);
    return { ...response, layout: undefined, design: { ...design, layout: selected.layout, layout_json: undefined,
            bg_color: selected.styles.bgColor, bg_media_id: selected.styles.bgMediaId, bg_media_url: selected.styles.bgMediaUrl },
        widgets: selected.widgets.map(item => ({ ...item, instance_id: item.id, widget_id: item.widgetId, html: item.code.html, css: item.code.css, js: item.code.js, metadata: item.code.meta,
            x_percent: item.xPercent, y_percent: item.yPercent, w_percent: item.wPercent, h_percent: item.hPercent, z_index: item.zIndex, rotation_deg: item.rotationDeg })) };
}
