/** @jest-environment jsdom */
import { readDesignerDraftInputs } from '../ui/designer/app/renderer/draftInputs';
import { createWorkspaceCommandGuard } from '../ui/shared/agent/workspaceAgent';

test('uncommitted inspector typing invalidates a Designer command before its change handler runs', async () => {
  document.body.innerHTML = '<input id="layoutNameInput" value="Design"><aside id="sceneInspector"><input class="scene-section-name" value="Hero"><input type="password" value="private"></aside><input name="unrelated" value="private">';
  const guard = createWorkspaceCommandGuard(() => ({ dirty: false, busy: false, draftInputs: readDesignerDraftInputs() }));
  const revision = guard.snapshot().stateRevision;
  document.querySelector<HTMLInputElement>('.scene-section-name')!.value = 'Human draft';
  const run = jest.fn();
  await expect(guard.execute({ action: 'scene.update', params: { expectedRevision: revision } }, [{ action: 'scene.update', run }])).rejects.toThrow('CMS_AGENT_STATE_CHANGED');
  expect(run).not.toHaveBeenCalled();
  expect(readDesignerDraftInputs()).toHaveLength(2);
  expect(JSON.stringify(readDesignerDraftInputs())).not.toContain('private');
});
