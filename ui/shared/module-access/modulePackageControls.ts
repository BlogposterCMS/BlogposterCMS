import { inspectModuleZip, installModuleZip, type ModuleAccessRequest, type ModuleInfo, type ModuleZipInspection } from './modulesListData.js';

interface DialogResult {
  action?: string;
}

interface DialogApi {
  alert?: (message: string, options?: { title?: string }) => Promise<DialogResult>;
  confirm?: (message: string, options?: { title?: string; confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
  open?: (options: {
    title: string;
    message?: string;
    body?: Node;
    kind?: string;
    actions?: Array<{ id: string; label: string; variant?: string }>;
    dismissable?: boolean;
  }) => Promise<DialogResult>;
}

export function dialogApi(): DialogApi | null {
  return (window as Window & { bpDialog?: DialogApi }).bpDialog || null;
}

export function accessEventLabel(access: ModuleAccessRequest): string {
  const event = access.event || '';
  const resource = access.resource && access.action ? `${access.resource}.${access.action}` : '';
  return resource ? `${event} (${resource})` : event;
}

function approvedAccessDescriptor(access: ModuleAccessRequest): ModuleAccessRequest | null {
  if (!access.resource || !access.action) return null;
  return {
    resource: access.resource,
    action: access.action
  };
}

function buildAccessReviewBody(info: ModuleZipInspection | ModuleInfo, checkedEvents = new Set<string>()): HTMLDivElement {
  const source: ModuleInfo = 'moduleInfo' in info ? info.moduleInfo || {} : info;
  const permissions = 'permissions' in info && Array.isArray(info.permissions)
    ? info.permissions
    : source.permissions || [];
  const requestedAccess = 'requestedAccess' in info && Array.isArray(info.requestedAccess)
    ? info.requestedAccess
    : source.requestedAccess || [];
  const grantedEvents = new Set((source.trustedAccessGrants || [])
    .filter(grant => grant.granted && grant.event)
    .map(grant => grant.event as string));

  const body = document.createElement('div');
  body.className = 'module-access-review';

  if (permissions.length) {
    const section = document.createElement('div');
    section.className = 'module-access-section';
    const title = document.createElement('strong');
    title.textContent = 'Module permissions';
    section.appendChild(title);
    const list = document.createElement('ul');
    permissions.forEach(permission => {
      const item = document.createElement('li');
      item.textContent = `${permission.permission_key || permission.key || ''}: ${permission.description || ''}`;
      list.appendChild(item);
    });
    section.appendChild(list);
    body.appendChild(section);
  }

  const accessSection = document.createElement('div');
  accessSection.className = 'module-access-section';
  const accessTitle = document.createElement('strong');
  accessTitle.textContent = 'Core event access';
  accessSection.appendChild(accessTitle);

  if (!requestedAccess.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No core event access requested.';
    accessSection.appendChild(empty);
  } else {
    requestedAccess.forEach(access => {
      const label = document.createElement('label');
      label.className = 'module-access-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = access.event || '';
      checkbox.disabled = access.allowPermanent === false || access.protected === true;
      checkbox.checked = !checkbox.disabled && (checkedEvents.has(access.event || '') || grantedEvents.has(access.event || ''));
      checkbox.dataset.moduleAccessEvent = access.event || '';
      label.classList.toggle('is-disabled', checkbox.disabled);

      const text = document.createElement('span');
      text.textContent = accessEventLabel(access) + (access.required ? ' (required by this module)' : ' (optional)');
      label.appendChild(checkbox);
      label.appendChild(text);

      if (access.reason) {
        const reason = document.createElement('small');
        reason.textContent = access.reason;
        label.appendChild(reason);
      }
      if (checkbox.disabled) {
        const note = document.createElement('small');
        note.textContent = 'Protected: unavailable for permanent approval';
        label.appendChild(note);
      }
      accessSection.appendChild(label);
    });
  }

  body.appendChild(accessSection);
  return body;
}

export async function reviewModuleAccess(
  title: string,
  message: string,
  inspection: ModuleZipInspection | ModuleInfo,
  confirmLabel: string,
  defaultApproved = true
): Promise<ModuleAccessRequest[] | null> {
  const requestedAccess = 'requestedAccess' in inspection && Array.isArray(inspection.requestedAccess)
    ? inspection.requestedAccess
    : inspection.requestedAccess || [];
  const checkedEvents = new Set(defaultApproved
    ? requestedAccess
      .filter(access => access.allowPermanent !== false && access.protected !== true)
      .map(access => access.event || '')
      .filter(Boolean)
    : []);
  const body = buildAccessReviewBody(inspection, checkedEvents);
  const dialog = dialogApi();

  if (!dialog?.open) {
    throw new Error('EXTENSION_REVIEW_UNAVAILABLE: The access review dialog is unavailable. Reload before installing.');
  }

  const result = await dialog.open({
    kind: 'warning',
    title,
    message,
    body,
    dismissable: true,
    actions: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'confirm', label: confirmLabel, variant: 'primary' }
    ]
  });
  if (result.action !== 'confirm') return null;

  const selectedEvents = new Set(Array.from(body.querySelectorAll<HTMLInputElement>('input[data-module-access-event]'))
    .filter(input => input.checked)
    .map(input => input.value));
  return requestedAccess
    .filter(access => selectedEvents.has(access.event || ''))
    .map(approvedAccessDescriptor)
    .filter((access): access is ModuleAccessRequest => Boolean(access));
}

export async function installModuleArchive(zipData: string, fileName: string, status: HTMLElement): Promise<boolean> {
    const emit = window.meltdownEmit;
    const inspection = await inspectModuleZip(emit, window.ADMIN_TOKEN, zipData);
    const name = inspection.moduleName || fileName;
    const approved = await reviewModuleAccess(`Install ${name}`, 'Review the declared capabilities. Unselected and undeclared core events stay blocked. Module-owned storage, scoped assets and lifecycle events remain available.', inspection, 'Install and allow selected access');
    if (approved === null) return false;
    status.textContent = 'Installing and activating module…';
    await installModuleZip(emit, window.ADMIN_TOKEN, zipData, approved, inspection.reviewedHash);
    window.location.reload();
    return true;
}
