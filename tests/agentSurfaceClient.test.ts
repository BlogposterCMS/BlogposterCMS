/**
 * @jest-environment jsdom
 */

import {
  DOM_AGENT_ACTIONS,
  buildDomAgentSnapshot,
  createAgentControlClient,
  createAgentSurfaceClient,
  handleDomAgentCommand,
  startDomAgentSurface,
  type AgentSurfaceCommand
} from '../ui/shared/agent/agentSurfaceClient';

afterEach(() => {
  delete (window as any).meltdownEmit;
  document.body.innerHTML = '';
});

function waitForAgentTick(): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, 0));
}

test('buildDomAgentSnapshot captures visible controls and selected canvas items', () => {
  document.body.innerHTML = `
    <button data-agent-id="publish" aria-label="Publish design">Publish</button>
    <div class="canvas-item selected" data-widget-id="headline" data-behavior="sticky">
      <div class="canvas-item-content">Hero headline</div>
    </div>
  `;

  const snapshot = buildDomAgentSnapshot(document.body, { title: 'Studio', surfaceType: 'studio-builder' });

  expect(snapshot.title).toBe('Studio');
  expect(snapshot.surfaceType).toBe('studio-builder');
  expect(snapshot.summary).toMatchObject({ nodeCount: 2, truncated: false });
  expect(snapshot.tree).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'publish',
      role: 'button',
      label: 'Publish design'
    }),
    expect.objectContaining({
      id: 'headline',
      state: expect.objectContaining({ selected: true, widgetId: 'headline', behavior: 'sticky' })
    })
  ]));
});

test('handleDomAgentCommand performs generic DOM control actions', () => {
  document.body.innerHTML = `
    <button data-agent-id="publish" aria-label="Publish design">Publish</button>
    <input id="headline" value="">
    <input data-agent-id="featured" type="checkbox">
    <form data-agent-id="settings-form"><button type="submit">Save</button></form>
  `;
  const clicked: string[] = [];
  const submitted: string[] = [];
  document.querySelector('[data-agent-id="publish"]')?.addEventListener('click', () => clicked.push('publish'));
  document.querySelector('form')?.addEventListener('submit', event => {
    event.preventDefault();
    submitted.push('settings-form');
  });

  const clickResult = handleDomAgentCommand({ action: 'dom.click', target: 'publish' }, document.body);
  const valueResult = handleDomAgentCommand({ action: 'dom.setValue', target: '#headline', value: 'Hero' }, document.body);
  const toggleResult = handleDomAgentCommand({ action: 'dom.toggle', target: 'featured' }, document.body);
  const submitResult = handleDomAgentCommand({ action: 'dom.submit', target: 'settings-form' }, document.body);

  expect(clickResult).toMatchObject({ handled: true, action: 'dom.click' });
  expect(clicked).toEqual(['publish']);
  expect(valueResult).toMatchObject({ handled: true, value: 'Hero' });
  expect((document.getElementById('headline') as HTMLInputElement).value).toBe('Hero');
  expect(toggleResult).toMatchObject({ handled: true, value: true });
  expect((document.querySelector('[data-agent-id="featured"]') as HTMLInputElement).checked).toBe(true);
  expect(submitResult).toMatchObject({ handled: true, submitted: false });
  expect(submitted).toEqual(['settings-form']);
});

