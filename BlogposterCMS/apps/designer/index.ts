import { fetchPartial } from './fetchPartial.js';
import { initBuilder } from './builderRenderer';
import { enableAutoEdit } from './editor/editor.js';
import { sanitizeHtml } from '../../public/plainspace/sanitizer.js';
import { initBuilderPanel } from './managers/panelManager.js';
import { applyUserColor } from '../../public/assets/js/userColor.js';
import { createLogger } from './utils/logger';

type OriginTokenPayload = {
  origins: string[];
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

type InitTokensMessage = {
  type: 'init-tokens';
  csrfToken?: string;
  adminToken?: string;
  allowedOrigins?: string[];
  allowedOrigin?: string;
  originToken?: string;
};

type RefreshMessage = {
  type: 'refresh';
};

type ParentMessage = InitTokensMessage | RefreshMessage | Record<string, unknown>;

const appLogger = createLogger('builder:app');

const LOADER_VARIANTS = {
  sidebar: { className: 'designer-loader--sidebar', lines: 6 },
  panel: { className: 'designer-loader--panel', lines: 4 },
  section: { className: 'designer-loader--section', lines: 3 }
};

const createLoaderElement = (variantKey = 'section') => {
  const variant = LOADER_VARIANTS[variantKey] || LOADER_VARIANTS.section;
  const loader = document.createElement('div');
  loader.classList.add('designer-loader', variant.className);
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');

  const srLabel = document.createElement('span');
  srLabel.className = 'designer-sr-only';
  srLabel.textContent = 'Loading content';
  loader.appendChild(srLabel);

  const lines = Number.isFinite(variant.lines) ? variant.lines : 3;
  for (let i = 0; i < lines; i += 1) {
    const bar = document.createElement('span');
    bar.className = 'designer-loader__bar';
    const width = Math.max(40, 100 - (i * 12));
    bar.style.setProperty('--loader-bar-width', `${width}%`);
    bar.style.setProperty('--loader-bar-delay', `${i * 0.08}s`);
    loader.appendChild(bar);
  }

  return loader;
};

const attachLoader = ({ container, before, variant = 'section' }) => {
  if (!container && !before) {
    return { remove: () => {}, element: null };
  }

  const loader = createLoaderElement(variant);
  if (before && before.parentElement) {
    before.parentElement.insertBefore(loader, before);
  } else if (container) {
    container.appendChild(loader);
  }

  const remove = () => {
    if (loader.isConnected) {
      loader.remove();
    }
  };

  return { remove, element: loader };
};

const renderLoadError = ({
  container,
  before,
  message,
  title = 'Unable to load content',
  variant = 'section',
  replace = false
}) => {
  if (!container && !before) {
    return null;
  }

  const error = document.createElement('div');
  error.classList.add('designer-load-error', `designer-load-error--${variant}`);
  error.setAttribute('role', 'alert');
  error.setAttribute('aria-live', 'assertive');

  const heading = document.createElement('p');
  heading.className = 'designer-load-error__title';
  heading.textContent = title;
  const description = document.createElement('p');
  description.className = 'designer-load-error__message';
  description.textContent = message;

  error.append(heading, description);

  if (replace && container) {
    container.replaceChildren(error);
  } else if (before && before.parentElement) {
    before.parentElement.insertBefore(error, before);
  } else if (container) {
    container.appendChild(error);
  }

  return error;
};

const bootState = {
  bootstrapped: false,
  originPolicyReady: false
};

const urlParams = new URLSearchParams(window.location.search);
const originTokenParam = urlParams.get('originToken') ?? '';

const allowedOrigins = new Set<string>();

const textDecoder = new TextDecoder();

const normalizeOrigin = (value: unknown): string | null => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === 'null') {
    return null;
  }
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.origin;
    }
    return null;
  } catch {
    return null;
  }
};

const getPrimaryAllowedOrigin = (): string => {
  const first = allowedOrigins.values().next();
  return first.done ? window.location.origin : first.value;
};

let parentPostMessageOrigin = window.location.origin;

const addAllowedOrigins = (origins: unknown): void => {
  if (!Array.isArray(origins)) return;
  let changed = false;
  origins.forEach((originValue) => {
    const normalized = normalizeOrigin(originValue);
    if (normalized && !allowedOrigins.has(normalized)) {
      allowedOrigins.add(normalized);
      changed = true;
    }
  });
  if (changed) {
    parentPostMessageOrigin = getPrimaryAllowedOrigin();
  }
};

const isAllowedOrigin = (origin: string | null): boolean => {
  const normalized = normalizeOrigin(origin);
  return normalized ? allowedOrigins.has(normalized) : false;
};

