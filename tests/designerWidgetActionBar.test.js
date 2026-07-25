/**
 * @jest-environment jsdom
 */

import { createActionBar } from '../ui/designer/app/renderer/actionBar';

describe('designer widget action bar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1024
    });
    window.featherIcon = name => `<svg data-icon="${name}"></svg>`;
  });

  afterEach(() => {
    delete window.featherIcon;
  });

  it('keeps one accessible toolbar positionable after contextual controls are merged', () => {
    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.getBoundingClientRect = () => ({
      left: 200,
      right: 500,
      top: 200,
      bottom: 300,
      width: 300,
      height: 100,
      x: 200,
      y: 200,
      toJSON: () => ({})
    });
    document.body.appendChild(widget);

    const grid = {
      select: jest.fn(),
      update: jest.fn(),
      removeWidget: jest.fn()
    };
    const state = { activeWidgetEl: null, pageId: null };
    const { actionBar, select, refreshPosition } = createActionBar(
      null,
      grid,
      state,
      jest.fn()
    );
    Object.defineProperty(actionBar, 'offsetWidth', {
      configurable: true,
      get: () => actionBar.querySelector('.scene-stage-hud') ? 264 : 140
    });
    Object.defineProperty(actionBar, 'offsetHeight', {
      configurable: true,
      value: 44
    });

    select(widget);
    expect(actionBar.getAttribute('role')).toBe('toolbar');
    expect(actionBar.getAttribute('aria-label')).toBe('Selected element actions');
    expect(actionBar.style.left).toBe('280px');

    const behaviorControls = document.createElement('div');
    behaviorControls.className = 'scene-stage-hud';
    actionBar.prepend(behaviorControls);
    refreshPosition(widget);

    expect(document.querySelectorAll('.widget-action-bar')).toHaveLength(1);
    expect(actionBar.style.left).toBe('218px');
    expect(grid.select).toHaveBeenCalledWith(widget);
  });

  it('keeps lock and delete actions on the shared toolbar', () => {
    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.getBoundingClientRect = () => ({
      left: 100,
      right: 200,
      top: 100,
      bottom: 200,
      width: 100,
      height: 100,
      x: 100,
      y: 100,
      toJSON: () => ({})
    });
    document.body.appendChild(widget);

    const grid = {
      select: jest.fn(),
      update: jest.fn(),
      removeWidget: jest.fn()
    };
    const state = { activeWidgetEl: null, pageId: 'page-1' };
    const scheduleAutosave = jest.fn();
    const { actionBar, select } = createActionBar(
      null,
      grid,
      state,
      scheduleAutosave
    );

    select(widget);
    actionBar.querySelector('.action-lock').click();
    expect(widget.getAttribute('gs-locked')).toBe('true');
    expect(grid.update).toHaveBeenCalledWith(widget, {
      locked: true,
      noMove: true,
      noResize: true
    });

    actionBar.querySelector('.action-delete').click();
    expect(grid.removeWidget).toHaveBeenCalledWith(widget);
    expect(state.activeWidgetEl).toBeNull();
    expect(actionBar.style.display).toBe('none');
    expect(scheduleAutosave).toHaveBeenCalledTimes(2);
  });

  it('moves below the selected element when the text toolbar occupies the same space', () => {
    const textToolbar = document.createElement('div');
    textToolbar.className = 'text-block-editor-toolbar show';
    textToolbar.getBoundingClientRect = () => ({
      left: 250,
      right: 750,
      top: 50,
      bottom: 110,
      width: 500,
      height: 60,
      x: 250,
      y: 50,
      toJSON: () => ({})
    });
    document.body.appendChild(textToolbar);

    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.getBoundingClientRect = () => ({
      left: 400,
      right: 600,
      top: 100,
      bottom: 180,
      width: 200,
      height: 80,
      x: 400,
      y: 100,
      toJSON: () => ({})
    });
    document.body.appendChild(widget);

    const { actionBar, select } = createActionBar(
      null,
      { select: jest.fn() },
      { activeWidgetEl: null, pageId: null },
      jest.fn()
    );
    Object.defineProperty(actionBar, 'offsetWidth', {
      configurable: true,
      value: 264
    });
    Object.defineProperty(actionBar, 'offsetHeight', {
      configurable: true,
      value: 44
    });

    select(widget);

    expect(actionBar.style.top).toBe('188px');
  });
});
