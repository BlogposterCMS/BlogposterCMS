export const CONTENT_LANGUAGES_SETTING = 'WEBSITE_CONTENT_LANGUAGES';
export function contentLanguageCode(value) {
    if (typeof value !== 'string' || value.length > 35 || !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(value))
        throw new Error('CONTENT_LANGUAGE_INVALID');
    try {
        return Intl.getCanonicalLocales(value)[0].toLowerCase();
    }
    catch {
        throw new Error('CONTENT_LANGUAGE_INVALID');
    }
}
/** Settings owns one atomic document. Reading an older installation never creates translations. */
export function contentLanguageConfig(raw, fallback = 'en') {
    if (raw == null || raw === '') {
        const primaryLanguage = contentLanguageCode(fallback || 'en');
        return { version: 1, primaryLanguage, languages: [primaryLanguage] };
    }
    let value = raw;
    if (typeof raw === 'string') {
        try {
            value = JSON.parse(raw);
        }
        catch {
            throw new Error('CONTENT_LANGUAGES_CONFIG_INVALID');
        }
    }
    if (!value || value.version !== 1 || !Array.isArray(value.languages) || !value.languages.length || value.languages.length > 60)
        throw new Error('CONTENT_LANGUAGES_CONFIG_INVALID');
    const primaryLanguage = contentLanguageCode(value.primaryLanguage);
    const languages = [...new Set(value.languages.map(contentLanguageCode))];
    if (!languages.includes(primaryLanguage))
        throw new Error('CONTENT_LANGUAGES_PRIMARY_REQUIRED');
    return { version: 1, primaryLanguage, languages };
}
export function contentLanguageLabel(code) {
    try {
        return `${new Intl.DisplayNames(['en'], { type: 'language' }).of(code)} · ${code}`;
    }
    catch {
        return code;
    }
}
// Picker choices are labels, not a second configuration. Existing custom locales are also retained.
export const CONTENT_LANGUAGE_CHOICES = ('en en-us en-gb zh-cn zh-tw zh-hk de de-de de-ch de-at fr fr-fr fr-ch fr-ca it it-ch es es-es es-mx pt pt-br nl nl-be ar bg bn ca cs da el et fa fi he hi hr hu id is ja ko lt lv ms nb pl ro ru sk sl sr sv sw ta th tr uk ur vi').split(' ');