const base64UrlToUint8 = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.length % 4 === 0
    ? normalized
    : `${normalized}${'='.repeat(4 - (normalized.length % 4))}`;
  const binary = window.atob(padded);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const pemToUint8Array = (pem: string): Uint8Array => {
  const trimmed = pem.replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = window.atob(trimmed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

let cachedPublicKeyPem: string | null = null;
let originPublicKeyPromise: Promise<string | null> | undefined;

const fetchOriginPublicKey = async (): Promise<string | null> => {
  if (cachedPublicKeyPem) {
    return cachedPublicKeyPem;
  }
  if (!window.fetch) {
    appLogger.error('Fetch API unavailable; cannot load origin public key');
    return null;
  }
  if (!originPublicKeyPromise) {
    originPublicKeyPromise = (async () => {
      try {
        const response = await window.fetch('/apps/designer/origin-public-key.json', {
          credentials: 'same-origin',
          cache: 'no-store',
          mode: 'same-origin',
          redirect: 'error'
        });
        if (!response.ok) {
          appLogger.warn('Failed to load origin public key', response.status, response.statusText);
          return null;
        }
        const data = await response.json();
        const publicKey = typeof data?.publicKey === 'string' ? data.publicKey.trim() : '';
        if (!publicKey.startsWith('-----BEGIN PUBLIC KEY-----')) {
          appLogger.warn('Origin public key response malformed');
          return null;
        }
        cachedPublicKeyPem = publicKey;
        return cachedPublicKeyPem;
      } catch (err) {
        appLogger.warn('Error fetching origin public key', err);
        return null;
      } finally {
        originPublicKeyPromise = undefined;
      }
    })();
  }
  return originPublicKeyPromise ?? Promise.resolve(null);
};

const verifyWithSubtle = async (
  publicKeyPem: string,
  payload: Uint8Array,
  signature: Uint8Array
): Promise<boolean> => {
  if (!window.crypto?.subtle) {
    appLogger.error('WebCrypto not available for origin token verification');
    return false;
  }
  const keyData = pemToUint8Array(publicKeyPem);
  try {
    const cryptoKey = await window.crypto.subtle.importKey(
      'spki',
      keyData,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['verify']
    );
    return window.crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signature,
      payload
    );
  } catch (err) {
    appLogger.error('Failed to verify origin token signature', err);
    return false;
  }
};

let tokenPayloadCache: OriginTokenPayload | null = null;

const decodeOriginToken = async (): Promise<OriginTokenPayload | null> => {
  if (tokenPayloadCache) {
    return tokenPayloadCache;
  }
  if (!originTokenParam) {
    appLogger.warn('Missing origin token query parameter');
    return null;
  }
  const [payloadPart, signaturePart] = originTokenParam.split('.');
  if (!payloadPart || !signaturePart) {
    appLogger.warn('Invalid origin token format');
    return null;
  }
  const publicKeyPem = await fetchOriginPublicKey();
  if (!publicKeyPem) {
    appLogger.warn('Unable to resolve origin public key');
    return null;
  }
  const payloadBytes = base64UrlToUint8(payloadPart);
  const signatureBytes = base64UrlToUint8(signaturePart);
  const valid = await verifyWithSubtle(publicKeyPem, payloadBytes, signatureBytes);
  if (!valid) {
    appLogger.warn('Origin token signature rejected');
    return null;
  }
  try {
    const payloadText = textDecoder.decode(payloadBytes);
    const payload = JSON.parse(payloadText) as OriginTokenPayload;
    if (!Array.isArray(payload.origins) || !payload.origins.length) {
      appLogger.warn('Origin token payload missing origins');
      return null;
    }
    if (typeof payload.expiresAt === 'number' && payload.expiresAt < Date.now()) {
      appLogger.warn('Origin token expired');
      return null;
    }
    tokenPayloadCache = payload;
    return payload;
  } catch (err) {
    appLogger.warn('Failed to parse origin token payload', err);
    return null;
  }
};

const ensureOriginPolicy = async (): Promise<boolean> => {
  const payload = await decodeOriginToken();
  if (!payload) {
    return false;
  }
  addAllowedOrigins(payload.origins);
  const referrerOrigin = normalizeOrigin(document.referrer);
  if (!referrerOrigin || !allowedOrigins.has(referrerOrigin)) {
    appLogger.warn('Referrer origin is not authorised to bootstrap designer');
    return false;
  }
  parentPostMessageOrigin = referrerOrigin;
  bootState.originPolicyReady = true;
  return true;
};

const readyOriginPolicyPromise = ensureOriginPolicy();


async function bootstrap() {
  if (bootState.bootstrapped) return;
  bootState.bootstrapped = true;
  await applyUserColor(true);
  const sidebarEl = document.getElementById('sidebar');
  const contentEl = document.getElementById('builderMain');
  const rowEl = document.getElementById('builderRow');
  if (!sidebarEl || !contentEl || !rowEl) {
    appLogger.error('Missing required layout containers');
    return;
  }
  const sidebarLoader = attachLoader({ container: sidebarEl, variant: 'sidebar' });
  try {
    const sidebarMarkup = await fetchPartial('sidebar-builder');
    sidebarEl.innerHTML = sanitizeHtml(sidebarMarkup);
  } catch (err) {
    appLogger.error('Failed to load sidebar', err);
    renderLoadError({
      container: sidebarEl,
      message: 'The builder sidebar could not be loaded. Please refresh the page.',
      title: 'Sidebar unavailable',
      variant: 'sidebar',
      replace: true
    });
  } finally {
    sidebarLoader.remove();
  }

  let panelContainer = null;
  const contentAnchor = document.getElementById('content');
  const panelLoader = attachLoader({ container: rowEl, before: contentAnchor, variant: 'panel' });
  try {
    const panelHtml = await fetchPartial('builder-panel');
    const tpl = document.createElement('template');
    tpl.innerHTML = sanitizeHtml(panelHtml);
    panelContainer = tpl.content.firstElementChild;
    if (panelContainer && rowEl) {
      panelLoader.remove();
      rowEl.insertBefore(panelContainer, contentAnchor);
      let textPanelLoaded = false;
      const textLoader = attachLoader({ container: panelContainer, variant: 'section' });
      try {
        const textHtml = await fetchPartial('text-panel', 'builder');
        panelContainer.innerHTML = sanitizeHtml(textHtml);
        textPanelLoaded = true;
      } catch (e) {
        appLogger.error('Failed to load text tools panel', e);
        renderLoadError({
          container: panelContainer,
          message: 'The text tools panel is unavailable right now. Reload the designer to try again.',
          title: 'Text panel unavailable',
          variant: 'section',
          replace: true
        });
      } finally {
        textLoader.remove();
      }

      if (textPanelLoaded) {
        const colorLoader = attachLoader({ container: panelContainer, variant: 'section' });
        try {
          const colorHtml = await fetchPartial('color-panel', 'builder');
          panelContainer.insertAdjacentHTML('beforeend', sanitizeHtml(colorHtml));
          const colorPanel = panelContainer.querySelector('.color-panel');
          if (colorPanel) colorPanel.style.display = 'none';
        } catch (e) {
          appLogger.warn('Failed to load color panel', e);
          renderLoadError({
            container: panelContainer,
            message: 'Color controls could not be loaded. Some styling actions may be unavailable.',
            title: 'Color panel unavailable',
            variant: 'section'
          });
        } finally {
          colorLoader.remove();
        }
      }
    }
  } catch (e) {
    appLogger.error('Failed to load builder panel', e);
    panelLoader.remove();
    renderLoadError({
      container: rowEl,
      before: contentAnchor,
      message: 'The builder controls failed to load. Try refreshing the page.',
      title: 'Builder panel unavailable',
      variant: 'panel'
    });
  } finally {
    panelLoader.remove();
  }

  initBuilderPanel();

  const designId = urlParams.get('designId');
  const layoutNameParam = urlParams.get('layout') || null;
  const layerParam = parseInt(urlParams.get('layer'), 10);
  const startLayer = Number.isFinite(layerParam) ? layerParam : 1;

  if (designId) {
    document.body.dataset.designId = designId;
  }
  const dvParam = parseInt(urlParams.get('designVersion'), 10);
  if (!Number.isNaN(dvParam)) {
    document.body.dataset.designVersion = String(dvParam);
  }

  await initBuilder(sidebarEl, contentEl, null, startLayer, layoutNameParam);
  enableAutoEdit();

  window.parent.postMessage({ type: 'designer-ready' }, parentPostMessageOrigin);
}

function maybeBootstrap() {
  if (window.CSRF_TOKEN && typeof window.ADMIN_TOKEN !== 'undefined' && document.readyState !== 'loading') {
    bootstrap();
  }
}

window.addEventListener('message', async (event: MessageEvent<ParentMessage>) => {
  if (event.source !== window.parent) {
    return;
  }
  const policyReady = bootState.originPolicyReady || await readyOriginPolicyPromise;
  if (!policyReady) {
    return;
  }
  if (!isAllowedOrigin(event.origin)) {
    return;
  }
  const msg = (event.data ?? {}) as ParentMessage;
  if (msg.type === 'init-tokens') {
    if (msg.originToken && msg.originToken !== originTokenParam) {
      appLogger.warn('Rejecting init message with mismatched origin token');
      return;
    }
    const respondingOrigin = normalizeOrigin(event.origin);
    window.CSRF_TOKEN = msg.csrfToken;
    window.ADMIN_TOKEN = msg.adminToken;
    if (respondingOrigin && allowedOrigins.has(respondingOrigin)) {
      parentPostMessageOrigin = respondingOrigin;
    }
    maybeBootstrap();
  } else if (msg.type === 'refresh') {
    window.location.reload();
  }
});

document.addEventListener('DOMContentLoaded', maybeBootstrap);

readyOriginPolicyPromise.then((isReady) => {
  if (!isReady) {
    appLogger.warn('Origin policy initialisation failed; designer will not bootstrap.');
  }
}).catch((err) => {
  appLogger.error('Unexpected error while enforcing origin policy', err);
});
