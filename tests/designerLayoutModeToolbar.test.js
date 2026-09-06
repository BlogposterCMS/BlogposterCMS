/**
 * @jest-environment jsdom
 */

jest.mock('../ui/designer/app/fetchPartial.js', () => ({ fetchPartial: async () => '<nav class="layout-panel"></nav>' }));
const { startLayoutMode, stopLayoutMode } = require('../ui/designer/app/renderer/layoutMode.js');

describe('Designer layout mode toolbar state', () => {
  it('keeps the document canvas interactive while opening its hierarchy', async () => {
    const sidebarEl = document.createElement('aside');
    sidebarEl.innerHTML = '<div class="layout-panel-host"></div>';
    const gridEl = document.createElement('div');
    const refreshLayoutTree = jest.fn();
    await startLayoutMode({ sidebarEl, gridEl, hideToolbar: jest.fn(), refreshLayoutTree });
    expect(gridEl.style.pointerEvents).not.toBe('none');
    expect(refreshLayoutTree).toHaveBeenCalledTimes(1);
  });
  it('restores the toolbar through the current element selection', () => {
    const syncToolbarForSelection = jest.fn();
    const showToolbar = jest.fn();
    const sidebarEl = document.createElement('aside');
    sidebarEl.innerHTML = '<div class="scene-panel-shell"></div>';

    stopLayoutMode({
      sidebarEl,
      gridEl: document.createElement('div'),
      setSidebarPanel: jest.fn(),
      syncToolbarForSelection,
      showToolbar
    });

    expect(syncToolbarForSelection).toHaveBeenCalledTimes(1);
    expect(showToolbar).not.toHaveBeenCalled();
  });
});
