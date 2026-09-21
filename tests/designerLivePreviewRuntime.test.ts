/** @jest-environment jsdom */
import {
  bootLivePreviewRuntime,
  isTrustedLivePreviewMessageSource,
  previewRuntimeDataEmit
} from '../ui/designer/app/renderer/livePreviewRuntime';
import type { DesignerLivePreviewPayload } from '../ui/designer/app/renderer/livePreviewMessages';
import { renderPublicRuntimePageContent } from '/ui/runtime/main/runtimePageComposition.js';

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

describe('Designer preview message source boundary', () => {
  it('rejects null-source messages and top-level previews', () => {
    const parentFrame = document.createElement('iframe');
    document.body.appendChild(parentFrame);

    expect(isTrustedLivePreviewMessageSource(null, parentFrame.contentWindow as Window)).toBe(false);
    expect(isTrustedLivePreviewMessageSource(window, window)).toBe(false);
  });

  it('ignores foreign renders and runtime responses while accepting its iframe parent', async () => {
    const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
    const parentFrame = document.createElement('iframe');
    const foreignFrame = document.createElement('iframe');
    document.body.replaceChildren(parentFrame, foreignFrame, Object.assign(document.createElement('div'), { id: 'content' }));
    const trustedParent = parentFrame.contentWindow as Window;
    const foreignWindow = foreignFrame.contentWindow as Window;
    Object.defineProperty(window, 'parent', { configurable: true, value: trustedParent });
    const post = jest.spyOn(trustedParent, 'postMessage').mockImplementation(() => undefined);
    const render = jest.mocked(renderPublicRuntimePageContent).mockResolvedValue(undefined);
    const payload = {
      design: { id: 'draft-1' },
      title: 'Unsaved changes',
      document: { layoutTree: { type: 'leaf' }, placements: [], scenes: [], styles: {}, metadata: {} },
      widgets: [{}]
    } as unknown as DesignerLivePreviewPayload;

    try {
      bootLivePreviewRuntime();

      window.dispatchEvent(new MessageEvent('message', {
        source: foreignWindow,
        data: { type: 'designer-live-preview-render', requestId: 'foreign-render', payload }
      }));
      await Promise.resolve();
      expect(render).not.toHaveBeenCalled();

      const responsePromise = previewRuntimeDataEmit(payload)('testRuntimeEvent', {});
      const runtimeRequest = post.mock.calls
        .map(([message]) => message as Record<string, unknown>)
        .find(message => message.type === 'designer-live-preview-runtime-request');
      expect(runtimeRequest?.requestId).toEqual(expect.any(String));

      let settled = false;
      void responsePromise.finally(() => { settled = true; });
      window.dispatchEvent(new MessageEvent('message', {
        source: foreignWindow,
        data: {
          type: 'designer-live-preview-runtime-response',
          requestId: runtimeRequest?.requestId,
          ok: true,
          data: 'foreign-response'
        }
      }));
      await Promise.resolve();
      expect(settled).toBe(false);

      window.dispatchEvent(new MessageEvent('message', {
        source: trustedParent,
        data: {
          type: 'designer-live-preview-runtime-response',
          requestId: runtimeRequest?.requestId,
          ok: true,
          data: 'trusted-response'
        }
      }));
      await expect(responsePromise).resolves.toBe('trusted-response');

      window.dispatchEvent(new MessageEvent('message', {
        source: trustedParent,
        data: { type: 'designer-live-preview-render', requestId: 'trusted-render', payload }
      }));
      await new Promise(resolve => window.setTimeout(resolve, 0));
      expect(render).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(expect.objectContaining({
        type: 'designer-live-preview-rendered',
        requestId: 'trusted-render'
      }), '*');
    } finally {
      post.mockRestore();
      if (originalParent) Object.defineProperty(window, 'parent', originalParent);
    }
  });
});
