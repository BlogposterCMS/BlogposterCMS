/** @jest-environment jsdom */
import { editUserPermissions } from '../ui/widgets/plainspace/admin/userPermissionsDialog';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';

jest.mock('../ui/shared/dialogs/bpDialog', () => ({ bpDialog: { open: jest.fn() } }));

describe('advanced rights draft dialog', () => {
  it('filters groups without losing selections and preserves unlisted direct rights', async () => {
    (bpDialog.open as jest.Mock).mockImplementation(async ({ body }) => {
      const search = body.querySelector('input[type="search"]');
      search.value = 'write'; search.dispatchEvent(new Event('input'));
      expect(body.querySelector('[data-permission-key="pages.read"]').closest('fieldset').hidden).toBe(true);
      const choice = body.querySelector('[data-permission-key="content.write"]');
      choice.checked = true; choice.dispatchEvent(new Event('change'));
      search.value = 'missing'; search.dispatchEvent(new Event('input'));
      expect(body.textContent).toContain('No rights match your search.');
      const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
      search.dispatchEvent(enter); expect(enter.defaultPrevented).toBe(true);
      return { action: 'apply' };
    });
    const selected = new Set(['pages.read', 'legacy.read']);
    const result = await editUserPermissions([{ key: 'pages.read' }, { key: 'content.write' }], selected);
    expect(result).toEqual(new Set(['pages.read', 'legacy.read', 'content.write']));
    expect(selected.size).toBe(2);
  });
  it('returns no draft on cancellation and handles an empty registry', async () => {
    (bpDialog.open as jest.Mock).mockImplementation(async ({ body }) => {
      expect(body.textContent).toContain('No individual rights are available.');
      return { action: 'cancel' };
    });
    expect(await editUserPermissions([], new Set())).toBeNull();
  });
});
