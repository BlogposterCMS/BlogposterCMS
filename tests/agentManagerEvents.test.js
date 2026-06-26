const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const agentManager = require('../mother/modules/agentManager');

class CapturingEmitter extends EventEmitter {
  constructor() {
    super();
    this.registered = [];
  }

  registerModuleType(moduleName, moduleType) {
    this.registered.push({ moduleName, moduleType });
  }
}

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

function payload(extra = {}) {
  return {
    jwt: 'agent-token',
    moduleName: 'agentManager',
    moduleType: 'core',
    decodedJWT: {
      userId: 'user-1',
      permissions: {
        builder: { use: true, manage: true }
      }
    },
    ...extra
  };
}

beforeEach(() => {
  agentManager._internals.surfaceSnapshots.clear();
  agentManager._internals.surfaceCommands.clear();
  agentManager._internals.activityEvents.length = 0;
});

test('agent manager ships a machine-readable api definition aligned with capabilities', () => {
  const apiPath = path.join(__dirname, '..', 'mother/modules/agentManager/apiDefinition.json');
  const api = JSON.parse(fs.readFileSync(apiPath, 'utf8'));
  const capabilities = agentManager._internals.capabilities();
  const eventMap = new Map(api.events.map(event => [event.eventName, event]));

  assert.strictEqual(api.moduleName, 'agentManager');
  assert.strictEqual(api.moduleType, 'core');
  assert.deepStrictEqual(api.surfaceContract, capabilities.surfaceContract);
  assert.deepStrictEqual(api.permissions.read, ['agent.view', 'agent.control', 'builder.use', 'builder.manage']);
  assert.deepStrictEqual(api.permissions.surfaceWrite, ['agent.surface.write', 'agent.control', 'builder.use', 'builder.manage']);
  assert.deepStrictEqual(api.permissions.control, ['agent.control', 'builder.manage', 'builder.use']);

  for (const eventName of capabilities.events.read) {
    assert(eventMap.has(eventName), `${eventName} missing from apiDefinition`);
    assert.strictEqual(eventMap.get(eventName).access, 'read');
  }
  for (const eventName of capabilities.events.write) {
    assert(eventMap.has(eventName), `${eventName} missing from apiDefinition`);
    assert.strictEqual(eventMap.get(eventName).access, 'write');
  }

  assert.deepStrictEqual(capabilities.events.read, agentManager._internals.eventNamesForAccess('read'));
  assert.deepStrictEqual(capabilities.events.write, agentManager._internals.eventNamesForAccess('write'));
});

