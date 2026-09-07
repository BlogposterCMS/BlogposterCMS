/** @jest-environment jsdom */
import { previewRuntimeDataEmit } from '../ui/designer/app/renderer/livePreviewRuntime';
import type { DesignerLivePreviewPayload } from '../ui/designer/app/renderer/livePreviewMessages';

jest.mock('/ui/runtime/main/runtimePageData.js', () => ({ fetchRuntimeWidgetRegistry: jest.fn() }));
jest.mock('/ui/runtime/main/runtimePageComposition.js', () => ({ renderPublicRuntimePageContent: jest.fn() }));
jest.mock('/ui/runtime/main/runtimePageShell.js', () => ({ ensureGlobalStyle: jest.fn(), ensureLayout: jest.fn() }));

describe('Designer preview design references', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['draft-1', null])('overrides only the edited design (%s)', async id => {
    const payload = {
      design: { id }, title: 'Unsaved changes',
      document: { layoutTree: { type: 'leaf' }, placements: [], scenes: [], styles: {}, metadata: {} }
    } as unknown as DesignerLivePreviewPayload;
    const emit = previewRuntimeDataEmit(payload);
    const post = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const editedId = id || '__designer_live_preview__';
    await expect(emit('cmsPublicRuntimeRequest', {
      resource: 'designer', action: 'get', params: { id: editedId }
    })).resolves.toMatchObject({ design: { title: 'Unsaved changes' } });
    expect(post).not.toHaveBeenCalled();

    // A different design must use the existing public bridge, including its
    // permission/publication checks. It must never receive the current draft.
    jest.useFakeTimers();
    const nested = emit('cmsPublicRuntimeRequest', {
      resource: 'designer', action: 'get', params: { id: 'nested-2' }
    });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({
      type: 'designer-live-preview-runtime-request',
      eventName: 'cmsPublicRuntimeRequest',
      payload: { resource: 'designer', action: 'get', params: { id: 'nested-2' } }
    }), '*');
    const rejected = expect(nested).rejects.toThrow('DESIGNER_LIVE_PREVIEW_RUNTIME_TIMEOUT');
    jest.runOnlyPendingTimers();
    await rejected;
    jest.useRealTimers();
  });
});
