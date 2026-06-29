/**
 * @jest-environment jsdom
 */

import { createLayoutStructureHandlers } from '../ui/designer/app/renderer/layoutStructureHandlers';

describe('designer layout structure handlers', () => {
  it('logs failed container toolbar attachment without stopping the refresh', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const root = document.createElement('section');
    root.className = 'layout-container';
    root.dataset.nodeId = 'root';
    const child = document.createElement('div');
    child.className = 'layout-container';
    child.dataset.nodeId = 'child';
    root.appendChild(child);

    const attachContainerBar = jest.fn(() => {
      throw new Error('attach failed');
    });
    const handlers = createLayoutStructureHandlers({
      layoutRootRef: () => root,
      sidebarEl: document.createElement('aside'),
      hasLayoutStructure: true,
      attachContainerBar,
      renderLayoutTreeSidebar: jest.fn(),
      pushAndSave: jest.fn(),
      layoutCtxProvider: () => ({})
    });

    try {
      expect(() => handlers.refreshContainerBars()).not.toThrow();
      expect(attachContainerBar).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[Designer] DESIGNER_CONTAINER_BAR_ATTACH_FAILED',
        expect.objectContaining({ nodeId: 'root' }),
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not save when container normalization fails', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const pushAndSave = jest.fn();
    const brokenRoot = {
      classList: {
        add: () => {
          throw new Error('normalize failed');
        }
      }
    };

    const handlers = createLayoutStructureHandlers({
      layoutRootRef: () => brokenRoot,
      sidebarEl: document.createElement('aside'),
      hasLayoutStructure: true,
      attachContainerBar: jest.fn(),
      renderLayoutTreeSidebar: jest.fn(),
      pushAndSave,
      layoutCtxProvider: () => ({})
    });

    try {
      expect(() => handlers.handleContainerChange()).not.toThrow();
      expect(pushAndSave).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[Designer] DESIGNER_CONTAINER_CHANGE_NORMALIZE_FAILED',
        {},
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