test('agent manager registers central surface and command events', async () => {
  const emitter = new CapturingEmitter();

  await agentManager.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'core-token'
  });

  assert.deepStrictEqual(emitter.registered, [{ moduleName: 'agentManager', moduleType: 'core' }]);
  assert.strictEqual(emitter.listenerCount('agent.getSystemContext'), 1);
  assert.strictEqual(emitter.listenerCount('agent.getApiDefinition'), 1);
  assert.strictEqual(emitter.listenerCount('agent.publishSurfaceSnapshot'), 1);
  assert.strictEqual(emitter.listenerCount('agent.enqueueSurfaceCommand'), 1);
  assert.strictEqual(emitter.listenerCount('agent.invokeSurfaceCommand'), 1);
  assert.strictEqual(emitter.listenerCount('agent.invokeSurfaceCommandAndObserve'), 1);
  assert.strictEqual(emitter.listenerCount('agent.refreshSurface'), 1);
  assert.strictEqual(emitter.listenerCount('agent.invokeSurfaceWorkflow'), 1);
  assert.strictEqual(emitter.listenerCount('agent.listSurfaceActions'), 1);
  assert.strictEqual(emitter.listenerCount('agent.getSurfaceAction'), 1);
  assert.strictEqual(emitter.listenerCount('agent.validateSurfaceCommand'), 1);
  assert.strictEqual(emitter.listenerCount('agent.validateSurfaceWorkflow'), 1);
  assert.strictEqual(emitter.listenerCount('agent.listActivity'), 1);
  assert.strictEqual(emitter.listenerCount('agent.getSurfaceContext'), 1);
  assert.strictEqual(emitter.listenerCount('agent.getSurfacePreview'), 1);
  assert.strictEqual(emitter.listenerCount('agent.inspectSurface'), 1);
  assert.strictEqual(emitter.listenerCount('agent.pollSurfaceCommands'), 1);
  assert.strictEqual(emitter.listenerCount('agent.getSurfaceCommand'), 1);
  assert.strictEqual(emitter.listenerCount('agent.waitForSurfaceCommand'), 1);

  const capabilities = await emitAsync(emitter, 'agent.getCapabilities', payload());
  assert.ifError(capabilities.err);
  assert(capabilities.result.events.read.includes('agent.getApiDefinition'));
  assert(capabilities.result.events.read.includes('agent.getSystemContext'));
  assert(capabilities.result.events.read.includes('agent.getSurfaceSnapshot'));
  assert(capabilities.result.events.read.includes('agent.getSurfaceContext'));
  assert(capabilities.result.events.read.includes('agent.getSurfacePreview'));
  assert(capabilities.result.events.read.includes('agent.inspectSurface'));
  assert(capabilities.result.events.read.includes('agent.listSurfaceActions'));
  assert(capabilities.result.events.read.includes('agent.getSurfaceAction'));
  assert(capabilities.result.events.read.includes('agent.validateSurfaceCommand'));
  assert(capabilities.result.events.read.includes('agent.validateSurfaceWorkflow'));
  assert(capabilities.result.events.read.includes('agent.listActivity'));
  assert(capabilities.result.events.read.includes('agent.getSurfaceCommand'));
  assert(capabilities.result.events.read.includes('agent.waitForSurfaceCommand'));
  assert(capabilities.result.events.write.includes('agent.enqueueSurfaceCommand'));
  assert(capabilities.result.events.write.includes('agent.invokeSurfaceCommand'));
  assert(capabilities.result.events.write.includes('agent.invokeSurfaceCommandAndObserve'));
  assert(capabilities.result.events.write.includes('agent.refreshSurface'));
  assert(capabilities.result.events.write.includes('agent.invokeSurfaceWorkflow'));

  const definition = await emitAsync(emitter, 'agent.getApiDefinition', payload());
  assert.ifError(definition.err);
  assert.strictEqual(definition.result.moduleName, 'agentManager');
  assert(definition.result.events.some(event => event.eventName === 'agent.getApiDefinition'));
});

test('agent manager exposes a system-wide context for active surfaces', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const designer = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    summary: { activeScene: 'Hero Scene' },
    selection: { id: 'headline' },
    actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }],
    controls: [{ id: 'scene.next' }],
    visual: {
      available: true,
      previewDataUrl: 'data:image/png;base64,abcd',
      width: 1200,
      height: 800
    }
  }));
  assert.ifError(designer.err);

  const dashboard = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'dashboard',
    surfaceId: 'admin.home',
    surfaceType: 'admin-dashboard',
    title: 'Dashboard',
    actions: []
  }));
  assert.ifError(dashboard.err);

  const queued = await emitAsync(emitter, 'agent.enqueueSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.next' }
  }));
  assert.ifError(queued.err);

  const system = await emitAsync(emitter, 'agent.getSystemContext', payload({
    includeControls: true
  }));
  assert.ifError(system.err);
  assert.strictEqual(system.result.module.moduleName, 'agentManager');
  assert.strictEqual(system.result.counts.surfaces, 2);
  assert.strictEqual(system.result.counts.pendingCommands, 1);
  assert.strictEqual(system.result.counts.controllableSurfaces, 1);
  assert.strictEqual(system.result.counts.staleSurfaces, 0);
  assert.strictEqual(system.result.counts.inactiveSurfaces, 0);
  assert.strictEqual(system.result.counts.activityEvents, 3);
  const designerSurface = system.result.surfaces.find(entry => entry.surface.appName === 'designer');
  assert(designerSurface);
  assert.strictEqual(designerSurface.surface.surfaceId, 'studio.designer');
  assert.strictEqual(designerSurface.surface.freshness.stale, false);
  assert.strictEqual(designerSurface.surface.freshness.inactive, false);
  assert.strictEqual(typeof designerSurface.surface.freshness.ageMs, 'number');
  assert.strictEqual(designerSurface.actions[0].action, 'scene.next');
  assert.strictEqual(designerSurface.controls[0].id, 'scene.next');
  assert.strictEqual(designerSurface.commands.pendingCount, 1);
  assert.strictEqual(designerSurface.commands.last.id, queued.result.id);
  assert.strictEqual(designerSurface.visual.hasPreview, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(designerSurface.visual, 'previewDataUrl'), false);

  const designerOnly = await emitAsync(emitter, 'agent.getSystemContext', payload({
    filterAppName: 'designer',
    includeActions: false
  }));
  assert.ifError(designerOnly.err);
  assert.strictEqual(designerOnly.result.counts.surfaces, 1);
  assert.strictEqual(designerOnly.result.surfaces[0].surface.appName, 'designer');
  assert.deepStrictEqual(designerOnly.result.surfaces[0].actions, []);
});

