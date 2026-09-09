import { bpDialog } from '../../../shared/dialogs/bpDialog.js';
import { permissionGroupForKey, permissionKey } from './usersListData.js';
import type { PermissionRecord } from './userEditData.js';

/** Edit a detached draft; only the account editor owns persistence. */
export async function editUserPermissions(permissions: PermissionRecord[], selected: Set<string>): Promise<Set<string> | null> {
  const draft = new Set(selected);
  const body = document.createElement('div');
  body.className = 'user-permissions-dialog';
  const search = document.createElement('input');
  search.type = 'search'; search.className = 'form-input';
  search.placeholder = 'Search rights…'; search.setAttribute('aria-label', 'Search rights');
  // Enter in the filter must not submit the shared dialog form.
  search.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
  const count = document.createElement('p'); count.className = 'settings-hint'; count.setAttribute('role', 'status');
  const list = document.createElement('div'); list.className = 'user-permissions-list';
  const groups = new Map<string, HTMLElement>();
  const rows: { label: HTMLLabelElement; text: string }[] = [];
  const seen = new Set<string>();
  [...permissions].sort((a, b) => permissionKey(a).localeCompare(permissionKey(b))).forEach(permission => {
    const key = permissionKey(permission);
    if (!key || key === '*' || key === 'canAccessEverything' || seen.has(key)) return;
    seen.add(key);
    const group = permissionGroupForKey(key);
    let section = groups.get(group);
    if (!section) {
      section = document.createElement('fieldset'); section.className = 'user-permissions-group';
      const title = document.createElement('legend'); title.textContent = group;
      section.append(title); groups.set(group, section); list.append(section);
    }
    const label = document.createElement('label'); label.className = 'user-permissions-option';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = draft.has(key);
    input.dataset.permissionKey = key;
    input.addEventListener('change', () => {
      if (input.checked) draft.add(key); else draft.delete(key);
      refresh();
    });
    const text = document.createElement('span');
    const name = document.createElement('span'); name.textContent = permission.description || key;
    text.append(name);
    if (permission.description) { const code = document.createElement('small'); code.textContent = key; text.append(code); }
    label.append(input, text); section.append(label);
    rows.push({ label, text: `${key} ${permission.description || ''}`.toLowerCase() });
  });
  const empty = document.createElement('p'); empty.className = 'settings-hint';
  function refresh(): void {
    const query = search.value.trim().toLowerCase();
    rows.forEach(row => { row.label.hidden = !row.text.includes(query); });
    groups.forEach(section => { section.hidden = ![...section.querySelectorAll('label')].some(label => !label.hidden); });
    const visible = rows.filter(row => !row.label.hidden).length;
    count.textContent = `${draft.size} direct rights selected · ${visible} shown`;
    empty.hidden = visible > 0;
    empty.textContent = rows.length ? 'No rights match your search.' : 'No individual rights are available.';
  }
  search.addEventListener('input', refresh);
  body.append(search, count, list, empty); refresh();
  const result = await bpDialog.open({
    kind: 'modal', title: 'Advanced rights',
    message: 'Direct rights supplement permission groups. Apply changes here, then choose Save user to save the account.',
    body, actions: [{ id: 'cancel', label: 'Cancel', variant: 'ghost' }, { id: 'apply', label: 'Apply changes', variant: 'primary' }]
  });
  return result.action === 'apply' ? draft : null;
}
