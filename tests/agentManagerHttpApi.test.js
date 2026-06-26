const assert = require('assert');
const EventEmitter = require('events');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const agentManager = require('../mother/modules/agentManager');
const { createAgentApiRouter } = require('../mother/modules/agentManager/httpApi');

class CapturingEmitter extends EventEmitter {
  registerModuleType() {}
}

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

function agentPayload(extra = {}) {
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

async function startAgentApiServer() {
  const emitter = new CapturingEmitter();
  agentManager.setupAgentManagerEvents(emitter);
  const app = express();
  app.use(bodyParser.json());
  app.use(cookieParser());
  app.use('/admin/api/agent', createAgentApiRouter({
    motherEmitter: emitter,
    validateAdminToken: async token => {
      if (token !== 'good-token') throw new Error('Invalid token');
      return {
        userId: 'user-1',
        permissions: {
          builder: { use: true, manage: true }
        }
      };
    }
  }));
  const server = await new Promise(resolve => {
    const started = app.listen(0, () => resolve(started));
  });
  return {
    emitter,
    server,
    baseUrl: `http://localhost:${server.address().port}/admin/api/agent`
  };
}

beforeEach(() => {
  agentManager._internals.surfaceSnapshots.clear();
  agentManager._internals.surfaceCommands.clear();
  agentManager._internals.activityEvents.length = 0;
});

test('agent http api requires an authenticated admin token', async () => {
  const { server, baseUrl } = await startAgentApiServer();
  try {
    const missing = await axios.get(`${baseUrl}/definition`).catch(error => error.response);
    assert.strictEqual(missing.status, 401);

    const invalid = await axios.get(`${baseUrl}/definition`, {
      headers: { Cookie: 'admin_jwt=bad-token' }
    }).catch(error => error.response);
    assert.strictEqual(invalid.status, 401);
  } finally {
    server.close();
  }
});

test('agent http api exposes machine-readable definition and filtered system context', async () => {
  const { emitter, server, baseUrl } = await startAgentApiServer();
  try {
    const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', agentPayload({
      appName: 'designer',
      surfaceId: 'studio.designer',
      surfaceType: 'studio-builder',
      title: 'Design Studio',
      controls: [{ id: 'scene.next' }],
      actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }]
    }));
    assert.ifError(published.err);

    const definition = await axios.get(`${baseUrl}/definition`, {
      headers: { Cookie: 'admin_jwt=good-token' }
    });
    assert.strictEqual(definition.data.data.moduleName, 'agentManager');
    assert.strictEqual(definition.data.data.http.basePath, '/admin/api/agent');

    const context = await axios.get(`${baseUrl}/context`, {
      params: {
        appName: 'designer',
        activeOnly: 'true',
        includeControls: 'true'
      },
      headers: { Cookie: 'admin_jwt=good-token' }
    });
    assert.strictEqual(context.data.data.counts.surfaces, 1);
    assert.strictEqual(context.data.data.surfaces[0].surface.appName, 'designer');
    assert.strictEqual(context.data.data.surfaces[0].controls[0].id, 'scene.next');
    assert.strictEqual(context.data.data.surfaces[0].surface.freshness.inactive, false);
  } finally {
    server.close();
  }
});

test('agent http api queues central surface commands through agentManager', async () => {
  const { emitter, server, baseUrl } = await startAgentApiServer();
  try {
    const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', agentPayload({
      appName: 'designer',
      surfaceId: 'studio.designer',
      actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }]
    }));
    assert.ifError(published.err);

    const queued = await axios.post(
      `${baseUrl}/surfaces/designer/studio.designer/commands`,
      { command: { action: 'scene.next', reason: 'advance via http api' } },
      { headers: { Cookie: 'admin_jwt=good-token' } }
    );
    assert.strictEqual(queued.data.data.status, 'queued');
    assert.strictEqual(queued.data.data.action, 'scene.next');
    assert.strictEqual(queued.data.data.actionLabel, 'Next section');

    const commands = await axios.get(`${baseUrl}/surfaces/designer/studio.designer/commands`, {
      headers: { Cookie: 'admin_jwt=good-token' }
    });
    assert.strictEqual(commands.data.data.length, 1);
    assert.strictEqual(commands.data.data[0].id, queued.data.data.id);
  } finally {
    server.close();
  }
});

