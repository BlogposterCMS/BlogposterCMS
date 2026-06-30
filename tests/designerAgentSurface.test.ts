import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const appLoader = require(path.join(root, 'mother/modules/appLoader'));

test('designer uses the central agent manager instead of a private agent API', () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(root, 'apps/designer/app.json'), 'utf8'));
  const allowedEvents = new Map(
    appLoader._internals.normalizeAllowedAppEvents(appJson)
  );
  const coreModulesSource = fs.readFileSync(path.join(root, 'mother/server/bootstrap/coreModules.js'), 'utf8');
  const designerHtml = fs.readFileSync(path.join(root, 'apps/designer/index.html'), 'utf8');
  const indexSource = fs.readFileSync(path.join(root, 'ui/designer/app/index.ts'), 'utf8');
  const agentSurfaceSource = fs.readFileSync(path.join(root, 'ui/designer/app/agentSurface.ts'), 'utf8');
  const builderRendererSource = fs.readFileSync(path.join(root, 'ui/designer/app/builderRenderer.ts'), 'utf8');
  const sharedClientSource = fs.readFileSync(path.join(root, 'ui/shared/agent/agentSurfaceClient.ts'), 'utf8');
  const rootAgentsSource = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const designerDocsSource = fs.readFileSync(path.join(root, 'docs/modules/designer.md'), 'utf8');
  const feedbackGuideSource = fs.readFileSync(path.join(root, 'docs/design-studio-agent-feedback.md'), 'utf8');

  expect(coreModulesSource).toContain("path: 'mother/modules/agentManager'");
  expect(appJson.agentSurface).toBe(true);
  expect(appJson.allowedEvents.some((entry: { eventName?: string }) => String(entry.eventName || '').startsWith('agent.'))).toBe(false);
  expect(designerHtml).toContain('/build/appBridge.js');
  expect(designerHtml).not.toContain('/apps/designer/appBridge.js');
  expect(indexSource).toContain("import { startDesignerAgentSurface } from './agentSurface'");
  expect(indexSource).toContain('startDesignerAgentSurface();');

  for (const eventName of [
    'agent.getCapabilities',
    'agent.getApiDefinition',
    'agent.getSurfaceAction',
    'agent.getSurfaceContext',
    'agent.listSurfaceActions',
    'agent.listSurfaceCommands',
    'agent.pollSurfaceCommands',
    'agent.publishSurfaceSnapshot',
    'agent.ackSurfaceCommand'
  ]) {
    expect(allowedEvents.get(eventName)).toMatchObject({
      moduleName: 'agentManager',
      moduleType: 'core'
    });
  }

  expect(allowedEvents.get('agent.publishSurfaceSnapshot')).toMatchObject({ access: 'write' });
  expect(allowedEvents.get('agent.ackSurfaceCommand')).toMatchObject({ access: 'write' });
  expect(agentSurfaceSource).toContain('buildDesignerAgentSnapshot');
  expect(agentSurfaceSource).toContain('function buildDesignerAgentFeedback');
  expect(agentSurfaceSource).toContain("channel: 'design-studio.agent-feedback'");
  expect(agentSurfaceSource).toContain("action: 'feedback.refresh'");
  expect(agentSurfaceSource).toContain('meta:');
  expect(agentSurfaceSource).toContain('agentFeedback');
  expect(agentSurfaceSource).toContain('layoutTree');
  expect(agentSurfaceSource).toContain('widgetPlacements');
  expect(agentSurfaceSource).toContain('styleSources');
  expect(agentSurfaceSource).toContain('DESIGNER_AGENT_FEEDBACK_NO_LAYOUT_ROOT');
  expect(agentSurfaceSource).toContain('DESIGNER_AGENT_FEEDBACK_NO_COMMAND_PORT');
  expect(agentSurfaceSource).toContain('DESIGNER_AGENT_FEEDBACK_ZERO_WIDGET_BOUNDS');
  expect(agentSurfaceSource).toContain('DESIGNER_AGENT_FEEDBACK_VISUAL_PREVIEW_UNAVAILABLE');
  expect(agentSurfaceSource).toContain('createAgentControlClient');
  expect(agentSurfaceSource).toContain('SURFACE_AGENT_ACTIONS');
  expect(agentSurfaceSource).toContain("import { capturePreview } from './renderer/capturePreview.js'");
  expect(agentSurfaceSource).toContain('captureStageVisual');
  expect(agentSurfaceSource).toContain("reason === 'refresh'");
  expect(agentSurfaceSource).toContain('DESIGNER_AGENT_ACTIONS');
  expect(agentSurfaceSource).toContain('function stageBehaviorMap');
  expect(agentSurfaceSource).toContain('function effectsOf');
  expect(agentSurfaceSource).toContain('function elementBounds');
  expect(sharedClientSource).toContain("action: 'surface.refresh'");
  expect(sharedClientSource).toContain('feedback?: Record<string, unknown>');
  expect(agentSurfaceSource).toContain("action: 'scene.update'");
  expect(agentSurfaceSource).toContain("action: 'insert.element'");
  expect(agentSurfaceSource).toContain("action: 'behavior.set'");
  expect(agentSurfaceSource).toContain("action: 'range.set'");
  expect(agentSurfaceSource).toContain("action: 'effect.set'");
  expect(agentSurfaceSource).toContain("action: 'element.update'");
  expect(agentSurfaceSource).toContain('actions: DESIGNER_AGENT_ACTIONS');
  expect(agentSurfaceSource).toContain('behaviorElementCount: behaviorMap.behaviorElementCount');
  expect(agentSurfaceSource).toContain('effectElementCount: behaviorMap.effectElementCount');
  expect(agentSurfaceSource).toContain('behaviorMap');
  expect(agentSurfaceSource).toContain('range: rangeOf(selected)');
  expect(agentSurfaceSource).toContain('effectCount: effects.length');
  expect(agentSurfaceSource).toContain('bounds: elementBounds(selected)');
  expect(agentSurfaceSource).toContain('visual,');
  expect(agentSurfaceSource).toContain('.scene-section-item');
  expect(agentSurfaceSource).toContain('[data-stage-scene-action]');
  expect(agentSurfaceSource).toContain('handleDesignerAgentCommand');
  expect(agentSurfaceSource).toContain('commandPort.execute(command)');
  expect(agentSurfaceSource).toContain('designerControl: control');
  expect(builderRendererSource).toContain('window.blogposterDesignerCommands');
  expect(builderRendererSource).toContain('async function executeDesignerAgentCommand');
  expect(builderRendererSource).toContain("action === 'range.set'");
  expect(builderRendererSource).toContain("action === 'effect.set'");
  expect(builderRendererSource).toContain("action === 'element.update'");
  expect(builderRendererSource).toContain("action === 'scene.update'");
  expect(sharedClientSource).toContain('agent.publishSurfaceSnapshot');
  expect(sharedClientSource).toContain('agent.getApiDefinition');
  expect(sharedClientSource).toContain('agent.pollSurfaceCommands');
  expect(sharedClientSource).toContain('agent.getSystemContext');
  expect(sharedClientSource).toContain('agent.getSurfaceContext');
  expect(sharedClientSource).toContain('agent.listSurfaceActions');
  expect(sharedClientSource).toContain('agent.getSurfaceAction');
  expect(sharedClientSource).toContain('agent.invokeSurfaceCommand');
  expect(sharedClientSource).toContain('agent.refreshSurface');
  expect(sharedClientSource).toContain('agent.waitForSurfaceCommand');
  expect(rootAgentsSource).toContain('## Design Studio Agent Feedback');
  expect(rootAgentsSource).toContain('ui/designer/app/agentSurface.ts');
  expect(rootAgentsSource).toContain('DESIGNER_AGENT_FEEDBACK_*');
  expect(designerDocsSource).toContain('design-studio.agent-feedback');
  expect(designerDocsSource).toContain('docs/design-studio-agent-feedback.md');
  expect(feedbackGuideSource).toContain('AgentManager/AppLoader');
  expect(feedbackGuideSource).toContain('ui/designer/app/agentSurface.ts');
  expect(feedbackGuideSource).toContain('stable widget instance ids');
  expect(feedbackGuideSource).toContain('DESIGNER_AGENT_FEEDBACK_*');
});
