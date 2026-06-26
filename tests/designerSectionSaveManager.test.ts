/** @jest-environment jsdom */

import { createSaveManager } from '../ui/designer/app/renderer/saveManager';

jest.mock('../ui/designer/app/renderer/capturePreview.js', () => ({
  capturePreview: jest.fn(() => Promise.resolve(''))
}));

describe('designer save manager sections', () => {
  it('includes empty scene sections in the saved layout payload', async () => {
    const layoutRoot = document.createElement('div');
    layoutRoot.className = 'layout-container';
    layoutRoot.dataset.workarea = 'true';
    layoutRoot.dataset.nodeId = 'root-node';
    const gridEl = document.createElement('div');
    const emitted: any[] = [];

    (window as any).ADMIN_TOKEN = 'token';
    (window as any).meltdownEmit = jest.fn((eventName: string, payload: any) => {
      emitted.push({ eventName, payload });
      if (eventName === 'designer.saveDesign') {
        return Promise.resolve({ id: 'design-1', version: 1 });
      }
      return Promise.resolve({});
    });

    const state: any = {
      designId: null,
      designVersion: 0,
      autosaveEnabled: false,
      pageId: null
    };

    const { saveDesign } = createSaveManager(state, {
      getSceneSections: () => [
        { id: 'hero-scene', title: 'Hero Scene' },
        { id: 'empty-showcase', title: 'Empty Showcase', background: '#f7f8fb' }
      ]
    } as any);

    await saveDesign({
      name: 'Scene Layout',
      gridEl,
      layoutRoot,
      getCurrentLayoutForLayer: jest.fn(() => []),
      getActiveLayer: jest.fn(() => 0),
      ensureCodeMap: jest.fn(() => ({})),
      capturePreview: jest.fn(() => Promise.resolve('')),
      updateAllWidgetContents: jest.fn(),
      ownerId: 'user-1',
      pageId: null
    } as any);

    const saveEvent = emitted.find(entry => entry.eventName === 'designer.saveDesign');
    expect(saveEvent?.payload.layout).toEqual(
      expect.objectContaining({
        type: 'leaf',
        workarea: true,
        scenes: [
          { id: 'hero-scene', title: 'Hero Scene' },
          { id: 'empty-showcase', title: 'Empty Showcase', background: '#f7f8fb' }
        ]
      })
    );
  });
});