test('agent manager records central surface and command activity', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }]
  }));
  assert.ifError(published.err);

  const queued = await emitAsync(emitter, 'agent.enqueueSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.next' }
  }));
  assert.ifError(queued.err);

  const polled = await emitAsync(emitter, 'agent.pollSurfaceCommands', payload({
    appName: 'designer',
    surfaceId: 'studio.designer'
  }));
  assert.ifError(polled.err);

  const acked = await emitAsync(emitter, 'agent.ackSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    commandId: queued.result.id,
    result: { selectedScene: 'features' }
  }));
  assert.ifError(acked.err);

  const activity = await emitAsync(emitter, 'agent.listActivity', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    limit: 10
  }));
  assert.ifError(activity.err);
  assert.deepStrictEqual(
    activity.result.map(entry => entry.type),
    ['command.acked', 'command.delivered', 'command.queued', 'surface.snapshot']
  );
  assert.strictEqual(activity.result[0].commandId, queued.result.id);
  assert.strictEqual(activity.result[0].details.hasResult, true);
  assert.strictEqual(activity.result[3].revision, 1);

  const commandActivity = await emitAsync(emitter, 'agent.listActivity', payload({
    commandId: queued.result.id
  }));
  assert.ifError(commandActivity.err);
  assert.deepStrictEqual(
    commandActivity.result.map(entry => entry.type),
    ['command.acked', 'command.delivered', 'command.queued']
  );
});

test('agent manager filters system context by surface freshness', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }]
  }));
  assert.ifError(published.err);

  const snapshot = agentManager._internals.snapshotForSurface('designer', 'studio.designer');
  snapshot.updatedAt = new Date(Date.now() - agentManager._internals.INACTIVE_SURFACE_AFTER_MS - 1000).toISOString();

  const stale = await emitAsync(emitter, 'agent.getSystemContext', payload({
    staleOnly: true
  }));
  assert.ifError(stale.err);
  assert.strictEqual(stale.result.counts.surfaces, 1);
  assert.strictEqual(stale.result.counts.staleSurfaces, 1);
  assert.strictEqual(stale.result.counts.inactiveSurfaces, 1);
  assert.strictEqual(stale.result.surfaces[0].surface.freshness.stale, true);
  assert.strictEqual(stale.result.surfaces[0].surface.freshness.inactive, true);

  const active = await emitAsync(emitter, 'agent.getSystemContext', payload({
    activeOnly: true
  }));
  assert.ifError(active.err);
  assert.strictEqual(active.result.counts.surfaces, 0);
  assert.strictEqual(active.result.counts.staleSurfaces, 0);
  assert.strictEqual(active.result.counts.inactiveSurfaces, 0);
});

