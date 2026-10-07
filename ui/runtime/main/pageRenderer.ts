import { beginAdminRegion, failAdminRegion, finishAdminRegion } from '../../shared/feedback/adminShellLoading.js';
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
  initializeRuntimeDesignDefaults,
  loadRuntimeGlobalLayout,
  resolveRuntimeWidgetLane
} from './runtimePageData.js';
import { renderPublicRuntimePageContent } from './runtimePageComposition.js';
import { renderAdminRuntimeGrid } from './runtimeAdminGrid.js';
import { bindAdminContentNavigation } from './runtimeAdminNavigation.js';
import { applyRuntimeGlobalBackground } from './runtimeGlobalBackground.js';
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

async function renderRuntimePageContent(
  context: RuntimePageContextValue,
  mode: RuntimeRenderMode = 'full',
  presentationReady: Promise<unknown> = Promise.resolve()
): Promise<void> {
  const { slug, lane, debug } = context;
  ensureGlobalStyle(lane);
  if (debug) console.debug('[Renderer] boot', { slug, lane, mode });

  // Discover page-dependent assets as soon as the page is known. Presentation
  // defaults still gate rendering, but must not delay independent asset reads.
  const [prepared] = await Promise.all([
    (async () => {
      const page = await fetchRuntimePageBySlug(meltdownEmit, slug, lane);
      if (!page) return null;
      const config = resolveRuntimeShellConfig(page, page.meta || {}, context);
      const widgetLane = resolveRuntimeWidgetLane(lane, config);
      const [allWidgets, globalLayout] = await Promise.all([
        fetchRuntimeWidgetRegistry(meltdownEmit, lane, widgetLane) as Promise<WidgetDefinition[]>,
        lane === 'admin' && page.meta?.dashboardLayout === 'fixed'
          ? Promise.resolve([] as LayoutItem[])
          : loadRuntimeGlobalLayout(meltdownEmit, lane).catch(err => {
            console.warn('[Renderer] failed to load global layout', err);
            return [] as LayoutItem[];
          }),
        (async () => {
          // Do not mutate the shell after a failed presentation bootstrap.
          await presentationReady;
          ensureLayout(config.layout || {}, lane);
          await hydrateRuntimeShellPartials(config, { mode });
        })()
      ]);
      const contentEl = document.getElementById('content');
      if (!contentEl) return { page, missingContent: true as const };
      return { page, config, contentEl, allWidgets, globalLayout };
    })(),
    applyRuntimeGlobalBackground(lane, meltdownEmit),
    presentationReady
  ]);
  if (!prepared) {
    if (lane === 'admin') throw new Error('ADMIN_SHELL_PAGE_NOT_FOUND');
    await bpDialog.alert('Page not found');
    return;
  }

  if ('missingContent' in prepared) return;
  const { page, config, contentEl, allWidgets, globalLayout } = prepared;
  if (debug) console.debug('[Renderer] page', page);
  applyRuntimePageTitle(page, lane);
  contentEl.dataset.dashboardLayout = lane === 'admin' && config.dashboardLayout === 'fixed' ? 'fixed' : 'custom';
  if (debug) console.debug('[Renderer] widgets', allWidgets);
  exposeRuntimeWidgetRegistry(allWidgets);

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
}

export async function renderRuntimePage(
  context: RuntimePageContextValue,
  mode: RuntimeRenderMode = 'full',
  presentationReady: Promise<unknown> = Promise.resolve()
): Promise<void> {
  const content = context.lane === 'admin' ? document.getElementById('content') : null;
  // Start before page discovery, not after the same slow request chain.
  if (content) beginAdminRegion(content);
  try {
    await renderRuntimePageContent(context, mode, presentationReady);
    if (content) finishAdminRegion(content);
  } catch (error) {
    if (content) failAdminRegion(content, 'ADMIN_SHELL_PAGE_FAILED');
    throw error;
  }
}

export async function bootPageRenderer(): Promise<void> {
  try {
    const context = resolveRuntimePageContext();
    const presentationReady = typeof window.meltdownEmit === 'function'
      ? initializeRuntimeDesignDefaults(window.meltdownEmit, context.lane)
      : Promise.resolve();
    await renderRuntimePage(context, 'full', presentationReady);
    if (context.lane === 'admin' && !unbindAdminNavigation) {
      unbindAdminNavigation = bindAdminContentNavigation({
        render: async request => {
          await renderRuntimePage(resolveRuntimePageContext(request), 'content-only');
        }
      });
    }
  } catch (err) {
    console.error('[Renderer] Fatal error:', err);
    if (resolveRuntimePageContext().lane === 'admin') {
      document.querySelectorAll<HTMLElement>('.admin-panel [data-admin-loading="loading"]')
        .forEach(region => failAdminRegion(region, 'ADMIN_SHELL_BOOT_FAILED'));
    } else {
      await bpDialog.alert('Renderer error: ' + (err instanceof Error ? err.message : String(err)));
    }
  }
}
