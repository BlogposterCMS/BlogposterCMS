import { createFormField } from '../forms/formField.js';
/** Keep image selection in the existing media explorer and the caller's draft. */
export function createImageField(label, input, options) {
    const root = createFormField(label, input, { hint: options.hint });
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'button secondary sm';
    choose.textContent = 'Choose from file manager';
    choose.setAttribute('aria-label', `Choose from file manager: ${label}`);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button ghost sm';
    remove.textContent = 'Remove image';
    remove.setAttribute('aria-label', `Remove ${label.toLowerCase()}`);
    const preview = document.createElement('img');
    preview.alt = `${label} preview`;
    preview.style.cssText = 'max-width:100%;width:240px;max-height:160px;object-fit:contain;';
    const status = document.createElement('p');
    status.className = 'form-field__hint';
    status.setAttribute('role', 'status');
    const refresh = () => {
        const value = input.value.trim() || options.fallback?.() || '';
        // Match public image URL schemes; never execute markup or data URLs.
        const safe = /^(https?:\/\/|\/(?!\/))/i.test(value) && !/[\s\\\x00-\x1f]/.test(value);
        preview.hidden = !safe;
        if (safe)
            preview.src = value;
        else
            preview.removeAttribute('src');
        status.textContent = value ? (safe ? '' : 'IMAGE_PREVIEW_UNAVAILABLE: Use a public image URL.') : 'No image selected.';
        remove.disabled = !input.value.trim();
    };
    preview.addEventListener('error', () => {
        preview.hidden = true;
        status.textContent = 'IMAGE_PREVIEW_UNAVAILABLE: The image could not be loaded.';
    });
    input.addEventListener('input', refresh);
    input.addEventListener('change', refresh);
    choose.addEventListener('click', async () => {
        choose.disabled = true;
        try {
            if (!options.emit)
                throw new Error('Media explorer unavailable');
            const picked = await options.emit('openMediaExplorer', { jwt: options.jwt, publicUrlOnly: true });
            if (picked && !picked.cancelled && typeof picked.shareURL === 'string') {
                input.value = picked.shareURL;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
        catch (error) {
            options.reportError(`IMAGE_PICKER_FAILED: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            choose.disabled = false;
        }
    });
    remove.addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // File selection is the primary input; keep it visible before the optional URL.
    actions.append(choose, remove);
    root.insertBefore(actions, input);
    input.placeholder = 'Or enter a public image URL';
    root.append(preview, status);
    refresh();
    return { root, refresh };
}