test('agent manager stores app surface snapshots and exposes summaries', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appContext: { appName: 'designer' },
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    summary: { activeScene: 'Hero Scene' },
    selection: { id: 'headline', behavior: 'sticky' },
    tree: [{ id: 'sections', children: [{ id: 'hero-scene' }] }],
    controls: [{ id: 'scene.next' }],
    actions: [{ action: 'scene.next', params: [] }],
    visual: {
      previewDataUrl: 'data:image/png;base64,abcd',
      width: 1200,
      height: 800
    }
  }));

  assert.ifError(published.err);
  assert.strictEqual(published.result.appName, 'designer');
  assert.strictEqual(published.result.surfaceId, 'studio.designer');
  assert.strictEqual(published.result.revision, 1);

  const listed = await emitAsync(emitter, 'agent.listSurfaceSnapshots', payload({
    appName: 'designer'
  }));
  assert.ifError(listed.err);
  assert.strictEqual(listed.result.length, 1);
  assert.deepStrictEqual(listed.result[0].counts, {
    tree: 1,
    controls: 1,
    actions: 1,
    pendingCommands: 0
  });
  assert.deepStrictEqual(listed.result[0].visual, {
    hasPreview: true,
    previewTooLarge: false
  });

  const full = await emitAsync(emitter, 'agent.getSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer'
  }));
  assert.ifError(full.err);
  assert.strictEqual(full.result.selection.id, 'headline');
  assert.strictEqual(full.result.tree[0].id, 'sections');
  assert.strictEqual(full.result.actions[0].action, 'scene.next');
  assert.strictEqual(full.result.visual.previewDataUrl, 'data:image/png;base64,abcd');
});

test('agent manager exposes compact surface context without heavy preview data by default', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    summary: { activeScene: 'Hero Scene' },
    state: { activeSceneId: 'hero-scene' },
    selection: { id: 'headline', behavior: 'sticky' },
    tree: [{ id: 'sections', children: [{ id: 'hero-scene' }] }],
    controls: [{ id: 'scene.next', role: 'scene-command' }],
    actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }],
    visual: {
      available: true,
      previewDataUrl: 'data:image/png;base64,abcd',
      width: 1200,
      height: 800,
      source: 'test'
    }
  }));
  assert.ifError(published.err);

  const queued = await emitAsync(emitter, 'agent.enqueueSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.next' }
  }));
  assert.ifError(queued.err);

  const context = await emitAsync(emitter, 'agent.getSurfaceContext', payload({
    appName: 'designer',
    surfaceId: 'studio.designer'
  }));
  assert.ifError(context.err);
  assert.strictEqual(context.result.surface.title, 'Design Studio');
  assert.deepStrictEqual(context.result.state, { activeSceneId: 'hero-scene' });
  assert.strictEqual(context.result.selection.id, 'headline');
  assert.strictEqual(context.result.actions[0].action, 'scene.next');
  assert.strictEqual(context.result.controls[0].id, 'scene.next');
  assert.strictEqual(context.result.commands.pendingCount, 1);
  assert.strictEqual(context.result.commands.recent[0].id, queued.result.id);
  assert.strictEqual(context.result.commands.recent[0].actionLabel, 'Next section');
  assert.strictEqual(context.result.visual.hasPreview, true);
  assert.strictEqual(context.result.visual.width, 1200);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(context.result.visual, 'previewDataUrl'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(context.result, 'tree'), false);

  const richContext = await emitAsync(emitter, 'agent.getSurfaceContext', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    includeTree: true,
    includePreview: true
  }));
  assert.ifError(richContext.err);
  assert.strictEqual(richContext.result.tree[0].id, 'sections');
  assert.strictEqual(richContext.result.visual.previewDataUrl, 'data:image/png;base64,abcd');

  const preview = await emitAsync(emitter, 'agent.getSurfacePreview', payload({
    appName: 'designer',
    surfaceId: 'studio.designer'
  }));
  assert.ifError(preview.err);
  assert.strictEqual(preview.result.surface.title, 'Design Studio');
  assert.strictEqual(preview.result.available, true);
  assert.strictEqual(preview.result.visual.hasPreview, true);
  assert.strictEqual(preview.result.visual.width, 1200);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(preview.result.visual, 'previewDataUrl'), false);

  const previewWithData = await emitAsync(emitter, 'agent.getSurfacePreview', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    includeData: true
  }));
  assert.ifError(previewWithData.err);
  assert.strictEqual(previewWithData.result.visual.previewDataUrl, 'data:image/png;base64,abcd');

  const inspection = await emitAsync(emitter, 'agent.inspectSurface', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    includeControls: true,
    includeData: true,
    activityLimit: 5
  }));
  assert.ifError(inspection.err);
  assert.strictEqual(inspection.result.surface.surfaceId, 'studio.designer');
  assert.strictEqual(inspection.result.context.controls[0].id, 'scene.next');
  assert.strictEqual(inspection.result.preview.visual.previewDataUrl, 'data:image/png;base64,abcd');
  assert.strictEqual(inspection.result.actions[0].action, 'scene.next');
  assert.strictEqual(inspection.result.activity[0].type, 'command.queued');
});

