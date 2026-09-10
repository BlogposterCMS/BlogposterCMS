import { bpDialog } from '../../../shared/dialogs/bpDialog.js';
import { designUrl } from './designerLayoutsData.js';
import { importNativeDesign, parseNativeDesignImport } from './designerImportData.js';

/** Reuse the existing Designer save boundary; no page binding or publication is implicit. */
export function createDesignerImportControl(): HTMLElement {
  const group = document.createElement('span');
  const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary small'; button.textContent = 'Import design JSON';
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  button.onclick = () => input.click();
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    input.disabled = button.disabled = true;
    try {
      if (file.size > 1024 * 1024) throw new Error('DESIGN_IMPORT_TOO_LARGE: Maximum file size is 1 MiB.');
      const text = await file.text(); const candidate = parseNativeDesignImport(text);
      const types = [...new Set(candidate.widgets.map(widget => widget.widgetId))].join(', ');
      const confirmed = await bpDialog.confirm(`${candidate.design.title}: ${candidate.widgets.length} native widget instances (${types || 'none'}). Create a new draft copy for review in Design Studio?`,
        { title: 'Import native design', confirmLabel: 'Create draft copy' });
      if (!confirmed) { status.textContent = 'Import cancelled.'; return; }
      const id = await importNativeDesign(text);
      window.location.assign(designUrl({ id }));
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'DESIGN_IMPORT_FAILED'; }
    finally { input.disabled = button.disabled = false; input.value = ''; }
  });
  group.append(button, input, status); return group;
}
