/**
 * @jest-environment jsdom
 */

const { initHeaderControls } = require('../ui/designer/app/renderer/headerControls.js');
const {
  resetBuilderViewportStateForTests,
  setBuilderZoom,
  setBuilderViewportWidth
} = require('../ui/designer/app/renderer/viewportState.ts');

describe('Designer header viewport controls', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="topBar">
        <button id="viewportControlBtn" type="button">Viewport</button>
        <div class="viewport-slider">
          <button type="button" data-builder-viewport-preset="desktop">Desktop</button>
          <button type="button" data-builder-viewport-preset="tablet">Tablet</button>
          <button type="button" data-builder-viewport-preset="mobile">Mobile</button>
          <input class="viewport-range" type="range" min="320" max="3840" step="10" value="2080">
          <span class="viewport-value"></span>
        </div>
      </div>
      <div id="viewport">
        <div id="grid"></div>
      </div>
      <span id="viewportSize"></span>
    `;
    resetBuilderViewportStateForTests({ width: 1280, zoom: 100 });
  });

  it('keeps the slider, label and canvas width on the shared viewport state', () => {
    const dispose = initHeaderControls(
      document.getElementById('topBar'),
      document.getElementById('grid'),
      document.getElementById('viewportSize'),
      {},
      { undo: jest.fn(), redo: jest.fn() }
    );

    expect(document.querySelector('.viewport-range').value).toBe('1280');
    expect(document.querySelector('.viewport-value').textContent).toBe('1280px');
    expect(document.getElementById('viewport').style.width).toBe('1280px');

    setBuilderViewportWidth(820);

    expect(document.querySelector('.viewport-range').value).toBe('820');
    expect(document.querySelector('.viewport-value').textContent).toBe('820px');
    expect(document.getElementById('viewport').style.width).toBe('820px');

    document.querySelector('[data-builder-viewport-preset="mobile"]').click();
    expect(document.querySelector('.viewport-range').value).toBe('390');
    expect(document.getElementById('viewport').style.width).toBe('390px');
    expect(document.querySelector('[data-builder-viewport-preset="mobile"]').getAttribute('aria-pressed'))
      .toBe('true');
    dispose();
  });

  it('routes selection to the current grid and does not reflow on zoom', () => {
    const first = { activeEl: document.createElement('article'), setResponsiveRange: jest.fn() };
    const nested = { activeEl: document.createElement('article'), setResponsiveRange: jest.fn() };
    let current = first;
    const setViewport = jest.fn();
    const dispose = initHeaderControls(
      document.getElementById('topBar'), document.getElementById('grid'),
      document.getElementById('viewportSize'), first,
      { undo: jest.fn(), redo: jest.fn(), getGrid: () => current, setViewport }
    );
    current = nested;
    setBuilderViewportWidth(390);
    document.dispatchEvent(new Event('designerSelectionChanged'));
    expect(nested.setResponsiveRange).toHaveBeenCalledWith(
      { minWidth: 320, maxWidth: 600 }, { element: nested.activeEl, rewriteActive: false }
    );
    expect(setViewport.mock.calls).toEqual([[1280], [390]]);
    setBuilderZoom(150);
    expect(setViewport).toHaveBeenCalledTimes(2);
    dispose();
  });
});