test('agent http api validates commands and workflows without execution', async () => {
  const { emitter, server, baseUrl } = await startAgentApiServer();
  try {
    const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', agentPayload({
      appName: 'designer',
      surfaceId: 'studio.designer',
      actions: [
        { action: 'scene.next', label: 'Next section', category: 'scene' },
        { action: 'scene.select', label: 'Select section', category: 'scene', params: [{ name: 'sceneId', required: true }] }
      ]
    }));
    assert.ifError(published.err);

    const commandValidation = await axios.post(
      `${baseUrl}/surfaces/designer/studio.designer/commands/validate`,
      { command: { action: 'scene.select' } },
      { headers: { Cookie: 'admin_jwt=good-token' } }
    );
    assert.strictEqual(commandValidation.data.data.valid, false);
    assert.deepStrictEqual(commandValidation.data.data.missingParams, ['sceneId']);

    const workflowValidation = await axios.post(
      `${baseUrl}/surfaces/designer/studio.designer/workflows/validate`,
      {
        steps: [
          { action: 'scene.next' },
          { action: 'scene.select', params: { sceneId: 'features' } }
        ]
      },
      { headers: { Cookie: 'admin_jwt=good-token' } }
    );
    assert.strictEqual(workflowValidation.data.data.valid, true);
    assert.deepStrictEqual(
      workflowValidation.data.data.steps.map(step => step.validation.action),
      ['scene.next', 'scene.select']
    );

    const commands = await axios.get(`${baseUrl}/surfaces/designer/studio.designer/commands`, {
      headers: { Cookie: 'admin_jwt=good-token' }
    });
    assert.strictEqual(commands.data.data.length, 0);
  } finally {
    server.close();
  }
});

test('agent http api exposes central activity events', async () => {
  const { emitter, server, baseUrl } = await startAgentApiServer();
  try {
    const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', agentPayload({
      appName: 'designer',
      surfaceId: 'studio.designer',
      actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }]
    }));
    assert.ifError(published.err);

    const queued = await emitAsync(emitter, 'agent.enqueueSurfaceCommand', agentPayload({
      appName: 'designer',
      surfaceId: 'studio.designer',
      command: { action: 'scene.next' }
    }));
    assert.ifError(queued.err);

    const activity = await axios.get(`${baseUrl}/activity`, {
      params: {
        appName: 'designer',
        commandId: queued.result.id
      },
      headers: { Cookie: 'admin_jwt=good-token' }
    });
    assert.deepStrictEqual(
      activity.data.data.map(entry => entry.type),
      ['command.queued']
    );
    assert.strictEqual(activity.data.data[0].commandId, queued.result.id);
  } finally {
    server.close();
  }
});

test('agent http api exposes compact surface previews', async () => {
  const { emitter, server, baseUrl } = await startAgentApiServer();
  const previewPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lUL1GQAAAABJRU5ErkJggg==';
  try {
    const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', agentPayload({
      appName: 'designer',
      surfaceId: 'studio.designer',
      surfaceType: 'studio-builder',
      title: 'Design Studio',
      visual: {
        available: true,
        previewDataUrl: `data:image/png;base64,${previewPng}`,
        width: 1200,
        height: 800,
        capturedAt: '2026-06-17T10:00:00.000Z'
      }
    }));
    assert.ifError(published.err);

    const preview = await axios.get(`${baseUrl}/surfaces/designer/studio.designer/preview`, {
      params: { includeData: 'true' },
      headers: { Cookie: 'admin_jwt=good-token' }
    });

    assert.strictEqual(preview.data.data.surface.appName, 'designer');
    assert.strictEqual(preview.data.data.surface.surfaceId, 'studio.designer');
    assert.strictEqual(preview.data.data.available, true);
    assert.strictEqual(preview.data.data.visual.width, 1200);
    assert.strictEqual(preview.data.data.visual.previewDataUrl, `data:image/png;base64,${previewPng}`);
    assert.strictEqual(preview.data.data.capturedAt, '2026-06-17T10:00:00.000Z');

    const image = await axios.get(`${baseUrl}/surfaces/designer/studio.designer/preview/image`, {
      responseType: 'arraybuffer',
      headers: { Cookie: 'admin_jwt=good-token' }
    });
    assert.strictEqual(image.headers['content-type'], 'image/png');
    assert.strictEqual(image.headers['cache-control'], 'no-store');
    assert.strictEqual(image.headers['x-agent-surface-revision'], '1');
    assert.deepStrictEqual(Buffer.from(image.data), Buffer.from(previewPng, 'base64'));
  } finally {
    server.close();
  }
});

