/**
 * @jest-environment jsdom
 */

const { stopLayoutMode } = require('../ui/designer/app/renderer/layoutMode.js');

describe('Designer layout mode toolbar state', () => {
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
