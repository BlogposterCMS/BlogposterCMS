/** View state only: an app may select a locale on its current shell route, never an arbitrary destination. */
export function setAppViewLanguage(payload) {
    const language = payload && typeof payload === 'object' ? payload.language : null;
    if (typeof language !== 'string' || language.length > 35 || !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(language))
        throw new Error('APP_VIEW_LANGUAGE_INVALID');
    const normalized = language.toLowerCase();
    const url = new URL(location.href);
    url.searchParams.set('lang', normalized);
    if (url.searchParams.has('contentLang'))
        url.searchParams.set('contentLang', normalized);
    history.replaceState(history.state, '', url.href);
    return { language: normalized };
}
