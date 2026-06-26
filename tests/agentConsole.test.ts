import { createAgentConsole, installAgentConsole } from '../ui/shared/agent/agentConsole';
import fs from 'fs';
import path from 'path';

describe('agent console helper', () => {
  it('wraps the central agent http client with inspect and run helpers', async () => {
    const client = {
      getSystemContext: jest.fn().mockResolvedValue({ counts: { surfaces: 1 } }),
      listSurfaces: jest.fn().mockResolvedValue([{ surfaceId: 'studio.designer' }]),
      listActivity: jest.fn().mockResolvedValue([{ type: 'command.queued' }]),
      getSurfaceContext: jest.fn().mockResolvedValue({ surface: { surfaceId: 'studio.designer' } }),
      getSurfacePreview: jest.fn().mockResolvedValue({ visual: { hasPreview: true } }),
      getSurfacePreviewImageUrl: jest.fn().mockReturnValue('/admin/api/agent/surfaces/designer/studio.designer/preview/image'),
      inspectSurface: jest.fn().mockResolvedValue({
        context: { surface: { surfaceId: 'studio.designer' } },
        actions: [{ action: 'scene.next' }],
        activity: [{ type: 'surface.snapshot' }],
        previewImageUrl: '/admin/api/agent/surfaces/designer/studio.designer/preview/image'
      }),
      validateCommand: jest.fn().mockResolvedValue({ valid: true }),
      validateWorkflow: jest.fn().mockResolvedValue({ valid: true }),
      listActions: jest.fn().mockResolvedValue([{ action: 'scene.next' }]),
      listCommands: jest.fn().mockResolvedValue([{ id: 'cmd_1' }]),
      invokeAndObserve: jest.fn().mockResolvedValue({ command: { id: 'cmd_2' } }),
      refreshSurface: jest.fn().mockResolvedValue({ command: { id: 'cmd_refresh' } }),
      invokeWorkflow: jest.fn().mockResolvedValue({ id: 'wf_1', status: 'completed' })
    };
    const agentConsole = createAgentConsole({ client: client as any });

    await agentConsole.context({ activeOnly: true });
    await agentConsole.surfaces({ appName: 'designer' });
    await agentConsole.activity({ appName: 'designer' });
    const preview = await agentConsole.preview('designer', 'studio.designer');
    const previewUrl = agentConsole.designerPreviewImageUrl();
    await agentConsole.designerPreview(false);
    const inspected = await agentConsole.inspect();
    const validation = await agentConsole.designerValidate('scene.select', { sceneId: 'features' });
    const workflowValidation = await agentConsole.designerValidateWorkflow([{ action: 'scene.next' }]);
    const result = await agentConsole.designer('scene.next', { sceneId: 'features' });
    const refresh = await agentConsole.designerRefresh();
    const workflow = await agentConsole.designerWorkflow([{ action: 'scene.next' }], { waitForResult: false });

    expect(client.getSystemContext).toHaveBeenCalledWith({ activeOnly: true });
    expect(client.listSurfaces).toHaveBeenCalledWith({ appName: 'designer' });
    expect(client.listActivity).toHaveBeenCalledWith({ appName: 'designer' });
    expect(preview.visual.hasPreview).toBe(true);
    expect(previewUrl).toBe('/admin/api/agent/surfaces/designer/studio.designer/preview/image');
    expect(client.getSurfacePreview).toHaveBeenNthCalledWith(1, 'designer', 'studio.designer', { includeData: true });
    expect(client.getSurfacePreview).toHaveBeenNthCalledWith(2, 'designer', 'studio.designer', { includeData: false });
    expect(inspected.actions).toEqual([{ action: 'scene.next' }]);
    expect(client.inspectSurface).toHaveBeenCalledWith('designer', 'studio.designer', {
      includeCommands: true,
      includeControls: true,
      includeActions: true,
      activityLimit: 20
    });
    expect(validation.valid).toBe(true);
    expect(workflowValidation.valid).toBe(true);
    expect(client.validateCommand).toHaveBeenCalledWith('designer', 'studio.designer', expect.objectContaining({
      action: 'scene.select',
      params: { sceneId: 'features' }
    }));
    expect(client.validateWorkflow).toHaveBeenCalledWith('designer', 'studio.designer', [{ action: 'scene.next' }]);
    expect(result.command.id).toBe('cmd_2');
    expect(client.invokeAndObserve).toHaveBeenCalledWith('designer', 'studio.designer', expect.objectContaining({
      action: 'scene.next',
      params: { sceneId: 'features' },
      waitForResult: true,
      observeDelayMs: 80,
      waitForFreshSnapshot: true,
      snapshotTimeoutMs: 2500,
      includeCommands: true
    }));
    expect(refresh.command.id).toBe('cmd_refresh');
    expect(client.refreshSurface).toHaveBeenCalledWith('designer', 'studio.designer', expect.objectContaining({
      action: 'surface.refresh',
      waitForResult: true,
      waitForFreshSnapshot: true
    }));
    expect(workflow.status).toBe('completed');
    expect(client.invokeWorkflow).toHaveBeenCalledWith('designer', 'studio.designer', [{ action: 'scene.next' }], expect.objectContaining({
      waitForResult: false,
      waitForFreshSnapshot: true,
      snapshotTimeoutMs: 2500,
      includeCommands: true
    }));
  });

  it('installs a window global without requiring designer-specific code', () => {
    const target = {
      ADMIN_TOKEN: 'admin-token',
      CSRF_TOKEN: 'csrf-token'
    } as unknown as Window;

    const installed = installAgentConsole(target);

    expect(target.blogposterAgentConsole).toBe(installed);
    expect(target.blogposterAgent?.console).toBe(installed);
    expect(target.blogposterAgent?.httpClient).toBe(installed.client);
  });

  it('is wired into the central admin shell bundle list', () => {
    const root = path.join(__dirname, '..');
    const webpackConfig = fs.readFileSync(path.join(root, 'webpack.config.js'), 'utf8');
    const adminHtml = fs.readFileSync(path.join(root, 'public', 'admin.html'), 'utf8');

    expect(webpackConfig).toContain('agentConsole: resolveSource');
    expect(adminHtml).toContain('/build/agentConsole.js');
  });
});
