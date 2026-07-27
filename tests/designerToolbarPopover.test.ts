/** @jest-environment jsdom */

import {
  clearToolbarPopoverPosition,
  mountToolbarPopover,
  positionToolbarPopover,
  restoreToolbarPopover
} from '../ui/designer/app/editor/toolbar/toolbarPopover';

describe('Design Studio toolbar popover positioning', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('portals the opacity slider above scroll containers and restores its exact DOM position', () => {
    const toolbar = document.createElement('div');
    const control = document.createElement('div');
    const popover = document.createElement('div');
    const followingControl = document.createElement('button');
    control.append(popover, followingControl);
    toolbar.appendChild(control);
    document.body.appendChild(toolbar);

    const layer = mountToolbarPopover(popover);

    expect(layer.dataset.designerToolbarPopoverLayer).toBe('true');
    expect(layer.parentElement).toBe(document.body);
    expect(popover.parentElement).toBe(layer);

    restoreToolbarPopover(popover);

    expect(popover.parentElement).toBe(control);
    expect(popover.nextSibling).toBe(followingControl);
    expect(document.querySelector('[data-designer-toolbar-popover-layer]')).toBeNull();
  });

  it('keeps the opacity slider above the canvas and inside the viewport', () => {
    const anchor = document.createElement('button');
    const popover = document.createElement('div');
    anchor.getBoundingClientRect = () => ({
      x: 760,
      y: 70,
      left: 760,
      right: 796,
      top: 70,
      bottom: 106,
      width: 36,
      height: 36,
      toJSON: () => ({})
    });
    popover.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      right: 260,
      top: 0,
      bottom: 52,
      width: 260,
      height: 52,
      toJSON: () => ({})
    });

    const position = positionToolbarPopover(
      popover,
      anchor,
      { innerWidth: 800, innerHeight: 600 } as Window
    );

    expect(position.center).toBe(662);
    expect(position.top).toBe(114);
    expect(popover.style.left).toBe('662px');
    expect(popover.style.top).toBe('114px');
    expect(popover.style.maxWidth).toBe('calc(100vw - 16px)');
  });

  it('places the slider above the toolbar when the lower viewport is too short', () => {
    const anchor = document.createElement('button');
    const popover = document.createElement('div');
    anchor.getBoundingClientRect = () => ({
      x: 300,
      y: 160,
      left: 300,
      right: 336,
      top: 160,
      bottom: 196,
      width: 36,
      height: 36,
      toJSON: () => ({})
    });
    popover.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      right: 260,
      top: 0,
      bottom: 52,
      width: 260,
      height: 52,
      toJSON: () => ({})
    });

    expect(positionToolbarPopover(
      popover,
      anchor,
      { innerWidth: 640, innerHeight: 220 } as Window
    ).top).toBe(100);

    clearToolbarPopoverPosition(popover);
    expect(popover.getAttribute('style')).toBe('');
  });
});