test('startDomAgentSurface publishes a generic action catalog and handles DOM commands', async () => {
  document.body.innerHTML = `
    <input data-agent-id="headline" value="">
    <button data-agent-id="publish">Publish</button>
  `;
  const calls: Array<{ eventName: string; payload: Record<string, unknown> | undefined }> = [];
  (window as any).meltdownEmit = jest.fn(async (eventName: string, payload?: Record<string, unknown>) => {
    calls.push({ eventName, payload });
    if (eventName === 'agent.pollSurfaceCommands') {
      return [{ id: 'cmd-1', action: 'dom.setValue', target: 'headline', value: 'Hello from agent' }];
    }
    return { ok: true };
  });

  const client = startDomAgentSurface({
    appName: 'settings',
    surfaceId: 'settings.main',
    title: 'Settings',
    snapshotIntervalMs: 0,
    pollIntervalMs: 0,
    commandSnapshotDelayMs: 0
  });

  await waitForAgentTick();
  await waitForAgentTick();
  client.stop();

  expect((document.querySelector('[data-agent-id="headline"]') as HTMLInputElement).value).toBe('Hello from agent');
  expect(calls.map(call => call.eventName)).toEqual([
    'agent.publishSurfaceSnapshot',
    'agent.pollSurfaceCommands',
    'agent.ackSurfaceCommand',
    'agent.publishSurfaceSnapshot'
  ]);
  expect(calls[0].payload).toMatchObject({
    appName: 'settings',
    surfaceId: 'settings.main',
    surfaceType: 'dom-surface',
    actions: expect.arrayContaining([
      expect.objectContaining({ action: 'dom.click' }),
      expect.objectContaining({ action: 'dom.setValue' })
    ])
  });
  expect(calls[0].payload?.meta).toMatchObject({ adapter: 'dom-agent-surface' });
  expect(calls[2].payload).toMatchObject({
    commandId: 'cmd-1',
    status: 'acked',
    result: expect.objectContaining({
      handled: true,
      action: 'dom.setValue',
      value: 'Hello from agent'
    })
  });
  expect(DOM_AGENT_ACTIONS.map(action => action.action)).toEqual([
    'surface.refresh',
    'dom.click',
    'dom.focus',
    'dom.setValue',
    'dom.toggle',
    'dom.submit'
  ]);
});

test('createAgentSurfaceClient publishes snapshots, handles commands and acknowledges them', async () => {
  const calls: Array<{ eventName: string; payload: Record<string, unknown> | undefined }> = [];
  const handled: string[] = [];
  const snapshotReasons: string[] = [];
  (window as any).meltdownEmit = jest.fn(async (eventName: string, payload?: Record<string, unknown>) => {
    calls.push({ eventName, payload });
    if (eventName === 'agent.pollSurfaceCommands') {
      return [{ id: 'cmd-1', action: 'scene.next' }];
    }
    return { ok: true };
  });

  const client = createAgentSurfaceClient({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    snapshotIntervalMs: 0,
    pollIntervalMs: 0,
    buildSnapshot: ({ reason }) => {
      snapshotReasons.push(reason);
      return { summary: { activeScene: 'Hero' } };
    },
    handleCommand: (command: AgentSurfaceCommand) => {
      handled.push(String(command.action));
      return { handled: true };
    }
  });

  await client.publishSnapshot('test');
  const commands = await client.pollCommands();

  expect(commands).toHaveLength(1);
  expect(handled).toEqual(['scene.next']);
  expect(calls.map(call => call.eventName)).toEqual([
    'agent.publishSurfaceSnapshot',
    'agent.pollSurfaceCommands',
    'agent.ackSurfaceCommand',
    'agent.publishSurfaceSnapshot'
  ]);
  expect(snapshotReasons).toEqual(['test', 'command']);
  expect(calls[0].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    summary: { activeScene: 'Hero' },
    actions: expect.arrayContaining([
      expect.objectContaining({ action: 'surface.refresh' })
    ])
  });
  expect(calls[2].payload).toMatchObject({
    commandId: 'cmd-1',
    status: 'acked',
    result: { handled: true }
  });
  expect(calls[3].payload).toMatchObject({
    reason: 'command',
    summary: { activeScene: 'Hero' }
  });
});

test('createAgentSurfaceClient handles surface refresh without invoking domain handlers', async () => {
  const calls: Array<{ eventName: string; payload: Record<string, unknown> | undefined }> = [];
  const handled: string[] = [];
  const snapshotReasons: string[] = [];
  (window as any).meltdownEmit = jest.fn(async (eventName: string, payload?: Record<string, unknown>) => {
    calls.push({ eventName, payload });
    if (eventName === 'agent.pollSurfaceCommands') {
      return [{ id: 'cmd-refresh', action: 'surface.refresh' }];
    }
    return { ok: true };
  });

  const client = createAgentSurfaceClient({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    snapshotIntervalMs: 0,
    pollIntervalMs: 0,
    buildSnapshot: ({ reason }) => {
      snapshotReasons.push(reason);
      return { summary: { activeScene: 'Hero' } };
    },
    handleCommand: (command: AgentSurfaceCommand) => {
      handled.push(String(command.action));
      return { handled: true };
    }
  });

  const commands = await client.pollCommands();

  expect(commands).toHaveLength(1);
  expect(handled).toEqual([]);
  expect(calls.map(call => call.eventName)).toEqual([
    'agent.pollSurfaceCommands',
    'agent.ackSurfaceCommand',
    'agent.publishSurfaceSnapshot'
  ]);
  expect(snapshotReasons).toEqual(['refresh']);
  expect(calls[1].payload).toMatchObject({
    commandId: 'cmd-refresh',
    status: 'acked',
    result: { handled: true, action: 'surface.refresh' }
  });
  expect(calls[2].payload).toMatchObject({
    reason: 'refresh',
    summary: { activeScene: 'Hero' }
  });
});