test('agent manager exposes a lightweight surface action catalog', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    actions: [
      { action: 'scene.next', label: 'Next section', category: 'scene' },
      { action: 'insert.element', label: 'Insert element', category: 'content', params: [{ name: 'type', required: true }] }
    ]
  }));
  assert.ifError(published.err);

  const allActions = await emitAsync(emitter, 'agent.listSurfaceActions', payload({
    appName: 'designer',
    surfaceId: 'studio.designer'
  }));
  assert.ifError(allActions.err);
  assert.deepStrictEqual(allActions.result.map(action => action.action), ['scene.next', 'insert.element']);

  const contentActions = await emitAsync(emitter, 'agent.listSurfaceActions', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    category: 'content'
  }));
  assert.ifError(contentActions.err);
  assert.strictEqual(contentActions.result.length, 1);
  assert.strictEqual(contentActions.result[0].action, 'insert.element');

  const insertAction = await emitAsync(emitter, 'agent.getSurfaceAction', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    action: 'insert.element'
  }));
  assert.ifError(insertAction.err);
  assert.strictEqual(insertAction.result.label, 'Insert element');
  assert.strictEqual(insertAction.result.params[0].name, 'type');
});

test('agent manager validates commands and workflows without queueing commands', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    actions: [
      { action: 'scene.next', label: 'Next section', category: 'scene' },
      { action: 'scene.select', label: 'Select section', category: 'scene', params: [{ name: 'sceneId', required: true }] }
    ]
  }));
  assert.ifError(published.err);

  const missingParam = await emitAsync(emitter, 'agent.validateSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.select' }
  }));
  assert.ifError(missingParam.err);
  assert.strictEqual(missingParam.result.valid, false);
  assert.deepStrictEqual(missingParam.result.missingParams, ['sceneId']);

  const validCommand = await emitAsync(emitter, 'agent.validateSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.select', params: { sceneId: 'features' } }
  }));
  assert.ifError(validCommand.err);
  assert.strictEqual(validCommand.result.valid, true);
  assert.strictEqual(validCommand.result.label, 'Select section');

  const workflow = await emitAsync(emitter, 'agent.validateSurfaceWorkflow', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    steps: [
      { action: 'scene.next' },
      { action: 'scene.select' }
    ]
  }));
  assert.ifError(workflow.err);
  assert.strictEqual(workflow.result.valid, false);
  assert.strictEqual(workflow.result.stepCount, 2);
  assert.strictEqual(workflow.result.steps[0].validation.valid, true);
  assert.deepStrictEqual(workflow.result.steps[1].validation.missingParams, ['sceneId']);

  const commands = await emitAsync(emitter, 'agent.listSurfaceCommands', payload({
    appName: 'designer',
    surfaceId: 'studio.designer'
  }));
  assert.ifError(commands.err);
  assert.strictEqual(commands.result.length, 0);
});

test('agent manager queues, delivers and acknowledges surface commands', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    actions: [
      { action: 'scene.next', label: 'Next section', category: 'scene' },
      { action: 'scene.select', label: 'Select section', category: 'scene', params: [{ name: 'sceneId', required: true }] }
    ]
  }));
  assert.ifError(published.err);

  const queued = await emitAsync(emitter, 'agent.enqueueSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: {
      action: 'scene.next',
      reason: 'advance preview'
    }
  }));
  assert.ifError(queued.err);
  assert.strictEqual(queued.result.status, 'queued');
  assert.strictEqual(queued.result.action, 'scene.next');
  assert.strictEqual(queued.result.actionLabel, 'Next section');
  assert.strictEqual(queued.result.actionCategory, 'scene');

  const polled = await emitAsync(emitter, 'agent.pollSurfaceCommands', payload({
    appContext: { appName: 'designer' },
    surfaceId: 'studio.designer'
  }));
  assert.ifError(polled.err);
  assert.strictEqual(polled.result.length, 1);
  assert.strictEqual(polled.result[0].status, 'delivered');

  const acked = await emitAsync(emitter, 'agent.ackSurfaceCommand', payload({
    appContext: { appName: 'designer' },
    surfaceId: 'studio.designer',
    commandId: queued.result.id,
    result: { handled: true }
  }));
  assert.ifError(acked.err);
  assert.strictEqual(acked.result.status, 'acked');
  assert.deepStrictEqual(acked.result.result, { handled: true });

  const commands = await emitAsync(emitter, 'agent.listSurfaceCommands', payload({
    appName: 'designer',
    surfaceId: 'studio.designer'
  }));
  assert.ifError(commands.err);
  assert.strictEqual(commands.result[0].status, 'acked');

  const command = await emitAsync(emitter, 'agent.getSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    commandId: queued.result.id
  }));
  assert.ifError(command.err);
  assert.strictEqual(command.result.id, queued.result.id);
  assert.strictEqual(command.result.status, 'acked');
  assert.deepStrictEqual(command.result.result, { handled: true });
});

