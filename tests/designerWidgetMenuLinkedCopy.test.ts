/**
 * @jest-environment jsdom
 */

jest.mock('../ui/designer/app/widgets/widgetRenderer', () => ({
  renderWidget: jest.fn()
}));
jest.mock('../ui/designer/app/renderer/widgetActions', () => ({}));

import { attachOptionsMenu } from '../ui/designer/app/widgets/widgetMenu';

describe('designer widget duplicate menu', () => {
  afterEach(() => {
    document.body.replaceChildren();
    jest.restoreAllMocks();
  });

  function setup(withDuplicateCallback = true) {
    const grid = document.createElement('section') as HTMLElement & { __grid?: Record<string, jest.Mock> };
    grid.__grid = {
      emitChange: jest.fn(),
      update: jest.fn(),
      makeWidget: jest.fn()
    };
    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.dataset.instanceId = 'widget-1';
    widget.dataset.widgetId = 'textBox';
    const content = document.createElement('div');
    content.className = 'canvas-item-content';
    widget.appendChild(content);
    const editButton = document.createElement('button');
    editButton.className = 'widget-edit';
    widget.appendChild(editButton);
    grid.appendChild(widget);
    document.body.appendChild(grid);

    const duplicateWidget = jest.fn().mockResolvedValue(null);
    const scheduleAutosave = jest.fn();
    const codeMap = {
      'widget-1': {
        html: '<p>Independent content</p>',
        meta: {
          styleSource: { enabled: true, role: 'follower', sourceId: 'source-1' },
          label: 'Text'
        }
      }
    };
    attachOptionsMenu(widget, { id: 'textBox', metadata: { label: 'Text' } }, editButton, {
      grid,
      pageId: 'page-1',
      scheduleAutosave,
      activeLayer: 1,
      codeMap,
      genId: () => 'widget-2',
      duplicateWidget: withDuplicateCallback ? duplicateWidget : undefined
    });
    return { grid, widget, codeMap, duplicateWidget, scheduleAutosave };
  }

  it('offers only independent and explicitly linked copy actions', async () => {
    const { widget, duplicateWidget } = setup();
    const menu = (widget as any).__optionsMenu as HTMLElement & { show?: (trigger: HTMLElement) => void };
    const trigger = widget.querySelector('.widget-menu') as HTMLElement;
    menu.show?.(trigger);

    expect(menu.querySelector('.menu-style-source')).toBeNull();
    expect(menu.querySelector('.menu-style-follow')).toBeNull();
    expect((menu.querySelector('.menu-style-status') as HTMLButtonElement).hidden).toBe(true);

    (menu.querySelector('.menu-copy') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(duplicateWidget).toHaveBeenCalledWith(widget, { linked: false });

    (menu.querySelector('.menu-copy-linked') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(duplicateWidget).toHaveBeenCalledWith(widget, { linked: true });
  });

  it('shows linked status and removes the complete relationship on unlink', () => {
    const { widget, scheduleAutosave } = setup();
    widget.dataset.styleSourceEnabled = 'true';
    widget.dataset.styleSourceRole = 'follower';
    widget.dataset.styleSourceId = 'source-1';
    widget.dataset.styleSyncLayout = 'true';
    widget.dataset.styleSyncDesign = 'true';

    const menu = (widget as any).__optionsMenu as HTMLElement & { show?: (trigger: HTMLElement) => void };
    const trigger = widget.querySelector('.widget-menu') as HTMLElement;
    menu.show?.(trigger);

    expect((menu.querySelector('.menu-style-status') as HTMLButtonElement).hidden).toBe(false);
    (menu.querySelector('.menu-style-unlink') as HTMLButtonElement).click();

    expect(widget.dataset.styleSourceEnabled).toBeUndefined();
    expect(widget.dataset.styleSourceRole).toBeUndefined();
    expect(widget.dataset.styleSourceId).toBeUndefined();
    expect(scheduleAutosave).toHaveBeenCalled();
  });

  it('removes hidden Style Source metadata from a fallback independent copy', async () => {
    const { grid, widget, codeMap } = setup(false);
    widget.dataset.styleSourceEnabled = 'true';
    widget.dataset.styleSourceRole = 'follower';
    widget.dataset.styleSourceId = 'source-1';
    const menu = (widget as any).__optionsMenu as HTMLElement;

    (menu.querySelector('.menu-copy') as HTMLButtonElement).click();
    await Promise.resolve();

    const duplicate = grid.querySelector('[data-instance-id="widget-2"]') as HTMLElement;
    expect(duplicate).not.toBeNull();
    expect(duplicate.dataset.styleSourceId).toBeUndefined();
    expect((codeMap as any)['widget-2'].html).toContain('Independent content');
    expect((codeMap as any)['widget-2'].meta.styleSource).toBeUndefined();
  });
});
