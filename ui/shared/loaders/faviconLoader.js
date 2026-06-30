import { runtimePublicPayload, unwrapRuntimeFacadeData } from '../api-client/runtimeFacade.js';
export async function loadFavicon() {
    if (typeof window.meltdownEmit !== 'function')
        return;
    try {
        const jwt = await window.meltdownEmit('issuePublicToken', {
            purpose: 'favicon',
            moduleName: 'auth'
        });
        const settings = unwrapRuntimeFacadeData(await window.meltdownEmit('cmsPublicRuntimeRequest', runtimePublicPayload(jwt, 'settings', 'public', { keys: ['FAVICON_URL'] })));
        const url = settings && typeof settings === 'object' ? settings.FAVICON_URL : undefined;
        if (typeof url === 'string' && url) {
            let link = document.querySelector('link[rel="icon"]');
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = url;
        }
    }
    catch (err) {
        console.error('[faviconLoader] Failed to load favicon', err);
    }
}
void loadFavicon();