test('agent manager drops unsafe keys from published surface json', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);
  const dirtySummary = JSON.parse(
    '{"safe":"ok","__proto__":{"polluted":true},"constructor":{"bad":true},' +
      '"nested":{"prototype":{"bad":true},"safe":1},"items":[{"__proto__":{"bad":true},"kept":"yes"}]}'
  );

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    title: 'Design\nStudio',
    summary: dirtySummary,
    meta: JSON.parse('{"prototype":{"bad":true},"safeMeta":true}')
  }));

  assert.ifError(published.err);
  assert.strictEqual(published.result.title, 'Design Studio');
  assert.deepStrictEqual(published.result.summary, {
    safe: 'ok',
    nested: { safe: 1 },
    items: [{ kept: 'yes' }]
  });
  assert.deepStrictEqual(published.result.meta, { safeMeta: true });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(published.result.summary, '__proto__'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(published.result.summary, 'constructor'), false);
  assert.strictEqual({}.polluted, undefined);
});

test('agent manager sanitizes command params and results across the surface boundary', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    actions: [{ action: 'scene.next', label: 'Next section' }]
  }));
  assert.ifError(published.err);

  const queued = await emitAsync(emitter, 'agent.enqueueSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: {
      action: 'scene.next',
      params: JSON.parse('{"sceneId":"hero","__proto__":{"polluted":true},"nested":{"prototype":{"bad":true},"ok":true}}')
    }
  }));
  assert.ifError(queued.err);
  assert.deepStrictEqual(queued.result.params, {
    sceneId: 'hero',
    nested: { ok: true }
  });

  const acked = await emitAsync(emitter, 'agent.ackSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    commandId: queued.result.id,
    result: JSON.parse('{"handled":true,"constructor":{"bad":true},"nested":{"__proto__":{"bad":true},"ok":1}}')
  }));
  assert.ifError(acked.err);
  assert.deepStrictEqual(acked.result.result, {
    handled: true,
    nested: { ok: 1 }
  });
  assert.strictEqual({}.polluted, undefined);
});

test('agent manager treats object shaped command ids as invalid contract input', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const result = await emitAsync(emitter, 'agent.getSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    commandId: { id: 'cmd_123' }
  }));

  assert(result.err);
  assert.match(result.err.message, /commandId is required/);
  assert.strictEqual(agentManager._internals.normalizeCommandId({ id: 'cmd_123' }), '');
});

test('agent manager invokes surface commands and waits for a final result centrally', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }]
  }));
  assert.ifError(published.err);

  const invoked = emitAsync(emitter, 'agent.invokeSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.next' },
    waitForResult: true,
    timeoutMs: 1000,
    intervalMs: 5
  }));

  await new Promise(resolve => setTimeout(resolve, 0));
  const polled = await emitAsync(emitter, 'agent.pollSurfaceCommands', payload({
    appName: 'designer',
    surfaceId: 'studio.designer'
  }));
  assert.ifError(polled.err);
  assert.strictEqual(polled.result.length, 1);

  const acked = await emitAsync(emitter, 'agent.ackSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    commandId: polled.result[0].id,
    result: { handled: true, activeScene: 'Features' }
  }));
  assert.ifError(acked.err);

  const result = await invoked;
  assert.ifError(result.err);
  assert.strictEqual(result.result.id, polled.result[0].id);
  assert.strictEqual(result.result.status, 'acked');
  assert.deepStrictEqual(result.result.result, { handled: true, activeScene: 'Features' });
});

