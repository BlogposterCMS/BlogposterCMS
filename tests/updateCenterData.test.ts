/**
 * @jest-environment jsdom
 */

import {
  approvedAccessDescriptors,
  fetchUpdateCenterRows,
  inspectUpdateCenterModule,
  installUpdateCenterModule,
  inspectUpdateCenterRow,
  installUpdateCenterRow,
  toUpdateCenterRows,
  updateCenterRowLabel,
  updateInstallVersion,
  updateInspectionLabel,
  updateStatusLabel,
  updateStatusTone
} from '../ui/widgets/plainspace/admin/settings/updateCenterData';

describe('updateCenterData', () => {
  it('normalizes update center rows and status labels', () => {
    const rows = toUpdateCenterRows([{
      module_name: 'shopSync',
      module_info: {
        moduleName: 'shopSync',
        version: '1.0.0',
        developer: 'Acme'
      },
      updateStatus: {
        moduleName: 'shopSync',
        currentVersion: '1.0.0',
        latestVersion: '1.2.0',
        status: 'available',
        available: true
      }
    }]);

    expect(rows[0]).toMatchObject({
      moduleName: 'shopSync',
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      statusLabel: 'Update v1.2.0',
      statusTone: 'warning',
      available: true
    });
    expect(updateCenterRowLabel(rows[0])).toBe('shopSync');
    expect(updateInspectionLabel({ moduleInfo: { moduleName: 'shopSync' } })).toBe('shopSync');
    expect(updateInstallVersion(rows[0], { latestVersion: '1.3.0' })).toBe('1.3.0');
    expect(updateStatusLabel({ status: 'current', available: false })).toBe('Current');
    expect(updateStatusLabel({ status: 'not_configured', available: false })).toBe('No source');
    expect(updateStatusLabel({ status: 'asset_missing', available: false })).toBe('No matching asset');
    expect(updateStatusTone({ status: 'error', available: false })).toBe('danger');
    expect(approvedAccessDescriptors([
      { event: 'listContentEntries', resource: 'content', action: 'list' },
      { event: 'legacyOnly' }
    ])).toEqual([{ resource: 'content', action: 'list' }]);
  });

  it('fetches update center rows through module runtime facade actions', async () => {
    const emit = jest.fn(async (_eventName, payload) => {
      if (`${payload.resource}.${payload.action}` === 'modules.registry') {
        return [{ module_name: 'shopSync', module_info: { moduleName: 'shopSync', version: '1.0.0' } }];
      }
      if (`${payload.resource}.${payload.action}` === 'modules.system') {
        return [];
      }
      if (`${payload.resource}.${payload.action}` === 'modules.checkUpdates') {
        return [{ moduleName: 'shopSync', currentVersion: '1.0.0', latestVersion: '1.2.0', available: true }];
      }
      return undefined;
    });

    await expect(fetchUpdateCenterRows(emit, 'admin-token')).resolves.toMatchObject([
      {
        moduleName: 'shopSync',
        currentVersion: '1.0.0',
        latestVersion: '1.2.0',
        available: true
      }
    ]);
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
      resource: 'modules',
      action: 'checkUpdates',
      params: {}
    }));
  });

  it('inspects and installs updates through module runtime facade actions', async () => {
    const emit = jest.fn(async (_eventName, payload) => {
      if (`${payload.resource}.${payload.action}` === 'modules.inspectUpdate') {
        return { moduleName: 'shopSync', latestVersion: '1.2.0', moduleInfo: { moduleName: 'shopSync' } };
      }
      return undefined;
    });

    await expect(inspectUpdateCenterModule(emit, 'admin-token', 'shopSync')).resolves.toMatchObject({
      moduleName: 'shopSync',
      latestVersion: '1.2.0'
    });
    await expect(inspectUpdateCenterRow(emit, 'admin-token', {
      moduleName: 'shopSync',
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      meta: '',
      status: 'available',
      statusLabel: 'Update v1.2.0',
      statusTone: 'warning',
      available: true,
      record: {},
      updateStatus: null
    })).resolves.toMatchObject({
      moduleName: 'shopSync',
      latestVersion: '1.2.0'
    });
    await installUpdateCenterModule(emit, 'admin-token', 'shopSync', [{ resource: 'content', action: 'list' }]);
    await installUpdateCenterRow(emit, 'admin-token', {
      moduleName: 'shopSync',
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      meta: '',
      status: 'available',
      statusLabel: 'Update v1.2.0',
      statusTone: 'warning',
      available: true,
      record: {},
      updateStatus: null
    }, [{ resource: 'content', action: 'list' }]);

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'modules',
      action: 'installUpdate',
      params: {
        targetModuleName: 'shopSync',
        approvedAccess: [{ resource: 'content', action: 'list' }]
      }
    });
  });
});
