import { createAgentHttpClient } from '../ui/shared/agent/agentHttpClient';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

describe('agent http client', () => {
  it('reads filtered system context from the dedicated agent API', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      data: { counts: { surfaces: 1 }, surfaces: [] }
    }));
    const client = createAgentHttpClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider: {
        getAdminToken: () => 'admin-token',
        getCsrfToken: () => null
      }
    });

    const context = await client.getSystemContext({
      filterAppName: 'designer',
      activeOnly: true,
      includeControls: true
    });

    expect(context.counts.surfaces).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/admin/api/agent/context?filterAppName=designer&activeOnly=true&includeControls=true');
    expect(options.credentials).toBe('same-origin');
    expect(options.headers.Authorization).toBe('Bearer admin-token');
  });

  it('reads a compact surface preview from the dedicated preview endpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      data: {
        surface: { appName: 'designer', surfaceId: 'studio.designer' },
        visual: { hasPreview: true, previewDataUrl: 'data:image/png;base64,abcd' },
        available: true
      }
    }));
    const client = createAgentHttpClient({
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const preview = await client.getSurfacePreview('designer', 'studio.designer', {
      includeData: true
    });

    expect(preview?.available).toBe(true);
    expect(preview?.visual.previewDataUrl).toBe('data:image/png;base64,abcd');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/admin/api/agent/surfaces/designer/studio.designer/preview?includeData=true');
    expect(client.getSurfacePreviewImageUrl('designer', 'studio.designer')).toBe(
      '/admin/api/agent/surfaces/designer/studio.designer/preview/image'
    );
  });

  it('reads bundled surface inspections from the dedicated inspect endpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      data: {
        inspectedAt: '2026-06-17T10:00:00.000Z',
        surface: { appName: 'designer', surfaceId: 'studio.designer' },
        context: { surface: { surfaceId: 'studio.designer' }, commands: { recent: [] } },
        preview: { visual: { hasPreview: true } },
        actions: [{ action: 'scene.next' }],
        activity: [{ id: 'act_1', type: 'surface.snapshot' }]
      }
    }));
    const client = createAgentHttpClient({
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const inspection = await client.inspectSurface('designer', 'studio.designer', {
      includeCommands: true,
      includeData: true,
      activityLimit: 5
    });

    expect(inspection?.actions[0]?.action).toBe('scene.next');
    expect(inspection?.previewImageUrl).toBe('/admin/api/agent/surfaces/designer/studio.designer/preview/image');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/admin/api/agent/surfaces/designer/studio.designer/inspect?includeCommands=true&includeData=true&activityLimit=5');
  });

  it('posts commands with csrf protection headers', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      data: { id: 'cmd_1', action: 'scene.next', status: 'queued' }
    }));
    const client = createAgentHttpClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider: {
        getAdminToken: () => null,
        getCsrfToken: () => 'csrf-token'
      }
    });

    const command = await client.enqueueCommand('designer', 'studio.designer', {
      action: 'scene.next',
      reason: 'test'
    });

    expect(command.id).toBe('cmd_1');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/admin/api/agent/surfaces/designer/studio.designer/commands');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['X-CSRF-Token']).toBe('csrf-token');
    expect(JSON.parse(options.body)).toEqual({
      command: {
        action: 'scene.next',
        reason: 'test'
      },
      invoke: false
    });
  });

  it('invokes commands and observes the resulting context', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      data: {
        command: { id: 'cmd_2', status: 'acked' },
        surface: { surface: { surfaceId: 'studio.designer' } },
        activity: [{ id: 'act_2', type: 'command.acked' }]
      }
    }));
    const client = createAgentHttpClient({
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const result = await client.invokeAndObserve('designer', 'studio.designer', {
      action: 'scene.next',
      waitForResult: true,
      observeDelayMs: 20,
      waitForFreshSnapshot: true,
      snapshotTimeoutMs: 500,
      includeCommands: true
    });

    expect(result.command?.id).toBe('cmd_2');
    expect(result.previewImageUrl).toBe('/admin/api/agent/surfaces/designer/studio.designer/preview/image');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/admin/api/agent/surfaces/designer/studio.designer/commands/observe');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toMatchObject({
      command: {
        action: 'scene.next',
        waitForResult: true,
        observeDelayMs: 20,
        waitForFreshSnapshot: true,
        snapshotTimeoutMs: 500,
        includeCommands: true
      },
      invoke: true,
      waitForResult: true,
      observeDelayMs: 20,
      waitForFreshSnapshot: true,
      snapshotTimeoutMs: 500,
      includeCommands: true
    });
  });

  it('requests a central surface refresh through the dedicated endpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      data: {
        command: { id: 'cmd_refresh', action: 'surface.refresh', status: 'acked' },
        surface: { surface: { surfaceId: 'studio.designer', revision: 2 } },
        observation: { waitForFreshSnapshot: true }
      }
    }));
    const client = createAgentHttpClient({
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const result = await client.refreshSurface('designer', 'studio.designer', {
      reason: 'manual inspect',
      waitForResult: true,
      waitForFreshSnapshot: true,
      snapshotTimeoutMs: 500,
      includePreview: true
    });

    expect(result.command?.action).toBe('surface.refresh');
    expect(result.previewImageUrl).toBe('/admin/api/agent/surfaces/designer/studio.designer/preview/image');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/admin/api/agent/surfaces/designer/studio.designer/refresh');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toMatchObject({
      reason: 'manual inspect',
      waitForResult: true,
      waitForFreshSnapshot: true,
      snapshotTimeoutMs: 500,
      includePreview: true
    });
  });

  it('invokes surface workflows through the agent API', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'wf_1',
        status: 'completed',
        steps: [{
          action: 'scene.next',
          status: 'completed',
          observation: {
            observedAt: '2026-06-17T10:00:00.000Z',
            command: { id: 'cmd_1', status: 'acked' },
            surface: null,
            activity: []
          }
        }]
      }
    }));
    const client = createAgentHttpClient({
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const workflow = await client.invokeWorkflow('designer', 'studio.designer', [
      { action: 'scene.next' },
      { action: 'scene.select', params: { sceneId: 'features' } }
    ], {
      waitForResult: false,
      haltOnFailure: true
    });

    expect(workflow.status).toBe('completed');
    expect(workflow.previewImageUrl).toBe('/admin/api/agent/surfaces/designer/studio.designer/preview/image');
    expect(workflow.steps[0].observation?.previewImageUrl).toBe('/admin/api/agent/surfaces/designer/studio.designer/preview/image');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/admin/api/agent/surfaces/designer/studio.designer/workflows');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toMatchObject({
      steps: [
        { action: 'scene.next' },
        { action: 'scene.select', params: { sceneId: 'features' } }
      ],
      waitForResult: false,
      haltOnFailure: true
    });
  });

  it('validates commands and workflows through the agent API', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: { valid: false, missingParams: ['sceneId'], errors: ['Missing sceneId'] }
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: { valid: true, steps: [{ validation: { valid: true, action: 'scene.next' } }] }
      }));
    const client = createAgentHttpClient({
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const command = await client.validateCommand('designer', 'studio.designer', {
      action: 'scene.select'
    });
    const workflow = await client.validateWorkflow('designer', 'studio.designer', [
      { action: 'scene.next' }
    ], { haltOnFailure: true });

    expect(command.valid).toBe(false);
    expect(workflow.valid).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('/admin/api/agent/surfaces/designer/studio.designer/commands/validate');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      command: { action: 'scene.select' }
    });
    expect(fetchMock.mock.calls[1][0]).toBe('/admin/api/agent/surfaces/designer/studio.designer/workflows/validate');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      steps: [{ action: 'scene.next' }],
      haltOnFailure: true
    });
  });

  it('lists central activity from the agent API', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'act_1', type: 'command.queued', appName: 'designer' }]
    }));
    const client = createAgentHttpClient({
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const activity = await client.listActivity({
      appName: 'designer',
      type: 'command.queued',
      limit: 5
    });

    expect(activity).toHaveLength(1);
    expect(activity[0]?.type).toBe('command.queued');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/admin/api/agent/activity?appName=designer&type=command.queued&limit=5');
  });

  it('throws agent API errors', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(
      { error: 'Forbidden' },
      { status: 403, statusText: 'Forbidden' }
    ));
    const client = createAgentHttpClient({
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    await expect(client.getApiDefinition()).rejects.toThrow('Forbidden');
  });
});