test('agent manager invokes commands and returns observed surface context', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    summary: { activeScene: 'Hero' },
    actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }]
  }));
  assert.ifError(published.err);

  const observedPromise = emitAsync(emitter, 'agent.invokeSurfaceCommandAndObserve', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.next' },
    waitForResult: true,
    timeoutMs: 1000,
    intervalMs: 5,
    observeDelayMs: 0,
    waitForFreshSnapshot: true,
    snapshotTimeoutMs: 1000,
    snapshotIntervalMs: 5,
    activityLimit: 10
  }));

  await new Promise(resolve => setTimeout(resolve, 0));
  const polled = await emitAsync(emitter, 'agent.pollSurfaceCommands', payload({
    appName: 'designer',
    surfaceId: 'studio.designer'
  }));
  assert.ifError(polled.err);
  assert.strictEqual(polled.result.length, 1);

  const acked = await emitAsync(emitter, 'agent.ackSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    commandId: polled.result[0].id,
    result: { handled: true, activeScene: 'Features' }
  }));
  assert.ifError(acked.err);

  const updated = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    summary: { activeScene: 'Features' },
    actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }]
  }));
  assert.ifError(updated.err);

  const observed = await observedPromise;
  assert.ifError(observed.err);
  assert.strictEqual(observed.result.command.id, polled.result[0].id);
  assert.strictEqual(observed.result.command.status, 'acked');
  assert.deepStrictEqual(observed.result.command.result, { handled: true, activeScene: 'Features' });
  assert.strictEqual(observed.result.surface.surface.summary.activeScene, 'Features');
  assert.strictEqual(observed.result.observation.waitForFreshSnapshot, true);
  assert.strictEqual(observed.result.observation.snapshotRevisionBeforeCommand, 1);
  assert.strictEqual(observed.result.observation.freshSnapshot.fresh, true);
  assert.strictEqual(observed.result.observation.freshSnapshot.revision, 2);
  assert.deepStrictEqual(
    observed.result.activity.map(entry => entry.type),
    ['command.acked', 'command.delivered', 'command.queued']
  );
});

test('agent manager refreshes surfaces through the standard central action', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    summary: { activeScene: 'Hero' },
    visual: { available: true, previewDataUrl: 'data:image/png;base64,abcd', capturedAt: '2026-06-17T10:00:00.000Z' },
    actions: [{ action: 'surface.refresh', label: 'Refresh surface snapshot', category: 'surface' }]
  }));
  assert.ifError(published.err);

  const refreshedPromise = emitAsync(emitter, 'agent.refreshSurface', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    reason: 'test-refresh',
    timeoutMs: 1000,
    intervalMs: 5,
    snapshotTimeoutMs: 1000,
    snapshotIntervalMs: 5
  }));

  await new Promise(resolve => setTimeout(resolve, 0));
  const polled = await emitAsync(emitter, 'agent.pollSurfaceCommands', payload({
    appName: 'designer',
    surfaceId: 'studio.designer'
  }));
  assert.ifError(polled.err);
  assert.strictEqual(polled.result.length, 1);
  assert.strictEqual(polled.result[0].action, 'surface.refresh');
  assert.strictEqual(polled.result[0].reason, 'test-refresh');

  const acked = await emitAsync(emitter, 'agent.ackSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    commandId: polled.result[0].id,
    result: { handled: true, action: 'surface.refresh' }
  }));
  assert.ifError(acked.err);

  const updated = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    summary: { activeScene: 'Hero', refreshed: true },
    visual: { available: true, previewDataUrl: 'data:image/png;base64,efgh', capturedAt: '2026-06-17T10:00:01.000Z' },
    actions: [{ action: 'surface.refresh', label: 'Refresh surface snapshot', category: 'surface' }]
  }));
  assert.ifError(updated.err);

  const refreshed = await refreshedPromise;
  assert.ifError(refreshed.err);
  assert.strictEqual(refreshed.result.command.id, polled.result[0].id);
  assert.strictEqual(refreshed.result.command.status, 'acked');
  assert.strictEqual(refreshed.result.surface.surface.summary.refreshed, true);
  assert.strictEqual(refreshed.result.surface.visual.hasPreview, true);
  assert.strictEqual(refreshed.result.observation.waitForFreshSnapshot, true);
  assert.strictEqual(refreshed.result.observation.snapshotRevisionBeforeCommand, 1);
  assert.strictEqual(refreshed.result.observation.freshSnapshot.fresh, true);
  assert.strictEqual(refreshed.result.observation.freshSnapshot.revision, 2);
});

