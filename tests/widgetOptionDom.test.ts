/**
 * @jest-environment jsdom
 */

import { applyWidgetDomOptions } from '../ui/widgets/options/widgetOptionDom';

describe('widgetOptionDom', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('applies max bounds, width classes, and percent datasets', () => {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);

    const result = applyWidgetDomOptions(wrapper, {
      max: '80',
      maxWidth: 70,
      maxHeight: '60',
      halfWidth: true,
      width: 45,
      height: 30
    });

    expect(result).toEqual({ wPercent: 45, hPercent: 30 });
    expect(wrapper.classList.contains('max')).toBe(true);
    expect(wrapper.classList.contains('max-width')).toBe(true);
    expect(wrapper.classList.contains('max-height')).toBe(true);
    expect(wrapper.classList.contains('half-width')).toBe(true);
    expect(wrapper.style.maxWidth).toBe('70%');
    expect(wrapper.style.maxHeight).toBe('60%');
    expect(wrapper.dataset.wPercent).toBe('45');
    expect(wrapper.dataset.hPercent).toBe('30');
  });

  it('uses third-width metadata when explicit width is absent', () => {
    const wrapper = document.createElement('div');

    const result = applyWidgetDomOptions(wrapper, { thirdWidth: true });

    expect(result).toEqual({ wPercent: 33.333, hPercent: null });
    expect(wrapper.classList.contains('third-width')).toBe(true);
    expect(wrapper.dataset.wPercent).toBe('33.333');
    expect(wrapper.dataset.hPercent).toBeUndefined();
  });

  it('toggles overflow on the wrapper and content element', () => {
    const wrapper = document.createElement('div');
    const content = document.createElement('div');
    content.className = 'canvas-item-content';
    wrapper.appendChild(content);
    wrapper.classList.add('overflow');
    content.classList.add('overflow');

    applyWidgetDomOptions(wrapper, { overflow: false });

    expect(wrapper.classList.contains('overflow')).toBe(false);
    expect(content.classList.contains('overflow')).toBe(false);

    applyWidgetDomOptions(wrapper, {});

    expect(wrapper.classList.contains('overflow')).toBe(true);
    expect(content.classList.contains('overflow')).toBe(true);
  });

  it('keeps full-area widgets on page-level scrolling instead of inner overflow', () => {
    const wrapper = document.createElement('div');
    const content = document.createElement('div');
    content.className = 'canvas-item-content';
    wrapper.dataset.widgetSizeSlot = 'full';
    wrapper.dataset.widgetHeightMode = 'scroll';
    wrapper.classList.add('overflow');
    content.classList.add('overflow');
    wrapper.appendChild(content);

    applyWidgetDomOptions(wrapper, { width: 100, overflow: true });

    expect(wrapper.dataset.widgetSizeSlot).toBe('full');
    expect(wrapper.classList.contains('overflow')).toBe(false);
    expect(content.classList.contains('overflow')).toBe(false);
    expect(wrapper.dataset.widgetHeightMode).toBe('auto');
  });
});
