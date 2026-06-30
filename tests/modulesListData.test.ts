/**
 * @jest-environment jsdom
 */

import {
  errorMessage,
  fetchModuleLists,
  fetchPendingModuleAccessRequests,
  inspectModuleZip,
  installModuleZip,
  resolveModuleAccessRequest,
  renderModuleMeta,
  toModuleAccessRuntimeRequests,
  toggleModuleRegistryActivation,
  toModuleZipInspection,
  toModules,
  zipDataFromDataUrl
} from '../ui/widgets/plainspace/admin/modulesListData';

describe('modulesListData', () => {
  it('normalizes module payloads and renders module metadata text', () => {
    expect(toModules({
      data: [
        { module_name: 'pagesManager' },
        null,
        'bad'
      ]
    })).toEqual([{ module_name: 'pagesManager' }]);
    expect(toModuleAccessRuntimeRequests({
      data: [
        { id: 'req-1', moduleName: 'shopSync', event: 'deleteUser', resource: 'users', action: 'delete' },
        null
      ]
    })).toEqual([
      { id: 'req-1', moduleName: 'shopSync', event: 'deleteUser', resource: 'users', action: 'delete' }
    ]);
    expect(toModules([{ module_name: 'plainSpace' }])).toEqual([{ module_name: 'plainSpace' }]);
    expect(toModuleZipInspection({
      moduleInfo: {
        moduleName: 'shopSync',
        requestedAccess: [{ event: 'listContentEntries' }]
      }
    })).toEqual({
      moduleName: 'shopSync',
      moduleInfo: {
        moduleName: 'shopSync',
        requestedAccess: [{ event: 'listContentEntries' }]
      },
      permissions: [],
      requestedAccess: [{ event: 'listContentEntries' }]
    });
    expect(renderModuleMeta({
      version: '1.2.3',
      developer: 'Blogposter',
      description: 'CMS module'
    })).toBe('v1.2.3 \u2022 Blogposter \u2022 CMS module');
    expect(renderModuleMeta({})).toBe('Unknown Developer');
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
    expect(zipDataFromDataUrl('data:application/zip;base64,UEsDBAo=')).toBe('UEsDBAo=');
    expect(() => zipDataFromDataUrl('bad')).toThrow('PLAINSPACE_MODULES_ZIP_DATA_UNAVAILABLE');
  });

  it('fetches installed and system module lists through the runtime admin facade', async () => {
    const emit = jest.fn(async (_eventName, payload) => (
      `${payload.resource}.${payload.action}` === 'modules.registry'
        ? { data: [{ module_name: 'installed' }] }
        : [{ module_name: 'system' }]
    ));

    await expect(fetchModuleLists(emit, 'admin-token')).resolves.toEqual({
      installed: [{ module_name: 'installed' }],
      system: [{ module_name: 'system' }]
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'modules',
      action: 'registry',
      params: {}
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'modules',
      action: 'system',
      params: {}
    });
  });

  it('toggles module activation through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await expect(toggleModuleRegistryActivation(emit, 'admin-token', {
      module_name: 'comments',
      is_active: false
    })).resolves.toBe(true);
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'modules',
      action: 'activate',
      params: { targetModuleName: 'comments' }
    });

    await expect(toggleModuleRegistryActivation(emit, 'admin-token', {
      module_name: 'comments',
      is_active: true
    })).resolves.toBe(false);
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'modules',
      action: 'deactivate',
      params: { targetModuleName: 'comments' }
    });
  });

  it('installs uploaded module ZIP data through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await inspectModuleZip(emit, 'admin-token', 'UEsDBAo=');
    await installModuleZip(emit, 'admin-token', 'UEsDBAo=', [{ event: 'listContentEntries' }]);

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'modules',
      action: 'inspectZip',
      params: { zipData: 'UEsDBAo=' }
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'modules',
      action: 'installZip',
      params: {
        zipData: 'UEsDBAo=',
        approvedAccess: [{ event: 'listContentEntries' }]
      }
    });
  });

  it('lists and resolves pending runtime module access requests', async () => {
    const emit = jest.fn(async (_eventName, payload) => (
      `${payload.resource}.${payload.action}` === 'modules.accessRequests'
        ? [{ id: 'req-1', moduleName: 'shopSync', event: 'deleteUser', resource: 'users', action: 'delete' }]
        : undefined
    ));

    await expect(fetchPendingModuleAccessRequests(emit, 'admin-token', 'shopSync')).resolves.toEqual([
      { id: 'req-1', moduleName: 'shopSync', event: 'deleteUser', resource: 'users', action: 'delete' }
    ]);
    await resolveModuleAccessRequest(emit, 'admin-token', 'req-1', 'approve', 'once');

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'modules',
      action: 'accessRequests',
      params: { targetModuleName: 'shopSync' }
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'modules',
      action: 'resolveAccessRequest',
      params: {
        requestId: 'req-1',
        decision: 'approve',
        mode: 'once'
      }
    });
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(installModuleZip(undefined as never, 'admin-token', 'UEsDBAo='))
      .rejects.toThrow('PLAINSPACE_MODULES_EMITTER_UNAVAILABLE');
  });
});
