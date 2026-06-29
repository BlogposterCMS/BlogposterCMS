/**
 * @jest-environment jsdom
 */

import {
  applyDashboardHeightPolicyToElement,
  applyDashboardSlotToElement,
  getDefaultDashboardSlot,
  getSupportedDashboardSlots,
  normalizeDashboardColumn,
  resolveDashboardHeightPolicy,
  resolveDashboardSlotForWidget
} from '../ui/shared/layout/dashboardSlots';

const TEXT_WIDGET = {
  id: 'textBox',
  metadata: {
    layout: {
      defaultSlot: 'third',
      supportedSlots: [
        { name: 'third', minCols: 4, maxCols: 4 },
        { name: 'half', minCols: 6, maxCols: 6 },
        { name: 'full', minCols: 12, maxCols: 12 }
      ],
      breakpoints: {
        mobile: ['full'],
        tablet: ['half', 'full'],
        desktop: ['third', 'half', 'full']
      },
      heightMode: 'dynamic',
      height: {
        minHeight: { mobile: 120, tablet: 160, desktop: 220 },
        maxHeight: { desktop: 'calc(100dvh - 160px)' }
      }
    }
  }
};

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width
  });
}

describe('runtimeDashboardSlots', () => {
  it('resolves supported slots per viewport and falls back to allowed sizes', () => {
    setViewportWidth(1280);
    expect(getSupportedDashboardSlots(TEXT_WIDGET)).toEqual(['third', 'half', 'full']);
    expect(getDefaultDashboardSlot(TEXT_WIDGET)).toBe('third');
    expect(resolveDashboardSlotForWidget(TEXT_WIDGET, 'page')).toBe('third');

    setViewportWidth(700);
    expect(getSupportedDashboardSlots(TEXT_WIDGET)).toEqual(['full']);
    expect(getDefaultDashboardSlot(TEXT_WIDGET)).toBe('full');
    expect(resolveDashboardSlotForWidget(TEXT_WIDGET, 'third')).toBe('full');
  });

  it('clamps dashboard columns to the active slot span', () => {
    expect(normalizeDashboardColumn(2, 'third')).toBe(2);
    expect(normalizeDashboardColumn(12, 'third')).toBe(9);
    expect(normalizeDashboardColumn(5, 'half')).toBe(5);
    expect(normalizeDashboardColumn(12, 'half')).toBe(7);
    expect(normalizeDashboardColumn(8, 'full')).toBe(1);
  });

  it('writes stable dashboard slot datasets for CSS grid placement', () => {
    const el = document.createElement('article');

    applyDashboardSlotToElement(el, 'half', ['half', 'full'], 5);

    expect(el.dataset.dashboardSlot).toBe('half');
    expect(el.dataset.dashboardColumns).toBe('6');
    expect(el.dataset.dashboardColumn).toBe('5');
    expect(el.dataset.dashboardSupportedSlots).toBe('half,full');
    expect(el.style.getPropertyValue('--dashboard-column-start')).toBe('5');
    expect(el.style.getPropertyValue('--dashboard-column-span')).toBe('6');
    expect(el.dataset.widgetSizeSlot).toBe('half');
    expect(el.classList.contains('dashboard-widget--page')).toBe(false);
  });

  it('resolves responsive height policy with mobile-first cascade', () => {
    setViewportWidth(700);
    expect(resolveDashboardHeightPolicy(TEXT_WIDGET)).toEqual({
      mode: 'dynamic',
      minHeight: '120px'
    });

    setViewportWidth(900);
    expect(resolveDashboardHeightPolicy(TEXT_WIDGET)).toEqual({
      mode: 'dynamic',
      minHeight: '160px'
    });

    setViewportWidth(1280);
    expect(resolveDashboardHeightPolicy(TEXT_WIDGET)).toEqual({
      mode: 'dynamic',
      minHeight: '220px',
      maxHeight: 'calc(100dvh - 160px)'
    });
  });

  it('writes height policy datasets and CSS variables for dashboard wrappers', () => {
    const el = document.createElement('article');

    applyDashboardHeightPolicyToElement(el, TEXT_WIDGET, 'desktop');

    expect(el.dataset.dashboardHeightMode).toBe('dynamic');
    expect(el.style.getPropertyValue('--dashboard-min-height')).toBe('220px');
    expect(el.style.getPropertyValue('--dashboard-max-height')).toBe('calc(100dvh - 160px)');
    expect(el.style.getPropertyValue('--dashboard-height')).toBe('');
  });
});
