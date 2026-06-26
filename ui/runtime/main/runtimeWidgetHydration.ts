export type RuntimeWidgetHydrationState = 'shell' | 'hydrating' | 'ready' | 'failed';

export function markRuntimeWidgetHydrationState(
  wrapper: HTMLElement,
  state: RuntimeWidgetHydrationState,
  detail = ''
): void {
  wrapper.dataset.widgetHydrationState = state;
  wrapper.classList.toggle('loading', state === 'shell' || state === 'hydrating');
  wrapper.classList.toggle('hydrating', state === 'hydrating');
  wrapper.classList.toggle('loaded', state === 'ready');
  wrapper.classList.toggle('failed', state === 'failed');
  wrapper.setAttribute('aria-busy', state === 'shell' || state === 'hydrating' ? 'true' : 'false');

  if (detail) {
    wrapper.dataset.widgetHydrationDetail = detail;
  } else {
    delete wrapper.dataset.widgetHydrationDetail;
  }
}

export function markRuntimeWidgetShell(
  wrapper: HTMLElement,
  placeholder?: HTMLElement | null
): void {
  markRuntimeWidgetHydrationState(wrapper, 'shell');
  if (!placeholder) return;
  placeholder.dataset.widgetHydrationState = 'shell';
  placeholder.setAttribute('role', 'status');
  placeholder.setAttribute('aria-live', 'polite');
}

export function waitForRuntimeWidgetShellPaint(): Promise<void> {
  return new Promise(resolve => {
    const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : null;

    if (!raf) {
      setTimeout(resolve, 0);
      return;
    }

    // Hydration starts after the browser had a chance to paint the stable grid
    // and placeholders, so widget imports/data work cannot block first layout.
    raf(() => setTimeout(resolve, 0));
  });
}
