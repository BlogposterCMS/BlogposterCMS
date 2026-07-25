/** @jest-environment jsdom */

jest.mock('/ui/runtime/main/script-utils.js', () => ({
  executeJs: jest.fn()
}), { virtual: true });

const mockRenderWidget = jest.fn();
const mockAttachEditButton = jest.fn(() => document.createElement('button'));
const mockAttachRemoveButton = jest.fn();
const mockAttachLockOnClick = jest.fn();
const mockAttachResizeButton = jest.fn();
const mockAttachOptionsMenu = jest.fn();

jest.mock('../ui/designer/app/widgets/widgetRenderer.js', () => ({
  renderWidget: mockRenderWidget
}));

jest.mock('../ui/designer/app/renderer/widgetActions.js', () => ({
  attachEditButton: mockAttachEditButton,
  attachRemoveButton: mockAttachRemoveButton,
  attachLockOnClick: mockAttachLockOnClick,
  attachResizeButton: mockAttachResizeButton
}));

jest.mock('../ui/designer/app/widgets/widgetMenu.js', () => ({
  attachOptionsMenu: mockAttachOptionsMenu
}));

import { applyLayout } from '../ui/designer/app/managers/layoutManager';
import { resetBuilderViewportStateForTests } from '../ui/designer/app/renderer/viewportState';

describe('designer applyLayout hydration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (window as { meltdownEmit?: unknown }).meltdownEmit;
    delete (window as { featherIcon?: unknown }).featherIcon;
    jest.clearAllMocks();
    resetBuilderViewportStateForTests({ width: 1280, zoom: 100 });
  });

  it('keeps saved percent bounds before registering loaded widgets with CanvasGrid', () => {
    const gridEl = document.createElement('div');
    Object.defineProperty(gridEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 1200, height: 900, top: 0, left: 0, right: 1200, bottom: 900 })
    });
    document.body.appendChild(gridEl);

    const makeWidget = jest.fn((el: HTMLElement) => {
      expect(el.dataset.xPercent).toBe('4');
      expect(el.dataset.yPercent).toBe('12');
      expect(el.dataset.wPercent).toBe('100');
      expect(el.dataset.hPercent).toBe('30');
    });
    const grid = {
      options: { columns: 12, cellHeight: 1 },
      makeWidget
    };

    applyLayout([{
      id: 'headline-1',
      widgetId: 'textBox',
      xPercent: 4,
      yPercent: 12,
      wPercent: 100,
      hPercent: 30,
      code: { html: '<h1>Coming Soon</h1>' }
    }], {
      gridEl,
      grid,
      codeMap: {},
      allWidgets: [{ id: 'textBox', metadata: { label: 'Rich Text', icon: 'type' } }],
      layerIndex: 1
    });

    const widget = gridEl.querySelector<HTMLElement>('.canvas-item');
    expect(makeWidget).toHaveBeenCalledTimes(1);
    expect(widget?.dataset.xPercent).toBe('4');
    expect(widget?.dataset.wPercent).toBe('100');
    expect(widget?.getAttribute('gs-w')).toBe('1280');
    expect(widget?.getAttribute('gs-h')).toBe('270');
    expect(JSON.parse(widget?.dataset.responsivePlacement || '{}')).toMatchObject({
      version: 1,
      base: {
        widthPx: 1280
      }
    });
  });

  it('accepts snake_case percent bounds from saved design rows', () => {
    const gridEl = document.createElement('div');
    Object.defineProperty(gridEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 960, height: 800, top: 0, left: 0, right: 960, bottom: 800 })
    });
    document.body.appendChild(gridEl);

    const grid = {
      options: { columns: 12, cellHeight: 1 },
      makeWidget: jest.fn()
    };

    applyLayout([{
      id: 'button-1',
      widgetId: 'button',
      x_percent: '10',
      y_percent: '20',
      w_percent: '50',
      h_percent: '10',
      code: { html: '<a>Open admin</a>' }
    }], {
      gridEl,
      grid,
      codeMap: {},
      allWidgets: [{ id: 'button', metadata: { label: 'Button', icon: 'mouse-pointer-click' } }],
      layerIndex: 0
    });

    const widget = gridEl.querySelector<HTMLElement>('.canvas-item');
    expect(widget?.dataset.xPercent).toBe('10');
    expect(widget?.dataset.yPercent).toBe('20');
    expect(widget?.dataset.wPercent).toBe('50');
    expect(widget?.dataset.hPercent).toBe('10');
    expect(widget?.dataset.x).toBe('128');
    expect(widget?.getAttribute('gs-w')).toBe('640');
  });
});