test('agent http api exposes bundled surface inspections', async () => {
  const { emitter, server, baseUrl } = await startAgentApiServer();
  try {
    const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', agentPayload({
      appName: 'designer',
      surfaceId: 'studio.designer',
      surfaceType: 'studio-builder',
      title: 'Design Studio',
      summary: { activeScene: 'Hero' },
      controls: [{ id: 'scene.next' }],
      actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }],
      visual: {
        available: true,
        previewDataUrl: 'data:image/png;base64,abcd',
        width: 1200,
        height: 800
      }
    }));
    assert.ifError(published.err);

    const queued = await emitAsync(emitter, 'agent.enqueueSurfaceCommand', agentPayload({
      appName: 'designer',
      surfaceId: 'studio.designer',
      command: { action: 'scene.next' }
    }));
    assert.ifError(queued.err);

    const inspection = await axios.get(`${baseUrl}/surfaces/designer/studio.designer/inspect`, {
      params: {
        includeControls: 'true',
        includeData: 'true',
        activityLimit: '5'
      },
      headers: { Cookie: 'admin_jwt=good-token' }
    });

    assert.strictEqual(inspection.data.data.surface.surfaceId, 'studio.designer');
    assert.strictEqual(inspection.data.data.context.surface.summary.activeScene, 'Hero');
    assert.strictEqual(inspection.data.data.context.controls[0].id, 'scene.next');
    assert.strictEqual(inspection.data.data.preview.visual.previewDataUrl, 'data:image/png;base64,abcd');
    assert.strictEqual(inspection.data.data.actions[0].action, 'scene.next');
    assert.strictEqual(inspection.data.data.activity[0].commandId, queued.result.id);
    assert.strictEqual(
      inspection.data.data.previewImageUrl,
      '/admin/api/agent/surfaces/designer/studio.designer/preview/image'
    );
  } finally {
    server.close();
  }
});

test('agent http api invokes commands and returns observed state', async () => {
  const { emitter, server, baseUrl } = await startAgentApiServer();
  try {
    const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', agentPayload({
      appName: 'designer',
      surfaceId: 'studio.designer',
      summary: { activeScene: 'Hero' },
      actions: [{ action: 'scene.next', label: 'Next section', category: 'scene' }]
    }));
    assert.ifError(published.err);

    const observed = await axios.post(
      `${baseUrl}/surfaces/designer/studio.designer/commands/observe`,
      {
        command: { action: 'scene.next' },
        waitForResult: false,
        observeDelayMs: 0,
        waitForFreshSnapshot: true,
        snapshotTimeoutMs: 0,
        snapshotIntervalMs: 5
      },
      { headers: { Cookie: 'admin_jwt=good-token' } }
    );

    assert.strictEqual(observed.data.data.command.status, 'queued');
    assert.strictEqual(observed.data.data.surface.surface.summary.activeScene, 'Hero');
    assert.strictEqual(
      observed.data.data.previewImageUrl,
      '/admin/api/agent/surfaces/designer/studio.designer/preview/image'
    );
    assert.strictEqual(observed.data.data.observation.waitForFreshSnapshot, true);
    assert.strictEqual(observed.data.data.observation.freshSnapshot.fresh, false);
    assert.strictEqual(observed.data.data.observation.freshSnapshot.timedOut, true);
    assert.deepStrictEqual(
      observed.data.data.activity.map(entry => entry.type),
      ['command.queued']
    );
  } finally {
    server.close();
  }
});

