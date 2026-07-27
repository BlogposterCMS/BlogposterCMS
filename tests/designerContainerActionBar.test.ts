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
      duplicateContainer: jest.fn(),
      setContainerLayoutMode: jest.fn(),
      setContainerSettings: jest.fn(),
      setDynamicHost: jest.fn(),
      setDesignRef: jest.fn(),
      unlinkContainerStyleSource: jest.fn(),
      deleteContainer: jest.fn()
    };

    attachContainerBar(el, ctx);

    const toolbar = el.querySelector('.container-actionbar') as HTMLElement;
    expect(toolbar?.getAttribute('role')).toBe('toolbar');

    toolbar.querySelector<HTMLButtonElement>('.bar-add')?.click();
    expect(ctx.placeContainer).toHaveBeenCalledWith(el, 'auto');
    toolbar.querySelector<HTMLButtonElement>('.bar-duplicate')?.click();
    expect(ctx.duplicateContainer).toHaveBeenCalledWith(el, { linked: false });
    toolbar.querySelector<HTMLButtonElement>('.bar-duplicate-linked')?.click();
    expect(ctx.duplicateContainer).toHaveBeenCalledWith(el, { linked: true });

    expect(toolbar.querySelector('[data-container-mode="auto"]')?.classList.contains('active')).toBe(true);
    toolbar.querySelector<HTMLButtonElement>('.bar-auto-direction')?.click();
    expect(ctx.setContainerLayoutMode).toHaveBeenCalledWith(el, 'row');
    toolbar.querySelector<HTMLButtonElement>('[data-container-mode="auto"]')?.click();
    expect(ctx.setContainerLayoutMode).toHaveBeenCalledWith(el, 'grid');
    el.dataset.layoutMode = 'grid';
    attachContainerBar(el, ctx);
    el.querySelector<HTMLButtonElement>('[data-container-mode="grid"]')?.click();
    expect(ctx.setContainerLayoutMode).toHaveBeenCalledWith(el, 'free');
    el.dataset.layoutMode = 'free';
    attachContainerBar(el, ctx);
    el.querySelector<HTMLButtonElement>('[data-container-mode="free"]')?.click();
    // Returning to Auto preserves the last explicit direction instead of
    // silently resetting a horizontal Container to vertical.
    expect(ctx.setContainerLayoutMode).toHaveBeenCalledWith(el, 'row');

    const currentToolbar = el.querySelector('.container-actionbar') as HTMLElement;
    const gapInput = currentToolbar.querySelector<HTMLInputElement>('.bar-field-gap input');
    expect(gapInput).not.toBeNull();
    gapInput!.value = '18';
    gapInput!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(ctx.setContainerSettings).toHaveBeenCalledWith(el, { gap: '18px' });
    const heightInput = currentToolbar.querySelector<HTMLInputElement>('.bar-field-minHeight input');
    heightInput!.value = '640';
    heightInput!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(ctx.setContainerSettings).toHaveBeenCalledWith(el, { minHeight: '640px' });

    expect(currentToolbar.querySelector('.bar-style-source')).toBeNull();
    el.dataset.styleSourceEnabled = 'true';
    el.dataset.styleSourceRole = 'follower';
    el.dataset.styleSourceId = 'container-source';
    attachContainerBar(el, ctx);
    el.querySelector<HTMLButtonElement>('.bar-style-source')?.click();
    expect(ctx.unlinkContainerStyleSource).toHaveBeenCalledWith(el);
  });

  it('keeps the compact mode cycle available on legacy split containers', () => {
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

    expect(el.querySelector<HTMLButtonElement>('[data-container-mode="auto"]')).not.toBeNull();
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

  it('leaves canonical Sections to their compact Section toolbar', () => {
    const section = document.createElement('section');
    section.className = 'layout-container layout-section';

    attachContainerBar(section, {
      setContainerLayoutMode: jest.fn()
    });

    expect(section.querySelector('.container-actionbar')).toBeNull();
  });
});