test('agent manager invokes surface workflows as bounded observed command sequences', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    surfaceType: 'studio-builder',
    title: 'Design Studio',
    summary: { activeScene: 'Hero' },
    actions: [
      { action: 'scene.next', label: 'Next section', category: 'scene' },
      { action: 'scene.select', label: 'Select section', category: 'scene', params: [{ name: 'sceneId', required: true }] }
    ]
  }));
  assert.ifError(published.err);

  const workflow = await emitAsync(emitter, 'agent.invokeSurfaceWorkflow', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    waitForResult: false,
    commands: [
      { action: 'scene.next', label: 'Advance scene' },
      { action: 'scene.select', params: { sceneId: 'features' }, label: 'Select features' }
    ]
  }));

  assert.ifError(workflow.err);
  assert.strictEqual(workflow.result.status, 'completed');
  assert.strictEqual(workflow.result.stepCount, 2);
  assert.strictEqual(workflow.result.completedSteps, 2);
  assert.deepStrictEqual(workflow.result.steps.map(step => step.action), ['scene.next', 'scene.select']);
  assert.deepStrictEqual(workflow.result.steps.map(step => step.command.status), ['queued', 'queued']);

  const commands = await emitAsync(emitter, 'agent.listSurfaceCommands', payload({
    appName: 'designer',
    surfaceId: 'studio.designer'
  }));
  assert.ifError(commands.err);
  assert.strictEqual(commands.result.length, 2);

  const activity = await emitAsync(emitter, 'agent.listActivity', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    limit: 20
  }));
  assert.ifError(activity.err);
  const types = activity.result.map(entry => entry.type);
  assert(types.includes('workflow.started'));
  assert(types.includes('workflow.step'));
  assert(types.includes('workflow.completed'));
});

test('agent manager can wait for existing commands and report non-final timeout state', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    actions: [{ action: 'scene.next', label: 'Next section' }]
  }));
  assert.ifError(published.err);

  const queued = await emitAsync(emitter, 'agent.enqueueSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.next' }
  }));
  assert.ifError(queued.err);

  const waited = await emitAsync(emitter, 'agent.waitForSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    commandId: queued.result.id,
    timeoutMs: 0,
    intervalMs: 5
  }));
  assert.ifError(waited.err);
  assert.strictEqual(waited.result.id, queued.result.id);
  assert.strictEqual(waited.result.status, 'queued');
  assert.deepStrictEqual(waited.result.wait, { timedOut: true, timeoutMs: 0 });
});

test('agent manager validates commands against the latest surface action catalog', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const missingSnapshot = await emitAsync(emitter, 'agent.enqueueSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.next' }
  }));
  assert(missingSnapshot.err);
  assert.match(missingSnapshot.err.message, /Surface snapshot not found/);

  const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    actions: [
      { action: 'scene.select', label: 'Select section', params: [{ name: 'sceneId', required: true }] }
    ]
  }));
  assert.ifError(published.err);

  const unsupported = await emitAsync(emitter, 'agent.enqueueSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.delete' }
  }));
  assert(unsupported.err);
  assert.match(unsupported.err.message, /Unsupported surface action/);

  const missingParam = await emitAsync(emitter, 'agent.enqueueSurfaceCommand', payload({
    appName: 'designer',
    surfaceId: 'studio.designer',
    command: { action: 'scene.select' }
  }));
  assert(missingParam.err);
  assert.match(missingParam.err.message, /Missing required command param "sceneId"/);
});

test('agent manager rejects callers without agent or builder permissions', async () => {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);

  const denied = await emitAsync(emitter, 'agent.listSurfaceSnapshots', payload({
    decodedJWT: { permissions: { content: { update: true } } }
  }));

  assert(denied.err);
  assert.match(denied.err.message, /agent\.view|Forbidden/);
});
