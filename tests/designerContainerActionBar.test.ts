/**
 * @jest-environment jsdom
 */

import { attachContainerBar } from '../ui/designer/app/ux/containerActionBar';

describe('designer container action bar', () => {
  it('renders floating container controls and forwards layout actions', () => {
    const el = document.createElement('section');
    el.className = 'layout-container';
    el.dataset.layoutMode = 'stack';
    document.body.appendChild(el);

    const ctx = {
      placeContainer: jest.fn(),
      setContainerLayoutMode: jest.fn(),
      setContainerSettings: jest.fn(),
      setDynamicHost: jest.fn(),
      setDesignRef: jest.fn(),
      toggleContainerStyleSource: jest.fn(),
      deleteContainer: jest.fn()
    };

    attachContainerBar(el, ctx);

    const toolbar = el.querySelector('.container-actionbar') as HTMLElement;
    expect(toolbar?.getAttribute('role')).toBe('toolbar');

    toolbar.querySelector<HTMLButtonElement>('.bar-add')?.click();
    expect(ctx.placeContainer).toHaveBeenCalledWith(el, 'auto');

    toolbar.querySelector<HTMLButtonElement>('[data-container-mode="row"]')?.click();
    expect(ctx.setContainerLayoutMode).toHaveBeenCalledWith(el, 'row');

    const gapInput = toolbar.querySelector<HTMLInputElement>('.bar-field-gap input');
    expect(gapInput).not.toBeNull();
    gapInput!.value = '18';
    gapInput!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(ctx.setContainerSettings).toHaveBeenCalledWith(el, { gap: '18px' });

    toolbar.querySelector<HTMLButtonElement>('.bar-style-source')?.click();
    expect(ctx.toggleContainerStyleSource).toHaveBeenCalledWith(el);
  });

  it('keeps free mode disabled for split containers to avoid destructive conversion', () => {
    const el = document.createElement('section');
    el.className = 'layout-container';
    el.dataset.split = 'true';
    el.dataset.layoutMode = 'row';

    attachContainerBar(el, {
      placeContainer: jest.fn(),
      setContainerLayoutMode: jest.fn(),
      setContainerSettings: jest.fn(),
      setDynamicHost: jest.fn(),
      setDesignRef: jest.fn(),
      deleteContainer: jest.fn()
    });

    expect(el.querySelector<HTMLButtonElement>('[data-container-mode="free"]')?.disabled).toBe(true);
  });

  it('isolates failed toolbar actions so the Studio UI keeps running', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('section');
    el.className = 'layout-container';
    el.dataset.nodeId = 'container-1';
    document.body.appendChild(el);

    attachContainerBar(el, {
      placeContainer: jest.fn(() => {
        throw new Error('boom');
      })
    });

    try {
      expect(() => {
        el.querySelector<HTMLButtonElement>('.bar-add')?.click();
      }).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        '[Designer] DESIGNER_CONTAINER_ACTION_FAILED',
        expect.objectContaining({ action: 'bar-add', nodeId: 'container-1' }),
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
