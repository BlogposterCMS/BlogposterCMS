import { applyJsonDelta, jsonDelta } from '../../../shared/localization/jsonDelta.js';
import { assertContentLanguage, availableContentLanguages } from '../../../shared/localization/contentLanguages.js';
import { localeDesign, localeWidget, normalizeContentLocale, projectLocalizedDesign, readDesignLocalizations, resolveDesignLocale, saveDesignLocale } from '../../../shared/localization/designLocaleModel.js';
let session;
let pendingLanguage = '';
let resetRequested = false;
/** This is an editor projection of the versioned Designer record, never a second persistence owner. */
export function hydrateDesignerLocale(response) {
    if (!response?.design) {
        session = undefined;
        return response;
    }
    const localizations = readDesignLocalizations(response.design.layout ?? response.design.layout_json);
    const query = new URLSearchParams(location.search);
    const language = normalizeContentLocale(query.get('lang') || query.get('contentLang'), localizations.primaryLanguage);
    session = { base: localeDesign(response), localizations, language, publication: { isDraft: ['1', 'true', 'yes'].includes(String(response.design.is_draft ?? response.design.isDraft ?? false).toLowerCase()), publishedAt: response.design.published_at ?? response.design.publishedAt ?? null } };
    document.documentElement.lang = language;
    return projectLocalizedDesign(response, language);
}
/** Capture the normal editor serialization once so default normalization is not saved as a translation. */
export function captureDesignerLocaleBaseline(layout, widgets) {
    if (session)
        session.initial = { ...localeDesign({ layout, widgets }), styles: resolveDesignLocale(session.base, session.localizations, session.language).styles };
}
export function prepareDesignerLocaleSave(payload) {
    if (!session)
        return { payload, commit() { } };
    const edited = localeDesign(payload);
    // Existing serializers can normalize geometry/defaults. Apply only actual editor changes to the selected stored view.
    const selected = resolveDesignLocale(session.base, session.localizations, session.language);
    const next = session.initial ? applyJsonDelta(selected, jsonDelta(session.initial, edited)) : edited;
    const saved = resetRequested
        ? { base: session.base, localizations: { ...session.localizations, variants: Object.fromEntries(Object.entries(session.localizations.variants).filter(([language]) => language !== session.language)) } }
        : saveDesignLocale(session.base, session.localizations, session.language, next);
    return {
        payload: { ...payload, design: { ...session.publication, ...payload.design, ...saved.base.styles }, widgets: saved.base.widgets,
            layout: { ...saved.base.layout, localizations: saved.localizations } },
        commit() { if (session) {
            session.base = saved.base;
            session.localizations = saved.localizations;
            session.initial = edited;
            if (typeof payload.design.isDraft === 'boolean')
                session.publication.isDraft = payload.design.isDraft;
        } }
    };
}
export async function resetDesignerLocale() {
    const state = designerLocaleState();
    if (!state.inherited || !state.hasOverride)
        throw new Error('DESIGN_LOCALE_OVERRIDE_MISSING');
    await requestDesignerLanguage(state.language);
    resetRequested = true;
    try {
        const result = await window.blogposterDesignerCommands?.execute?.({ action: 'design.save', params: {} });
        if (!result || result.handled === false)
            throw new Error('DESIGN_LOCALE_RESET_FAILED');
        pendingLanguage = state.language;
        return { language: state.language, inherited: true };
    }
    finally {
        resetRequested = false;
    }
}
export function designerLocaleState() {
    const sourceLanguage = session?.localizations.primaryLanguage || 'en';
    const language = session?.language || sourceLanguage;
    const selected = session ? resolveDesignLocale(session.base, session.localizations, language) : null;
    const current = window.blogposterDesignerCommands?.snapshot?.();
    const widgets = current?.document?.widgets?.map(localeWidget) || selected?.widgets || [];
    const content = (widget) => {
        const meta = { ...widget?.code?.meta?.settings, ...widget?.code?.meta };
        return JSON.stringify([widget?.code?.html || '', ...['html', 'text', 'label', 'title', 'description', 'alt', 'caption', 'src', 'href', 'items', 'links', 'placeholder', 'ariaLabel'].map(key => meta[key])]);
    };
    return { language, sourceLanguage, availableLanguages: availableContentLanguages(), inherited: language !== sourceLanguage, locales: [sourceLanguage, ...Object.keys(session?.localizations.variants || {})],
        hasOverride: Boolean(session?.localizations.variants[language]),
        widgets: widgets.map((widget) => ({ id: widget.id, translationStatus: language === sourceLanguage ||
                content(widget) !== content(session?.base.widgets.find(item => item.id === widget.id)) ? 'authored' : 'source-fallback' })) };
}
export async function requestDesignerLanguage(language) {
    const value = normalizeContentLocale(language, '');
    if (!value)
        throw new Error('DESIGN_LOCALE_CODE_INVALID: Enter a language code such as en or zh-CN.');
    const current = window.blogposterDesignerCommands?.snapshot?.();
    if (current?.save?.dirty || current?.save?.busy || current?.publishing?.busy)
        throw new Error('DESIGN_LOCALE_SAVE_REQUIRED: Save changes before switching language.');
    await assertContentLanguage(value, designerLocaleState().locales);
    if (value !== designerLocaleState().language) {
        if (window.parent !== window)
            await window.meltdownEmit?.('appView.setLanguage', { language: value });
        pendingLanguage = value;
    }
    return { language: value };
}
/** Used after the agent command acknowledgement as well as by the visible language control. */
export function finishDesignerLanguageSwitch() {
    if (!pendingLanguage)
        return;
    const language = pendingLanguage;
    pendingLanguage = '';
    let target = window;
    try {
        if (window.parent !== window && window.parent.location.origin === location.origin)
            target = window.parent;
    }
    catch { /* Keep the owned frame when embedded across origins. */ }
    const url = new URL(target.location.href);
    url.searchParams.set('lang', language);
    if (url.searchParams.has('contentPageId'))
        url.searchParams.set('contentLang', language);
    target.location.assign(url.href);
}
export const designerLocaleActions = [{ action: 'locale.open', label: 'Open content language', category: 'localization',
        params: [{ name: 'language', type: 'string', required: true }] },
    { action: 'locale.reset', label: 'Use inherited design for this language', category: 'localization', params: [] }];
