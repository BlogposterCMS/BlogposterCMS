import { renderAdminSettingsSurface } from './widgetRuntimeGateway.js';
import { bpDialog } from '../../shared/dialogs/bpDialog.js';
import {
  ensureGlobalStyle,
  ensureLayout,
  resolveRuntimeShellConfig
} from './runtimePageShell.js';
import { hydrateRuntimeShellPartials } from './runtimeShellPartials.js';
import {
  fetchRuntimePageBySlug,
  fetchRuntimeWidgetRegistry,
  loadRuntimeGlobalLayout,
  resolveRuntimeWidgetLane
} from './runtimePageData.js';
import { renderPublicRuntimePageContent } from './runtimePageComposition.js';
import { renderAdminRuntimeGrid } from './runtimeAdminGrid.js';
import { bindAdminContentNavigation } from './runtimeAdminNavigation.js';
import {
  type RuntimeWidgetDefinition
} from './runtimeWidgetRenderer.js';
import { createDebouncedEmitter } from './runtimeWidgetEvents.js';
import {
  applyRuntimePageTitle,
  exposeRuntimeWidgetRegistry,
  resolveRuntimePageContext
} from './runtimePageContext.js';

type LooseRecord = Record<string, any>;
type WidgetDefinition = RuntimeWidgetDefinition;
type LayoutItem = LooseRecord;
type RuntimePageContextValue = ReturnType<typeof resolveRuntimePageContext>;
type RuntimeRenderMode = 'full' | 'content-only';

declare const meltdownEmit: (eventName: string, payload?: LooseRecord) => Promise<any>;

const emitDebounced = createDebouncedEmitter(100);
let unbindAdminNavigation: (() => void) | null = null;

function beginContentTransition(contentEl: HTMLElement, mode: RuntimeRenderMode): () => void {
  if (mode !== 'content-only') return () => undefined;
  contentEl.classList.remove('is-content-ready');
  contentEl.classList.add('is-content-refreshing');

  return () => {
    contentEl.classList.remove('is-content-refreshing');
    contentEl.classList.add('is-content-ready');
    window.setTimeout(() => {
      contentEl.classList.remove('is-content-ready');
    }, 360);
  };
}

export async function renderRuntimePage(
  context: RuntimePageContextValue,
  mode: RuntimeRenderMode = 'full'
): Promise<void> {
  const { slug, lane, debug } = context;
  ensureGlobalStyle(lane);
  if (debug) console.debug('[Renderer] boot', { slug, lane, mode });

  const page = await fetchRuntimePageBySlug(meltdownEmit, slug, lane);
  if (debug) console.debug('[Renderer] page', page);
  if (!page) {
    await bpDialog.alert('Page not found');
    return;
  }

  const config = resolveRuntimeShellConfig(page, page.meta || {}, context);
  applyRuntimePageTitle(page, lane);
  ensureLayout(config.layout || {}, lane);

  const contentEl = document.getElementById('content');

  if (!contentEl) return;
  const finishContentTransition = beginContentTransition(contentEl, mode);

  try {
    if (mode === 'content-only') {
      await hydrateRuntimeShellPartials(config, { mode: 'content-only' });
    } else {
      await hydrateRuntimeShellPartials(config);
    }

    const widgetLane = resolveRuntimeWidgetLane(lane, config);
    const allWidgets = await fetchRuntimeWidgetRegistry(meltdownEmit, lane, widgetLane) as WidgetDefinition[];
    if (debug) console.debug('[Renderer] widgets', allWidgets);
    exposeRuntimeWidgetRegistry(allWidgets);

    let globalLayout: LayoutItem[] = [];
    try {
      globalLayout = await loadRuntimeGlobalLayout(meltdownEmit, lane);
    } catch (err) {
      console.warn('[Renderer] failed to load global layout', err);
    }

    if (lane !== 'admin') {
      await renderPublicRuntimePageContent({
        page,
        config,
        contentEl,
        globalLayout,
        allWidgets,
        lane,
        emit: meltdownEmit,
        widgetEmit: emitDebounced,
        debug
      });
      return;
    }

    const renderedSettingsSurface = await renderAdminSettingsSurface(contentEl, page);
    if (renderedSettingsSurface) {
      return;
    }

    await renderAdminRuntimeGrid({
      page,
      contentEl,
      globalLayout,
      allWidgets,
      lane,
      emit: meltdownEmit,
      widgetEmit: emitDebounced,
      debug
    });
  } finally {
    finishContentTransition();
  }
}

export async function bootPageRenderer(): Promise<void> {
  try {
    const context = resolveRuntimePageContext();
    await renderRuntimePage(context);
    if (context.lane === 'admin' && !unbindAdminNavigation) {
      unbindAdminNavigation = bindAdminContentNavigation({
        render: async request => {
          await renderRuntimePage(resolveRuntimePageContext(request), 'content-only');
        }
      });
    }
  } catch (err) {
    console.error('[Renderer] Fatal error:', err);
    await bpDialog.alert('Renderer error: ' + (err instanceof Error ? err.message : String(err)));
  }
}