test('createAgentControlClient exposes central surface command APIs', async () => {
  const calls: Array<{ eventName: string; payload: Record<string, unknown> | undefined }> = [];
  (window as any).meltdownEmit = jest.fn(async (eventName: string, payload?: Record<string, unknown>) => {
    calls.push({ eventName, payload });
    if (eventName === 'agent.getApiDefinition') return { moduleName: 'agentManager', moduleType: 'core', events: [] };
    if (eventName === 'agent.getSystemContext') return { counts: { surfaces: 1 }, surfaces: [] };
    if (eventName === 'agent.listSurfaceSnapshots') return [{ surfaceId: 'studio.designer' }];
    if (eventName === 'agent.getSurfaceContext') return { surface: { surfaceId: 'studio.designer' }, commands: { recent: [] } };
    if (eventName === 'agent.getSurfacePreview') return { surface: { surfaceId: 'studio.designer' }, visual: { hasPreview: true } };
    if (eventName === 'agent.inspectSurface') return { surface: { surfaceId: 'studio.designer' }, actions: [{ action: 'scene.next' }] };
    if (eventName === 'agent.listSurfaceActions') return [{ action: 'scene.next', category: 'scene' }];
    if (eventName === 'agent.getSurfaceAction') return { action: payload?.action, label: 'Next section' };
    if (eventName === 'agent.listSurfaceCommands') return [{ id: 'cmd-1', status: 'acked' }];
    if (eventName === 'agent.getSurfaceSnapshot') return { surfaceId: 'studio.designer' };
    if (eventName === 'agent.getSurfaceCommand') return { id: payload?.commandId, status: 'acked' };
    if (eventName === 'agent.waitForSurfaceCommand') return { id: payload?.commandId, status: 'acked', result: { handled: true } };
    if (eventName === 'agent.enqueueSurfaceCommand') return { id: 'cmd-2', status: 'queued' };
    if (eventName === 'agent.invokeSurfaceCommand') return { id: 'cmd-3', status: 'acked' };
    if (eventName === 'agent.invokeSurfaceCommandAndObserve') {
      return {
        command: { id: 'cmd-4', status: 'acked' },
        surface: { surface: { surfaceId: 'studio.designer' } },
        activity: [{ id: 'act-1', type: 'command.acked' }]
      };
    }
    if (eventName === 'agent.refreshSurface') {
      return {
        command: { id: 'cmd-refresh', action: 'surface.refresh', status: 'acked' },
        surface: { surface: { surfaceId: 'studio.designer', revision: 2 } }
      };
    }
    if (eventName === 'agent.invokeSurfaceWorkflow') return { id: 'wf-1', status: 'completed', steps: [] };
    return { ok: true };
  });

  const control = createAgentControlClient({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio'
  });

  await control.getCapabilities();
  await control.getApiDefinition();
  await control.getSystemContext({ filterAppName: 'designer', includeControls: true, limit: 5 });
  await control.listSurfaces();
  await control.getSurfaceSnapshot();
  await control.getSurfaceContext({ includeTree: true, includeCommands: false, commandLimit: 3 });
  await control.getSurfacePreview({ includeData: true });
  await control.inspectSurface({ includeData: true, includeActivity: true, activityLimit: 5 });
  await control.listActions(undefined, 'scene');
  await control.getAction('scene.next');
  await control.listCommands();
  await control.getCommand('cmd-1');
  await control.waitForCommand('cmd-1', { timeoutMs: 250, intervalMs: 5 });
  await control.enqueueCommand({ action: 'scene.next' });
  await control.invokeCommand({ action: 'scene.next', waitForResult: true, timeoutMs: 250 });
  await control.invokeAndObserve({
    action: 'scene.next',
    waitForResult: true,
    observeDelayMs: 20,
    waitForFreshSnapshot: true,
    snapshotTimeoutMs: 500,
    snapshotIntervalMs: 10,
    includeCommands: true
  });
  await control.refreshSurface({
    reason: 'manual refresh',
    waitForFreshSnapshot: true,
    snapshotTimeoutMs: 500,
    includePreview: true
  });
  await control.invokeWorkflow([
    { action: 'scene.next' },
    { action: 'scene.select', params: { sceneId: 'features' } }
  ], {
    waitForResult: false,
    haltOnFailure: true
  });

  expect(calls.map(call => call.eventName)).toEqual([
    'agent.getCapabilities',
    'agent.getApiDefinition',
    'agent.getSystemContext',
    'agent.listSurfaceSnapshots',
    'agent.getSurfaceSnapshot',
    'agent.getSurfaceContext',
    'agent.getSurfacePreview',
    'agent.inspectSurface',
    'agent.listSurfaceActions',
    'agent.getSurfaceAction',
    'agent.listSurfaceCommands',
    'agent.getSurfaceCommand',
    'agent.waitForSurfaceCommand',
    'agent.enqueueSurfaceCommand',
    'agent.invokeSurfaceCommand',
    'agent.invokeSurfaceCommandAndObserve',
    'agent.refreshSurface',
    'agent.invokeSurfaceWorkflow'
  ]);
  expect(calls[1].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer'
  });
  expect(calls[2].payload).toMatchObject({
    appName: 'designer',
    filterAppName: 'designer',
    includeControls: true,
    limit: 5
  });
  expect(calls[5].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    includeTree: true,
    includeCommands: false,
    commandLimit: 3
  });
  expect(calls[6].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    includeData: true
  });
  expect(calls[7].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    includeData: true,
    includeActivity: true,
    activityLimit: 5
  });
  expect(calls[8].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    category: 'scene'
  });
  expect(calls[9].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    action: 'scene.next'
  });
  expect(calls[12].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    commandId: 'cmd-1',
    timeoutMs: 250,
    intervalMs: 5
  });
  expect(calls[14].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.next', waitForResult: true, timeoutMs: 250 },
    waitForResult: true,
    timeoutMs: 250
  });
  expect(calls[15].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: {
      action: 'scene.next',
      waitForResult: true,
      observeDelayMs: 20,
      waitForFreshSnapshot: true,
      snapshotTimeoutMs: 500,
      snapshotIntervalMs: 10,
      includeCommands: true
    },
    waitForResult: true,
    observeDelayMs: 20,
    waitForFreshSnapshot: true,
    snapshotTimeoutMs: 500,
    snapshotIntervalMs: 10,
    includeCommands: true
  });
  expect(calls[16].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    reason: 'manual refresh',
    waitForFreshSnapshot: true,
    snapshotTimeoutMs: 500,
    includePreview: true
  });
  expect(calls[17].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    steps: [
      { action: 'scene.next' },
      { action: 'scene.select', params: { sceneId: 'features' } }
    ],
    waitForResult: false,
    haltOnFailure: true
  });
});

