/** Image previews share the existing media picker and settings inputs. */
export function createBrandingFields(values, pick, reportError) {
    const root = document.createElement('div');
    root.className = 'branding-fields';
    const fields = {};
    const redraw = [];
    for (const [key, label] of [['logoUrl', 'Logo (light / default)'], ['logoDarkUrl', 'Logo (dark)'], ['faviconUrl', 'Favicon']]) {
        const section = document.createElement('section');
        section.className = `branding-image branding-image--${key}`;
        const title = document.createElement('h4');
        title.textContent = label;
        const preview = document.createElement('div');
        preview.className = 'branding-image__preview';
        const image = document.createElement('img');
        image.alt = `${label} preview`;
        const placeholder = document.createElement('span');
        preview.append(image, placeholder);
        const input = document.createElement('input');
        input.type = 'text';
        input.value = values[key] || '';
        input.setAttribute('aria-label', `${label} URL`);
        fields[key] = input;
        const urlArea = document.createElement('details');
        urlArea.className = 'branding-image__url';
        const urlToggle = document.createElement('summary');
        urlToggle.textContent = 'Add via URL';
        urlArea.append(urlToggle, input);
        const actions = document.createElement('div');
        actions.className = 'branding-image__actions';
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'button ghost sm';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'icon-button';
        remove.setAttribute('aria-label', `Remove ${label}`);
        remove.title = `Remove ${label}`;
        remove.innerHTML = '<img src="/assets/icons/trash-2.svg" alt="" width="16" height="16">';
        const update = () => {
            const own = input.value.trim();
            const source = own || (key === 'logoDarkUrl' ? (fields.logoUrl?.value.trim() || '') : '');
            // Preview only image URLs; markup and arbitrary URI schemes stay inert.
            const safe = /^(https?:\/\/|\/(?!\/))/.test(source);
            image.hidden = !safe;
            if (safe)
                image.src = source;
            else
                image.removeAttribute('src');
            placeholder.textContent = source ? (safe ? '' : 'Preview unavailable') : key === 'faviconUrl' ? '—' : 'No image selected';
            choose.textContent = own ? 'Change image' : 'Choose image';
            remove.hidden = !own;
            note.textContent = key === 'logoDarkUrl' && !own ? 'Uses the light logo' : key === 'faviconUrl' ? 'Shown in browser tabs.' : '';
        };
        const note = document.createElement('p');
        note.className = 'settings-hint';
        image.addEventListener('error', () => { image.hidden = true; placeholder.textContent = 'Preview unavailable'; });
        redraw.push(update);
        input.addEventListener('input', () => redraw.forEach(fn => fn()));
        input.addEventListener('change', () => redraw.forEach(fn => fn()));
        choose.addEventListener('click', async () => {
            choose.disabled = true;
            try {
                const url = await pick();
                if (url) {
                    input.value = url;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
            catch (error) {
                reportError(`SETTINGS_BRANDING_MEDIA_FAILED: ${error instanceof Error ? error.message : 'Unable to open media picker'}`);
            }
            finally {
                choose.disabled = false;
            }
        });
        remove.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); });
        actions.append(choose, remove);
        section.append(title, preview, note, actions, urlArea);
        root.append(section);
    }
    redraw.forEach(fn => fn());
    return { root, fields };
}
