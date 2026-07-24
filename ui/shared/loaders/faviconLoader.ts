import {
  runtimePublicPayload,
  unwrapRuntimeFacadeData
} from '../api-client/runtimeFacade.js';

type PublicSettings = Record<string, unknown>;

function isDesignerLivePreview(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('designer-live-preview');
  } catch {
    return false;
  }
}

export async function loadFavicon(): Promise<void> {
  // A nested draft preview does not own public-site chrome and must not mint
  // tokens from its sandboxed opaque origin.
  if (isDesignerLivePreview()) return;
  if (typeof window.meltdownEmit !== 'function') return;
  try {
    const jwt = await window.meltdownEmit<string | null>('issuePublicToken', {
      purpose: 'favicon',
      moduleName: 'auth'
    });
    const settings = unwrapRuntimeFacadeData<PublicSettings>(await window.meltdownEmit(
      'cmsPublicRuntimeRequest',
      runtimePublicPayload(jwt, 'settings', 'public', { keys: ['FAVICON_URL'] })
    ));
    const url = settings && typeof settings === 'object' ? settings.FAVICON_URL : undefined;
    if (typeof url === 'string' && url) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = url;
    }
  } catch (err) {
    console.error('[faviconLoader] Failed to load favicon', err);
  }
}

void loadFavicon();
