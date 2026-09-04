

// Unbundled browser loaders use the public ESM facade, not server CommonJS.
import { emitRuntimePublic } from '/ui/shared/api-client/runtimeFacade.js';

type DesignerLoaderContext = {
  meltdownEmit?: <T = unknown>(eventName: string, payload?: Record<string, unknown>) => Promise<T>;
  publicToken?: string | null;
  activeLayout?: unknown;
  activeLayoutRef?: unknown;
};

type DesignDescriptor = {
  css?: string[];
  layoutRef?: string;
};

type PublicLayout = {
  grid: { columns: number; cellHeight: number };
  items: unknown[];
  layoutRef?: string;
};

type DesignerRegister = (loaderName: 'design', loader: typeof loadDesign) => void;

function preloadLink(href: string, rel = 'stylesheet'): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  document.head.appendChild(link);
  return link;
}

function fallbackLayout(layoutRef?: string): PublicLayout {
  return {
    grid: { columns: 12, cellHeight: 8 },
    items: [],
    layoutRef
  };
}

async function emitPublicRuntime<T>(
  ctx: DesignerLoaderContext | undefined,
  resource: string,
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  if (!ctx || typeof ctx.meltdownEmit !== 'function') {
    throw new Error('[DesignerPublicLoader:PUBLIC_RUNTIME_EMIT_MISSING] meltdownEmit is required.');
  }
  return emitRuntimePublic<T>(ctx.meltdownEmit, ctx.publicToken, resource, action, params);
}

async function loadDesign(
  descriptor: DesignDescriptor = {},
  ctx?: DesignerLoaderContext
): Promise<PublicLayout> {
  const { css = [], layoutRef } = descriptor;
  css.forEach(href => preloadLink(href, 'stylesheet'));

  const layout = await emitPublicRuntime<PublicLayout | null>(ctx, 'designer', 'getLayout', {
    layoutRef
  }).catch(error => {
    console.warn('[DesignerPublicLoader:LAYOUT_LOAD_FAILED] Falling back to an empty layout.', error);
    return null;
  });

  const activeLayout = layout || fallbackLayout(layoutRef);
  if (ctx && typeof ctx === 'object') {
    ctx.activeLayout = activeLayout;
    ctx.activeLayoutRef = layoutRef;
  }
  return activeLayout;
}

export function registerLoaders(register: DesignerRegister): void {
  register('design', loadDesign);
}

export { loadDesign };
