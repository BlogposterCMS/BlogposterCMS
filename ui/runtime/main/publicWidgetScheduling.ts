import { waitForRuntimeWidgetShellPaint } from './runtimeWidgetHydration.js';

/** Public-only scheduling; callers still own rendering, permissions and errors. */
export type PublicWidgetJob = {
  element: HTMLElement;
  render: () => Promise<unknown>;
  /** Scripted widgets may coordinate with page code and must not wait for idle. */
  eager?: boolean;
};

function isNearViewport(element: HTMLElement, margin: number): boolean {
  const rect = element.getBoundingClientRect();
  // Unknown geometry (hidden tabs, unsized layouts) must not strand content.
  if (!rect.width || !rect.height) return true;
  return rect.bottom >= -margin && rect.top <= window.innerHeight + margin
    && rect.right >= -margin && rect.left <= window.innerWidth + margin;
}

function waitForPublicIdle(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 500 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Paint all geometry first, then hydrate visible widgets before background work.
 * Recheck bounds between jobs so scrolling reprioritizes pending widgets. Idle
 * fallback eventually loads everything, preserving search, print and page-script
 * readiness without a permanent observer or a second transport/cache.
 */
export async function hydratePublicWidgets(jobs: PublicWidgetJob[]): Promise<void> {
  const pending = [...jobs];
  if (pending.length) await waitForRuntimeWidgetShellPaint();
  while (pending.length) {
    let index = pending.findIndex(job => job.eager || isNearViewport(job.element, 0));
    if (index < 0) {
      await waitForPublicIdle();
      // The user may have scrolled while waiting. Visible work always wins.
      index = pending.findIndex(job => isNearViewport(job.element, 0));
      if (index < 0) index = pending.findIndex(job => isNearViewport(job.element, 300));
      if (index < 0) index = 0;
    }
    const [job] = pending.splice(index, 1);
    if (!job || !job.element.isConnected) continue;
    try {
      await job.render();
    } catch (error) {
      // A failed widget must not starve the rest of the published page.
      job.element.dataset.widgetHydrationState = 'failed';
      job.element.setAttribute('aria-busy', 'false');
      console.warn('PUBLIC_WIDGET_HYDRATION_FAILED', error);
    }
  }
}
