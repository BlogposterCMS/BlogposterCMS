import { orchestrate } from './envelope/orchestrator.js';
import {
  importDesignerLivePreviewRuntime,
  loadPublicRuntimeLoaders
} from './publicLoaderImporter.js';
import { emitRuntimePublic } from '../shared/api-client/runtimeFacade.js';
import {
  configureColorLibraryClient,
  refreshColorLibrary
} from '../shared/colors/colorLibrary.js';
import {
  configureFontPackagesClient,
  refreshFontPackages
} from '../shared/fonts/fontPackages.js';
import type { RuntimeEnvelope } from './envelope/orchestrator.js';

interface StartPageResponse {
  slug?: unknown;
}

const DESIGNER_LIVE_PREVIEW_QUERY = 'designer-live-preview';

function hasDesignerLivePreviewQuery(): boolean {
  try {
    return new URLSearchParams(window.location.search).has(DESIGNER_LIVE_PREVIEW_QUERY);
  } catch {
    return false;
  }
}

function getMeltdownEmit(): NonNullable<Window['meltdownEmit']> {
  const emit = window.meltdownEmit;
  if (typeof emit !== 'function') {
    throw new Error('window.meltdownEmit is required before public runtime boot.');
  }
  return emit;
}

async function ensureToken(): Promise<void> {
  const emit = getMeltdownEmit();
  if (!window.PUBLIC_TOKEN) {
    window.PUBLIC_TOKEN = await emit<string | null>('ensurePublicToken', {
      moduleName: 'auth',
      moduleType: 'core'
    }).catch(() => null);
  }
}

export async function bootPublicRuntime(): Promise<void> {
  const livePreview = hasDesignerLivePreviewQuery();
  await ensureToken();
  const emit = getMeltdownEmit();
  configureColorLibraryClient({
    emit,
    token: window.PUBLIC_TOKEN,
    lane: 'public'
  });
  configureFontPackagesClient({
    emit,
    token: window.PUBLIC_TOKEN,
    lane: 'public'
  });
  await refreshColorLibrary().catch(error => {
    console.warn('COLOR_LIBRARY_PUBLIC_LOAD_FAILED: Linked colors will use serialized fallbacks.', error);
  });
  await refreshFontPackages().catch(error => {
    console.warn('FONT_PACKAGES_PUBLIC_LOAD_FAILED: Content will use browser typography.', error);
  });
  if (livePreview) {
    await importDesignerLivePreviewRuntime();
    return;
  }
  let slug = location.pathname.replace(/^\/+/, '') || '';
  if (!slug) {
    const start = await emitRuntimePublic<StartPageResponse | null>(emit, window.PUBLIC_TOKEN, 'pages', 'start', {
      language: window.LANG || 'en'
    }).catch(() => null);
    slug = typeof start?.slug === 'string' ? start.slug : '';
  }
  if (!slug) {
    console.error('No start page configured');
    return;
  }
  const envelope = await emitRuntimePublic<RuntimeEnvelope>(emit, window.PUBLIC_TOKEN, 'pages', 'envelope', {
    slug,
    language: window.LANG || 'en'
  });
  if (envelope?.meta?.seoTitle) {
    document.title = envelope.meta.seoTitle;
  }
  await loadPublicRuntimeLoaders(envelope);
  const ctx = {
    meltdownEmit: emit,
    publicToken: window.PUBLIC_TOKEN,
    env: 'csr'
  } as const;
  await orchestrate(envelope, ctx);
}
