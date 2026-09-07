/** @jest-environment jsdom */
import { hydratePublicWidgets, type PublicWidgetJob } from '../ui/runtime/main/publicWidgetScheduling';

jest.mock('../ui/runtime/main/runtimeWidgetHydration', () => ({
  waitForRuntimeWidgetShellPaint: jest.fn().mockResolvedValue(undefined)
}));

function job(id: string, top: number, order: string[]): PublicWidgetJob {
  const element = document.createElement('div');
  element.id = id;
  element.getBoundingClientRect = () => ({ top, bottom: top + 100, left: 0, right: 200, width: 200, height: 100 } as DOMRect);
  document.body.append(element);
  return { element, render: async () => { order.push(id); } };
}

describe('public viewport hydration', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('hydrates the visible widget before earlier offscreen entries, then completes all', async () => {
    const order: string[] = [];
    await hydratePublicWidgets([job('footer', 3000, order), job('hero', 0, order)]);
    expect(order).toEqual(['hero', 'footer']);
  });

  test('rechecks viewport after rendering instead of freezing the initial order', async () => {
    const order: string[] = [];
    const footer = job('footer', 3000, order);
    const middle = job('middle', 2000, order);
    const hero = job('hero', 0, order);
    hero.render = async () => {
      order.push('hero');
      middle.element.getBoundingClientRect = () => ({ top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100 } as DOMRect);
    };
    await hydratePublicWidgets([footer, middle, hero]);
    expect(order).toEqual(['hero', 'middle', 'footer']);
  });

  test('scripted widgets stay eager and idle callbacks have a finite timeout', async () => {
    const order: string[] = [];
    const idle = jest.fn((callback: IdleRequestCallback) => { callback({ didTimeout: false, timeRemaining: () => 10 }); return 1; });
    window.requestIdleCallback = idle;
    try {
      const scripted = { ...job('scripted', 3000, order), eager: true };
      await hydratePublicWidgets([scripted, job('hero', 0, order), job('footer', 4000, order)]);
      expect(order).toEqual(['scripted', 'hero', 'footer']);
      expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 500 });
    } finally { delete (window as any).requestIdleCallback; }
  });

  test('skips removed shells and isolates rendering failures', async () => {
    const order: string[] = [];
    const removed = job('removed', 0, order);
    removed.element.remove();
    const broken = job('broken', 0, order);
    broken.render = async () => { throw new Error('fixture failure'); };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await hydratePublicWidgets([removed, broken, job('hero', 0, order)]);
      expect(order).toEqual(['hero']);
      expect(broken.element.dataset.widgetHydrationState).toBe('failed');
      expect(broken.element.getAttribute('aria-busy')).toBe('false');
      expect(warn).toHaveBeenCalledWith('PUBLIC_WIDGET_HYDRATION_FAILED', expect.any(Error));
    } finally { warn.mockRestore(); }
  });
});