test('createAgentControlClient validates commands and workflows without invoking them', async () => {
  const calls: Array<{ eventName: string; payload: Record<string, unknown> | undefined }> = [];
  (window as any).meltdownEmit = jest.fn(async (eventName: string, payload?: Record<string, unknown>) => {
    calls.push({ eventName, payload });
    if (eventName === 'agent.validateSurfaceCommand') return { valid: false, missingParams: ['sceneId'] };
    if (eventName === 'agent.validateSurfaceWorkflow') return { valid: true, steps: [] };
    return { ok: true };
  });

  const control = createAgentControlClient({
    appName: 'designer',
    surfaceId: 'studio.designer'
  });

  const command = await control.validateCommand({ action: 'scene.select' });
  const workflow = await control.validateWorkflow([{ action: 'scene.next' }], { haltOnFailure: true });

  expect(command?.valid).toBe(false);
  expect(workflow?.valid).toBe(true);
  expect(calls.map(call => call.eventName)).toEqual([
    'agent.validateSurfaceCommand',
    'agent.validateSurfaceWorkflow'
  ]);
  expect(calls[0].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.select' }
  });
  expect(calls[1].payload).toMatchObject({
    appName: 'designer',
    surfaceId: 'studio.designer',
    steps: [{ action: 'scene.next' }],
    haltOnFailure: true
  });
});
