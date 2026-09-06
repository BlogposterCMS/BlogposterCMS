import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';
import { designUrl } from './designerLayoutsData.js';
/** The gallery starts imports through the existing Runtime Manager / Importer boundary. */
export function createHtmlImportControl() {
    const group = document.createElement('span');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary small';
    button.textContent = 'Import HTML capture';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'button small';
    apply.textContent = 'Create editable draft';
    apply.hidden = true;
    apply.style.display = 'none';
    apply.disabled = true;
    let capture;
    let requestVersion = 0;
    button.addEventListener('click', () => input.click());
    async function run(dryRun) {
        if (typeof window.meltdownEmit !== 'function')
            throw new Error('HTML_IMPORT_BRIDGE_MISSING');
        return emitRuntimeAdmin(window.meltdownEmit, window.ADMIN_TOKEN, 'importers', 'run', {
            importerName: 'htmlPage', options: { capture, dryRun }
        }, 60000);
    }
    input.addEventListener('change', async () => {
        const version = ++requestVersion;
        apply.hidden = true;
        apply.style.display = 'none';
        apply.disabled = true;
        const file = input.files?.[0];
        if (!file)
            return;
        status.textContent = 'Checking HTML capture…';
        try {
            if (file.size > 8 * 1024 * 1024)
                throw new Error('HTML_IMPORT_LIMIT_EXCEEDED: Maximum file size is 8 MB.');
            const parsed = JSON.parse(await file.text());
            if (version !== requestVersion)
                return;
            capture = parsed;
            const result = await run(true);
            if (version !== requestVersion)
                return;
            const summary = result.plan.summary;
            const codes = [...new Set(summary.warnings.map(w => String(w.code)))];
            status.textContent = `${summary.sections || 1} sections, ${summary.containers || 0} containers. ${summary.editableWidgets} editable elements, ${summary.decorations} backgrounds. Measured widths: ${summary.capturedWidths.join(', ')}px. ${codes.join('; ')}`;
            apply.hidden = false;
            apply.style.display = '';
            apply.disabled = false;
        }
        catch (error) {
            if (version === requestVersion)
                status.textContent = `HTML_IMPORT_FAILED: ${error instanceof Error ? error.message : String(error)}`;
        }
    });
    apply.addEventListener('click', async () => {
        apply.disabled = button.disabled = true;
        try {
            const result = await run(false);
            const id = result.result?.id || result.result?.designId;
            if (!id)
                throw new Error('HTML_IMPORT_SAVE_RESULT_INVALID');
            window.location.assign(designUrl({ id }));
        }
        catch (error) {
            status.textContent = `HTML_IMPORT_FAILED: ${error instanceof Error ? error.message : String(error)}`;
            apply.disabled = button.disabled = false;
        }
    });
    group.append(button, input, status, apply);
    return group;
}