test('agent http api refreshes a surface through the dedicated route', async () => {
  const { emitter, server, baseUrl } = await startAgentApiServer();
  try {
    const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', agentPayload({
      appName: 'designer',
      surfaceId: 'studio.designer',
      summary: { activeScene: 'Hero' },
      actions: [{ action: 'surface.refresh', label: 'Refresh surface snapshot', category: 'surface' }]
    }));
    assert.ifError(published.err);

    const refreshed = await axios.post(
      `${baseUrl}/surfaces/designer/studio.designer/refresh`,
      {
        reason: 'http-refresh',
        waitForResult: false,
        waitForFreshSnapshot: true,
        snapshotTimeoutMs: 0,
        snapshotIntervalMs: 5
      },
      { headers: { Cookie: 'admin_jwt=good-token' } }
    );

    assert.strictEqual(refreshed.data.data.command.status, 'queued');
    assert.strictEqual(refreshed.data.data.command.action, 'surface.refresh');
    assert.strictEqual(refreshed.data.data.command.reason, 'http-refresh');
    assert.strictEqual(refreshed.data.data.surface.surface.summary.activeScene, 'Hero');
    assert.strictEqual(
      refreshed.data.data.previewImageUrl,
      '/admin/api/agent/surfaces/designer/studio.designer/preview/image'
    );
    assert.strictEqual(refreshed.data.data.observation.waitForFreshSnapshot, true);
    assert.strictEqual(refreshed.data.data.observation.freshSnapshot.timedOut, true);
  } finally {
    server.close();
  }
});

test('agent http api invokes central surface workflows', async () => {
  const { emitter, server, baseUrl } = await startAgentApiServer();
  try {
    const published = await emitAsync(emitter, 'agent.publishSurfaceSnapshot', agentPayload({
      appName: 'designer',
      surfaceId: 'studio.designer',
      actions: [
        { action: 'scene.next', label: 'Next section', category: 'scene' },
        { action: 'scene.select', label: 'Select section', category: 'scene', params: [{ name: 'sceneId', required: true }] }
      ]
    }));
    assert.ifError(published.err);

    const workflow = await axios.post(
      `${baseUrl}/surfaces/designer/studio.designer/workflows`,
      {
        waitForResult: false,
        steps: [
          { action: 'scene.next' },
          { action: 'scene.select', params: { sceneId: 'features' } }
        ]
      },
      { headers: { Cookie: 'admin_jwt=good-token' } }
    );

    assert.strictEqual(workflow.data.data.status, 'completed');
    assert.strictEqual(workflow.data.data.stepCount, 2);
    assert.strictEqual(
      workflow.data.data.previewImageUrl,
      '/admin/api/agent/surfaces/designer/studio.designer/preview/image'
    );
    assert.deepStrictEqual(workflow.data.data.steps.map(step => step.action), ['scene.next', 'scene.select']);
    assert.deepStrictEqual(workflow.data.data.steps.map(step => step.command.status), ['queued', 'queued']);
    assert.strictEqual(
      workflow.data.data.steps[0].observation.previewImageUrl,
      '/admin/api/agent/surfaces/designer/studio.designer/preview/image'
    );
  } finally {
    server.close();
  }
});

test('real app mounts the dedicated agent admin api before admin fallback routes', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const mountIndex = appJs.indexOf("app.use('/admin/api/agent'");
  const fallbackIndex = appJs.indexOf("app.get('/admin/*'");
  assert(mountIndex > -1, 'agent admin api mount missing');
  assert(fallbackIndex > -1, 'admin fallback route missing');
  assert(mountIndex < fallbackIndex, 'agent admin api must be mounted before the admin fallback');
  assert(appJs.includes("createAgentApiRouter({"));
  assert(appJs.includes("csrfProtection, createAgentApiRouter"));
});
