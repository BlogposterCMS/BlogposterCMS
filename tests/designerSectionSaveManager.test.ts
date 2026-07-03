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
      if (
        eventName === 'cmsAdminApiRequest' &&
        payload?.resource === 'designer' &&
        payload?.action === 'save'
      ) {
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

    const saveEvent = emitted.find(entry => (
      entry.eventName === 'cmsAdminApiRequest' &&
      entry.payload?.resource === 'designer' &&
      entry.payload?.action === 'save'
    ));
    expect(saveEvent?.payload.params.layout).toEqual(
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

  it('returns the uploaded viewport thumbnail URL from design saves', async () => {
    const gridEl = document.createElement('div');
    const emitted: any[] = [];
    const capturePreview = jest.fn(() => Promise.resolve('data:image/png;base64,ZmFrZQ=='));

    (window as any).ADMIN_TOKEN = 'token';
    (window as any).meltdownEmit = jest.fn((eventName: string, payload: any) => {
      emitted.push({ eventName, payload });
      const route = `${payload?.resource}.${payload?.action}`;
      if (route === 'media.makeFilePublic') {
        return Promise.resolve({ shareLink: '/media/builder/designer-thumbnails/thumb.png' });
      }
      if (route === 'designer.save') {
        return Promise.resolve({ id: 'design-2', version: 4 });
      }
      return Promise.resolve({});
    });

    const state: any = {
      designId: null,
      designVersion: 0,
      autosaveEnabled: false,
      pageId: null
    };

    const { saveDesign } = createSaveManager(state, {} as any);

    await expect(saveDesign({
      name: 'Thumbnail Layout',
      gridEl,
      layoutRoot: gridEl,
      getCurrentLayoutForLayer: jest.fn(() => []),
      getActiveLayer: jest.fn(() => 0),
      ensureCodeMap: jest.fn(() => ({})),
      capturePreview,
      updateAllWidgetContents: jest.fn(),
      ownerId: 'user-1',
      pageId: null
    } as any)).resolves.toEqual(expect.objectContaining({
      id: 'design-2',
      version: 4,
      thumbnailUrl: '/media/builder/designer-thumbnails/thumb.png'
    }));

    expect(capturePreview).toHaveBeenCalledWith({ viewport: true });
    const saveEvent = emitted.find(entry => `${entry.payload?.resource}.${entry.payload?.action}` === 'designer.save');
    expect(saveEvent?.payload.params.design.thumbnail).toBe('/media/builder/designer-thumbnails/thumb.png');
  });
});
