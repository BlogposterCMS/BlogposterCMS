/** @jest-environment jsdom */
import { createWorkspaceCommandGuard, emitWorkspaceAgent, patchAgentForm, readAgentForm, workspaceActionCatalog, type WorkspaceAgentAction } from '../ui/shared/agent/workspaceAgent';

test('CMS hosts use only the existing admin facade for surface delivery', async () => {
  window.meltdownEmit = jest.fn().mockResolvedValue({ resource: 'agentSurface', action: 'poll', data: [{ id: 'command' }] });
  await expect(emitWorkspaceAgent('agent.pollSurfaceCommands', { appName: 'plainspace', surfaceId: 'cms.pages.test' })).resolves.toEqual([{ id: 'command' }]);
  expect(window.meltdownEmit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
    resource: 'agentSurface', action: 'poll', moduleName: 'runtimeManager', params: { appName: 'plainspace', surfaceId: 'cms.pages.test' }
  }));
  await expect(emitWorkspaceAgent('agent.enqueueSurfaceCommand', {})).rejects.toThrow('CMS_AGENT_TRANSPORT_UNAVAILABLE');
  delete window.meltdownEmit;
});

test('human edits invalidate commands and drafts require an explicit handoff', async () => {
  const state = { dirty: false, busy: false, title: 'Original' };
  const guard = createWorkspaceCommandGuard(() => state);
  const actions: WorkspaceAgentAction[] = [{ action: 'edit', acceptsDraft: true, run: p => { state.title = String(p.title); state.dirty = true; } }];
  const before = guard.snapshot();
  state.title = 'Human draft'; state.dirty = true;
  await expect(guard.execute({ action: 'edit', params: { expectedRevision: before.stateRevision, title: 'Agent' } }, actions)).rejects.toThrow('CMS_AGENT_STATE_CHANGED');
  const current = guard.snapshot();
  await expect(guard.execute({ action: 'edit', params: { expectedRevision: current.stateRevision, title: 'Agent' } }, actions)).rejects.toThrow('CMS_AGENT_DRAFT_REVIEW_REQUIRED');
  const result = await guard.execute({ action: 'edit', params: { expectedRevision: current.stateRevision, title: 'Shared draft', acceptDraft: true } }, actions);
  expect(state.title).toBe('Shared draft');
  expect(result.state).toMatchObject({ dirty: true, busy: false, lastCommand: { action: 'edit', status: 'succeeded' } });
  expect(result.state.stateRevision).not.toBe(current.stateRevision);
});

test('rejects concurrent commands, stale instances and unconfirmed destructive writes', async () => {
  let release!: () => void;
  const run = jest.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const state = { dirty: false, busy: false };
  const guard = createWorkspaceCommandGuard(() => state);
  const actions: WorkspaceAgentAction[] = [{ action: 'delete', confirm: true, run }];
  const params = { expectedRevision: guard.snapshot().stateRevision };
  await expect(guard.execute({ action: 'delete', params }, actions)).rejects.toThrow('CMS_AGENT_CONFIRM_REQUIRED');
  const pending = guard.execute({ action: 'delete', params: { ...params, confirm: true } }, actions);
  await expect(guard.execute({ action: 'delete', params }, actions)).rejects.toThrow('CMS_AGENT_WORKSPACE_BUSY');
  release(); await pending;
  const replacement = createWorkspaceCommandGuard(() => state);
  await expect(replacement.execute({ action: 'delete', params: { ...params, confirm: true } }, actions)).rejects.toThrow('CMS_AGENT_STATE_CHANGED');
  expect(run).toHaveBeenCalledTimes(1);
});

test('failed commands report failure without losing the human draft', async () => {
  const guard = createWorkspaceCommandGuard(() => ({ dirty: true, busy: false, title: 'Keep me' }));
  const actions: WorkspaceAgentAction[] = [{ action: 'save', acceptsDraft: true, run: async () => { throw new Error('WRITE_DENIED'); } }];
  await expect(guard.execute({ action: 'save', params: { expectedRevision: guard.snapshot().stateRevision, acceptDraft: true } }, actions)).rejects.toThrow('WRITE_DENIED');
  expect(guard.snapshot()).toMatchObject({ dirty: true, busy: false, title: 'Keep me', lastCommand: { status: 'failed', error: 'WRITE_DENIED' } });
});

test('typed form patches validate atomically and never expose arbitrary inputs', () => {
  document.body.innerHTML = '<form><input name="title" value="Original"><input type="checkbox" name="enabled"><input type="password" name="secret" value="private"><select name="status"><option value="draft">Draft</option></select></form>';
  const form = document.querySelector('form')!;
  const fields = ['title', 'enabled', 'status'];
  expect(() => patchAgentForm(form, { title: 'Changed', secret: 'overwrite' }, fields)).toThrow('CMS_AGENT_FIELD_INVALID');
  expect(readAgentForm(form, fields)).toEqual({ title: 'Original', enabled: false, status: 'draft' });
  expect(() => patchAgentForm(form, { status: 'invalid' }, fields)).toThrow('CMS_AGENT_FIELD_INVALID');
  patchAgentForm(form, { title: 'Shared', enabled: true }, fields);
  expect(readAgentForm(form, fields)).toEqual({ title: 'Shared', enabled: true, status: 'draft' });
});

test('action discovery includes handoff requirements without executable handlers', () => {
  const [action] = workspaceActionCatalog([{ action: 'save', acceptsDraft: true, confirm: true, run: jest.fn() }]);
  expect(action).not.toHaveProperty('run');
  expect(action?.params).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'expectedRevision', required: true }),
    expect.objectContaining({ name: 'acceptDraft' }),
    expect.objectContaining({ name: 'confirm', required: true })
  ]));
});
