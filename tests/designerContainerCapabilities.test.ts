/** @jest-environment jsdom */
import { containerPositionAvailability } from '../ui/designer/app/managers/containerCapabilities.js';

describe('container scroll-position availability', () => {
  function fixture() {
    const root = document.createElement('div');
    root.innerHTML = '<section class="layout-container" data-layout-mode="row"><aside class="layout-container"></aside></section>';
    const parent = root.firstElementChild as HTMLElement;
    const aside = parent.firstElementChild as HTMLElement;
    Object.defineProperty(parent, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(aside, 'offsetHeight', { value: 200, configurable: true });
    return { root, parent, aside };
  }
  it('allows a shorter nested box and explains why viewport Fixed is unavailable', () => {
    const { root, aside } = fixture();
    const options = containerPositionAvailability(aside, root);
    expect(options.sticky.available).toBe(true);
    expect(options.fixed.available).toBe(false);
    expect(options.fixed.reason).toContain('scaled canvas');
  });
  it('blocks sticky without travel room, under Free placement, or clipping ancestors', () => {
    const { root, parent, aside } = fixture();
    Object.defineProperty(aside, 'offsetHeight', { value: 800, configurable: true });
    expect(containerPositionAvailability(aside, root).sticky.reason).toContain('no room');
    parent.dataset.layoutMode = 'free';
    expect(containerPositionAvailability(aside, root).sticky.reason).toContain('Free');
    parent.dataset.layoutMode = 'row';
    parent.dataset.layoutOverflow = 'hidden';
    expect(containerPositionAvailability(aside, root).sticky.reason).toContain('clips');
  });
  it('keeps page-content hosts and Sections in normal flow', () => {
    const { root, parent, aside } = fixture();
    aside.dataset.dynamicHost = 'true';
    expect(containerPositionAvailability(aside, root).sticky.available).toBe(false);
    parent.classList.add('layout-section');
    expect(containerPositionAvailability(parent, root).sticky.available).toBe(false);
  });
});
