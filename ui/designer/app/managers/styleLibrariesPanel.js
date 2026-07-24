import { emitRuntimeAdmin } from '/ui/shared/api-client/runtimeFacade.js';
import { bpDialog } from '/ui/shared/dialogs/bpDialog.js';
import { activateColorScheme, createColorScheme, createLibraryColor, deleteColorScheme, deleteLibraryColor, getActiveColorScheme, getColorLibrarySnapshot, getColorPickerSavedColors, parseLinkedColorValue, renameColorScheme, subscribeColorLibrary, updateLibraryColor } from '/ui/shared/colors/colorLibrary.js';
import { FONT_PACKAGE_ROLES, activateFontPackage, createFontPackage, deleteFontPackage, getFontPackagesSnapshot, renameFontPackage, resetFontPackageRole, subscribeFontPackages, updateFontPackageRole } from '/ui/shared/fonts/fontPackages.js';
const ROLE_LABELS = {
    body: 'Body',
    h1: 'Heading 1',
    h2: 'Heading 2',
    h3: 'Heading 3',
    h4: 'Heading 4',
    h5: 'Heading 5',
    h6: 'Heading 6',
    paragraph: 'Paragraph',
    link: 'Link',
    button: 'Button',
    label: 'Label',
    small: 'Small text',
    blockquote: 'Quote',
    code: 'Code'
};
const SYSTEM_FONT_FAMILIES = [
    'system-ui',
    'sans-serif',
    'serif',
    'monospace'
];
const FIELD_DEFINITIONS = [
    { key: 'fontSize', label: 'Size', type: 'text' },
    { key: 'fontWeight', label: 'Weight', type: 'text' },
    { key: 'lineHeight', label: 'Line height', type: 'text' },
    { key: 'letterSpacing', label: 'Letter spacing', type: 'text' },
    {
        key: 'fontStyle',
        label: 'Style',
        type: 'select',
        options: ['normal', 'italic', 'oblique', 'inherit'].map(value => ({ value, label: value }))
    },
    {
        key: 'textTransform',
        label: 'Case',
        type: 'select',
        options: ['none', 'uppercase', 'lowercase', 'capitalize', 'inherit']
            .map(value => ({ value, label: value }))
    },
    {
        key: 'textDecoration',
        label: 'Decoration',
        type: 'select',
        options: ['none', 'underline', 'line-through', 'inherit']
            .map(value => ({ value, label: value }))
    }
];
function button(label, className) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = label;
    return element;
}
function fieldLabel(text, control) {
    const label = document.createElement('label');
    label.className = 'font-package-field';
    const caption = document.createElement('span');
    caption.textContent = text;
    label.append(caption, control);
    return label;
}
function scopeIntro(text) {
    const intro = document.createElement('p');
    intro.className = 'style-library-intro';
    intro.textContent = text;
    return intro;
}
function setInitialInputValue(input, value) {
    // Dynamic Designer panels can be restored from browser form history after
    // insertion. Keep the editable value and its reset baseline in sync.
    input.autocomplete = 'off';
    input.defaultValue = value;
    input.value = value;
}
function stabilizeMountedInputValue(input, value) {
    setInitialInputValue(input, value);
    window.setTimeout(() => {
        // Chromium may restore the previous control value after the current change
        // event finishes. Disconnected controls belong to a newer panel render.
        if (input.isConnected)
            setInitialInputValue(input, value);
    }, 0);
}
function stabilizeMountedSelectValue(select, value) {
    select.autocomplete = 'off';
    select.value = value;
    window.setTimeout(() => {
        if (select.isConnected)
            select.value = value;
    }, 0);
}
function showError(host, error) {
    const errorNode = host.querySelector('[data-font-package-error]');
    if (!errorNode)
        return;
    errorNode.textContent = error instanceof Error ? error.message : String(error || 'Unable to update font packages.');
    errorNode.classList.remove('hidden');
}
function clearError(host) {
    const errorNode = host.querySelector('[data-font-package-error]');
    if (!errorNode)
        return;
    errorNode.textContent = '';
    errorNode.classList.add('hidden');
}
function mountColorSchemePanel(host) {
    let selectedSchemeId = getColorLibrarySnapshot().activeSchemeId;
    let selectedSlotId = 'default-1';
    const render = () => {
        const library = getColorLibrarySnapshot();
        const scheme = library.schemes.find(entry => entry.id === selectedSchemeId)
            || getActiveColorScheme()
            || library.schemes[0]
            || null;
        host.replaceChildren();
        if (!scheme) {
            const empty = document.createElement('p');
            empty.className = 'style-library-intro';
            empty.textContent = 'No color scheme is available.';
            host.appendChild(empty);
            return;
        }
        selectedSchemeId = scheme.id;
        const selectedSlot = scheme.colors.find(color => color.id === selectedSlotId)
            || scheme.colors[0];
        if (!selectedSlot) {
            const empty = document.createElement('p');
            empty.className = 'style-library-intro';
            empty.textContent = 'This color scheme has no Default slots.';
            host.appendChild(empty);
            return;
        }
        selectedSlotId = selectedSlot.id;
        const schemeBar = document.createElement('div');
        schemeBar.className = 'font-package-bar';
        const schemeSelect = document.createElement('select');
        schemeSelect.className = 'font-package-select';
        schemeSelect.setAttribute('aria-label', 'Color scheme');
        library.schemes.forEach(entry => {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = entry.name;
            option.selected = entry.id === scheme.id;
            schemeSelect.appendChild(option);
        });
        const activeBadge = document.createElement('span');
        activeBadge.className = 'font-package-active';
        activeBadge.textContent = scheme.id === library.activeSchemeId ? 'Active' : 'Draft';
        schemeBar.append(schemeSelect, activeBadge);
        const schemeName = document.createElement('input');
        schemeName.type = 'text';
        schemeName.maxLength = 80;
        setInitialInputValue(schemeName, scheme.name);
        schemeName.setAttribute('aria-label', 'Color scheme name');
        const renameButton = button('Save name', 'font-package-action');
        const activateButton = button(scheme.id === library.activeSchemeId ? 'Scheme active' : 'Use scheme', 'font-package-action font-package-action--primary');
        activateButton.disabled = scheme.id === library.activeSchemeId;
        const deleteSchemeButton = button('Delete', 'font-package-action font-package-action--danger');
        deleteSchemeButton.disabled = library.schemes.length <= 1;
        const schemeActions = document.createElement('div');
        schemeActions.className = 'font-package-actions';
        schemeActions.append(renameButton, activateButton, deleteSchemeButton);
        const createForm = document.createElement('form');
        createForm.className = 'font-package-create';
        const newSchemeName = document.createElement('input');
        newSchemeName.type = 'text';
        newSchemeName.maxLength = 80;
        newSchemeName.placeholder = 'New scheme name';
        newSchemeName.setAttribute('aria-label', 'New color scheme name');
        const createButton = document.createElement('button');
        createButton.type = 'submit';
        createButton.textContent = 'Create copy';
        createForm.append(newSchemeName, createButton);
        const slotSelect = document.createElement('select');
        slotSelect.setAttribute('aria-label', 'Default color slot');
        scheme.colors.forEach((color, index) => {
            const option = document.createElement('option');
            option.value = color.id;
            option.textContent = `Default ${index + 1} · ${color.name}`;
            option.selected = color.id === selectedSlot.id;
            slotSelect.appendChild(option);
        });
        const slotName = document.createElement('input');
        slotName.type = 'text';
        slotName.maxLength = 80;
        setInitialInputValue(slotName, selectedSlot.name);
        slotName.setAttribute('aria-label', 'Default color name');
        const slotValue = document.createElement('input');
        slotValue.type = 'text';
        setInitialInputValue(slotValue, selectedSlot.value);
        slotValue.setAttribute('aria-label', 'Default color value');
        const colorControl = document.createElement('input');
        colorControl.type = 'color';
        setInitialInputValue(colorControl, selectedSlot.value.slice(0, 7));
        colorControl.setAttribute('aria-label', 'Choose default color');
        const colorRow = document.createElement('div');
        colorRow.className = 'color-scheme-value';
        colorRow.append(colorControl, slotValue);
        const saveSlotButton = button('Save default', 'font-package-action font-package-action--primary');
        const addSlotButton = button('Add default', 'font-package-action');
        const deleteSlotButton = button('Remove last', 'font-package-action font-package-action--danger');
        deleteSlotButton.disabled = scheme.colors.length <= 1 || selectedSlot.id !== `default-${scheme.colors.length}`;
        const slotActions = document.createElement('div');
        slotActions.className = 'font-package-actions';
        slotActions.append(saveSlotButton, addSlotButton, deleteSlotButton);
        const errorNode = document.createElement('p');
        errorNode.className = 'font-package-error hidden';
        errorNode.setAttribute('role', 'alert');
        const showColorError = (error) => {
            errorNode.textContent = error instanceof Error ? error.message : String(error || 'Unable to update color scheme.');
            errorNode.classList.remove('hidden');
        };
        host.append(scopeIntro('Global color defaults. Individual elements can still override a color locally.'), schemeBar, fieldLabel('Scheme name', schemeName), schemeActions, createForm, fieldLabel('Default slot', slotSelect), fieldLabel('Name', slotName), fieldLabel('Color', colorRow), slotActions, errorNode);
        // Chromium may restore form-history values when these dynamic controls are
        // inserted. Reapply the selected scheme after insertion so the visible
        // editor and the shared library snapshot cannot diverge.
        stabilizeMountedInputValue(schemeName, scheme.name);
        stabilizeMountedInputValue(slotName, selectedSlot.name);
        stabilizeMountedInputValue(slotValue, selectedSlot.value);
        stabilizeMountedInputValue(colorControl, selectedSlot.value.slice(0, 7));
        stabilizeMountedSelectValue(schemeSelect, scheme.id);
        stabilizeMountedSelectValue(slotSelect, selectedSlot.id);
        schemeSelect.addEventListener('change', () => {
            selectedSchemeId = schemeSelect.value;
            selectedSlotId = 'default-1';
            render();
        });
        slotSelect.addEventListener('change', () => {
            const nextSlot = scheme.colors.find(color => color.id === slotSelect.value);
            if (!nextSlot)
                return;
            selectedSlotId = nextSlot.id;
            // Keep the native select mounted. Replacing it during its own change
            // event lets browsers reapply the new option to a panel rendered with
            // the previous slot, leaving the visible editor out of sync.
            setInitialInputValue(slotName, nextSlot.name);
            setInitialInputValue(slotValue, nextSlot.value);
            setInitialInputValue(colorControl, nextSlot.value.slice(0, 7));
            deleteSlotButton.disabled = scheme.colors.length <= 1
                || nextSlot.id !== `default-${scheme.colors.length}`;
        });
        colorControl.addEventListener('input', () => {
            slotValue.value = colorControl.value.toUpperCase();
        });
        slotValue.addEventListener('input', () => {
            if (/^#[0-9a-f]{6}$/i.test(slotValue.value)) {
                colorControl.value = slotValue.value.slice(0, 7);
            }
        });
        renameButton.addEventListener('click', async () => {
            try {
                await renameColorScheme(scheme.id, schemeName.value);
            }
            catch (error) {
                showColorError(error);
            }
        });
        activateButton.addEventListener('click', async () => {
            try {
                await activateColorScheme(scheme.id);
            }
            catch (error) {
                showColorError(error);
            }
        });
        deleteSchemeButton.addEventListener('click', async () => {
            if (!(await bpDialog.confirm(`Delete color scheme "${scheme.name}"?`)))
                return;
            try {
                await deleteColorScheme(scheme.id);
                selectedSchemeId = getColorLibrarySnapshot().activeSchemeId;
            }
            catch (error) {
                showColorError(error);
            }
        });
        createForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            try {
                const created = await createColorScheme({
                    name: newSchemeName.value,
                    copyFromId: scheme.id
                });
                if (created)
                    selectedSchemeId = created.id;
            }
            catch (error) {
                showColorError(error);
            }
        });
        saveSlotButton.addEventListener('click', async () => {
            try {
                await updateLibraryColor({
                    id: selectedSlot.id,
                    schemeId: scheme.id,
                    name: slotName.value,
                    value: slotValue.value
                });
            }
            catch (error) {
                showColorError(error);
            }
        });
        addSlotButton.addEventListener('click', async () => {
            try {
                const created = await createLibraryColor({
                    schemeId: scheme.id,
                    name: `Color ${scheme.colors.length + 1}`,
                    value: '#000000'
                });
                if (created)
                    selectedSlotId = created.id;
            }
            catch (error) {
                showColorError(error);
            }
        });
        deleteSlotButton.addEventListener('click', async () => {
            try {
                await deleteLibraryColor(selectedSlot.id, scheme.id);
                selectedSlotId = `default-${Math.max(1, scheme.colors.length - 1)}`;
            }
            catch (error) {
                showColorError(error);
            }
        });
    };
    const unsubscribe = subscribeColorLibrary(render);
    render();
    return unsubscribe;
}
async function loadFontCatalog() {
    const emit = window.meltdownEmit;
    if (typeof emit !== 'function')
        return [...SYSTEM_FONT_FAMILIES];
    try {
        const records = await emitRuntimeAdmin(emit, window.ADMIN_TOKEN, 'fonts', 'list');
        const names = (Array.isArray(records) ? records : [])
            .map(record => typeof record?.name === 'string' ? record.name.trim() : '')
            .filter(Boolean);
        return Array.from(new Set([...SYSTEM_FONT_FAMILIES, ...names]));
    }
    catch (error) {
        console.warn('FONT_PACKAGES_CATALOG_LOAD_FAILED: Using system font choices only.', error);
        return [...SYSTEM_FONT_FAMILIES];
    }
}
function setRolePreview(preview, styles) {
    preview.style.fontFamily = styles.fontFamily;
    preview.style.fontSize = styles.fontSize;
    preview.style.fontWeight = styles.fontWeight;
    preview.style.lineHeight = styles.lineHeight;
    preview.style.letterSpacing = styles.letterSpacing;
    preview.style.color = styles.color;
    preview.style.fontStyle = styles.fontStyle;
    preview.style.textTransform = styles.textTransform;
    preview.style.textDecoration = styles.textDecoration;
}
function currentPackage(selectedPackageId) {
    const packages = getFontPackagesSnapshot().packages;
    return packages.find(pkg => pkg.id === selectedPackageId)
        || packages.find(pkg => pkg.id === getFontPackagesSnapshot().activePackageId)
        || packages[0]
        || null;
}
function mountFontPackagesPanel(host) {
    let selectedPackageId = getFontPackagesSnapshot().activePackageId;
    let selectedRole = 'body';
    let fontCatalog = [...SYSTEM_FONT_FAMILIES];
    const render = () => {
        const library = getFontPackagesSnapshot();
        const pkg = currentPackage(selectedPackageId);
        if (!pkg) {
            host.replaceChildren();
            const empty = document.createElement('p');
            empty.className = 'style-library-intro';
            empty.textContent = 'No font package is available.';
            host.appendChild(empty);
            return;
        }
        selectedPackageId = pkg.id;
        host.replaceChildren();
        const packageBar = document.createElement('div');
        packageBar.className = 'font-package-bar';
        const packageSelect = document.createElement('select');
        packageSelect.className = 'font-package-select';
        packageSelect.setAttribute('aria-label', 'Font package');
        library.packages.forEach(entry => {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = entry.name;
            option.selected = entry.id === pkg.id;
            packageSelect.appendChild(option);
        });
        const activeBadge = document.createElement('span');
        activeBadge.className = 'font-package-active';
        activeBadge.textContent = pkg.id === library.activePackageId ? 'Active' : 'Draft';
        packageBar.append(packageSelect, activeBadge);
        const packageName = document.createElement('input');
        packageName.type = 'text';
        packageName.maxLength = 80;
        setInitialInputValue(packageName, pkg.name);
        packageName.setAttribute('aria-label', 'Font package name');
        const renameButton = button('Save name', 'font-package-action');
        const activateButton = button(pkg.id === library.activePackageId ? 'Package active' : 'Use package', 'font-package-action font-package-action--primary');
        activateButton.disabled = pkg.id === library.activePackageId;
        const deleteButton = button('Delete', 'font-package-action font-package-action--danger');
        deleteButton.disabled = library.packages.length <= 1;
        const packageActions = document.createElement('div');
        packageActions.className = 'font-package-actions';
        packageActions.append(renameButton, activateButton, deleteButton);
        const newPackageForm = document.createElement('form');
        newPackageForm.className = 'font-package-create';
        const newPackageName = document.createElement('input');
        newPackageName.type = 'text';
        newPackageName.maxLength = 80;
        newPackageName.placeholder = 'New package name';
        newPackageName.setAttribute('aria-label', 'New font package name');
        const createButton = document.createElement('button');
        createButton.type = 'submit';
        createButton.textContent = 'Create copy';
        newPackageForm.append(newPackageName, createButton);
        const roleSelect = document.createElement('select');
        roleSelect.className = 'font-package-role-select';
        roleSelect.setAttribute('aria-label', 'Typography role');
        FONT_PACKAGE_ROLES.forEach((role, index) => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = `Default ${index + 1} · ${ROLE_LABELS[role]}`;
            option.selected = role === selectedRole;
            roleSelect.appendChild(option);
        });
        const editor = document.createElement('div');
        editor.className = 'font-package-editor';
        const roleStyles = { ...pkg.roles[selectedRole] };
        const controls = new Map();
        const familySelect = document.createElement('select');
        familySelect.setAttribute('aria-label', 'Font family');
        // Put the stored role family first. Chromium can restore a dynamic select
        // to its first option after insertion; the package default must remain the
        // safe fallback while "Inherit from parent" stays available explicitly.
        const familyChoices = Array.from(new Set([roleStyles.fontFamily, 'inherit', ...fontCatalog]));
        familyChoices.forEach(family => {
            const option = document.createElement('option');
            option.value = family;
            option.textContent = family === 'inherit' ? 'Inherit from parent' : family;
            option.selected = family === roleStyles.fontFamily;
            option.style.fontFamily = family;
            familySelect.appendChild(option);
        });
        controls.set('fontFamily', familySelect);
        const colorSelect = document.createElement('select');
        colorSelect.setAttribute('aria-label', 'Role color source');
        const literalOption = document.createElement('option');
        literalOption.value = 'literal';
        literalOption.textContent = 'Custom color';
        colorSelect.appendChild(literalOption);
        const linked = parseLinkedColorValue(roleStyles.color);
        getColorPickerSavedColors().forEach(color => {
            const option = document.createElement('option');
            option.value = color.id;
            option.textContent = color.name;
            option.dataset.cssValue = color.cssValue;
            option.selected = color.id === linked?.id;
            colorSelect.appendChild(option);
        });
        if (!linked)
            literalOption.selected = true;
        const colorInput = document.createElement('input');
        colorInput.type = 'text';
        setInitialInputValue(colorInput, roleStyles.color);
        colorInput.setAttribute('aria-label', 'Role color');
        colorInput.disabled = Boolean(linked);
        controls.set('color', colorInput);
        editor.append(fieldLabel('Font family', familySelect), fieldLabel('Color source', colorSelect), fieldLabel('Color', colorInput));
        FIELD_DEFINITIONS.forEach(definition => {
            const control = definition.type === 'select'
                ? document.createElement('select')
                : document.createElement('input');
            if (control instanceof HTMLInputElement) {
                control.type = 'text';
                setInitialInputValue(control, roleStyles[definition.key]);
            }
            else {
                definition.options?.forEach(entry => {
                    const option = document.createElement('option');
                    option.value = entry.value;
                    option.textContent = entry.label;
                    option.selected = entry.value === roleStyles[definition.key];
                    control.appendChild(option);
                });
            }
            control.setAttribute('aria-label', definition.label);
            controls.set(definition.key, control);
            editor.appendChild(fieldLabel(definition.label, control));
        });
        const preview = document.createElement('div');
        preview.className = 'font-package-preview';
        preview.textContent = selectedRole.startsWith('h')
            ? `${ROLE_LABELS[selectedRole]} preview`
            : 'The quick brown fox jumps over the lazy dog.';
        setRolePreview(preview, roleStyles);
        const saveRoleButton = button('Save role', 'font-package-action font-package-action--primary');
        const resetRoleButton = button('Reset role', 'font-package-action');
        const roleActions = document.createElement('div');
        roleActions.className = 'font-package-actions';
        roleActions.append(saveRoleButton, resetRoleButton);
        const errorNode = document.createElement('p');
        errorNode.className = 'font-package-error hidden';
        errorNode.dataset.fontPackageError = 'true';
        errorNode.setAttribute('role', 'alert');
        host.append(scopeIntro('Global typography defaults. Text set to Default follows the selected role.'), packageBar, fieldLabel('Package name', packageName), packageActions, newPackageForm, fieldLabel('Text role', roleSelect), editor, preview, roleActions, errorNode);
        // As with Color Schemes, form restoration happens at insertion time in
        // Chromium. The active package role must win over those stale values.
        stabilizeMountedInputValue(packageName, pkg.name);
        controls.forEach((control, key) => {
            if (control instanceof HTMLInputElement) {
                stabilizeMountedInputValue(control, roleStyles[key]);
            }
            else {
                stabilizeMountedSelectValue(control, roleStyles[key]);
            }
        });
        stabilizeMountedSelectValue(packageSelect, pkg.id);
        stabilizeMountedSelectValue(roleSelect, selectedRole);
        stabilizeMountedSelectValue(familySelect, roleStyles.fontFamily);
        stabilizeMountedSelectValue(colorSelect, linked?.id || 'literal');
        const readFormStyles = () => Object.fromEntries(Array.from(controls.entries()).map(([key, control]) => [key, control.value]));
        const updatePreview = () => {
            const previewStyles = readFormStyles();
            const selectedColor = colorSelect.selectedOptions[0]?.dataset.cssValue;
            if (selectedColor)
                previewStyles.color = selectedColor;
            setRolePreview(preview, previewStyles);
        };
        packageSelect.addEventListener('change', () => {
            selectedPackageId = packageSelect.value;
            render();
        });
        roleSelect.addEventListener('change', () => {
            const nextRole = roleSelect.value;
            const nextStyles = pkg.roles[nextRole];
            if (!nextStyles)
                return;
            selectedRole = nextRole;
            // A role switch updates the current editor in place for the same reason
            // as Color Scheme slots: the native select remains the source of truth
            // throughout its change event instead of being replaced mid-event.
            controls.forEach((control, key) => {
                const nextValue = nextStyles[key];
                if (control instanceof HTMLInputElement) {
                    setInitialInputValue(control, nextValue);
                    return;
                }
                if (!Array.from(control.options).some(option => option.value === nextValue)) {
                    const option = document.createElement('option');
                    option.value = nextValue;
                    option.textContent = nextValue;
                    control.appendChild(option);
                }
                control.value = nextValue;
            });
            const nextLinkedColor = parseLinkedColorValue(nextStyles.color);
            colorSelect.value = nextLinkedColor?.id || 'literal';
            colorInput.disabled = Boolean(nextLinkedColor);
            preview.textContent = selectedRole.startsWith('h')
                ? `${ROLE_LABELS[selectedRole]} preview`
                : 'The quick brown fox jumps over the lazy dog.';
            setRolePreview(preview, nextStyles);
        });
        colorSelect.addEventListener('change', () => {
            const selectedCssValue = colorSelect.selectedOptions[0]?.dataset.cssValue;
            colorInput.disabled = Boolean(selectedCssValue);
            if (selectedCssValue)
                colorInput.value = selectedCssValue;
            else if (parseLinkedColorValue(colorInput.value))
                colorInput.value = '#111827';
            updatePreview();
        });
        controls.forEach(control => {
            control.addEventListener('input', updatePreview);
            control.addEventListener('change', updatePreview);
        });
        renameButton.addEventListener('click', async () => {
            clearError(host);
            renameButton.disabled = true;
            try {
                await renameFontPackage(pkg.id, packageName.value);
            }
            catch (error) {
                showError(host, error);
            }
            finally {
                renameButton.disabled = false;
            }
        });
        activateButton.addEventListener('click', async () => {
            clearError(host);
            activateButton.disabled = true;
            try {
                await activateFontPackage(pkg.id);
            }
            catch (error) {
                showError(host, error);
                activateButton.disabled = false;
            }
        });
        deleteButton.addEventListener('click', async () => {
            if (!(await bpDialog.confirm(`Delete font package "${pkg.name}"?`)))
                return;
            clearError(host);
            deleteButton.disabled = true;
            try {
                await deleteFontPackage(pkg.id);
                selectedPackageId = getFontPackagesSnapshot().activePackageId;
            }
            catch (error) {
                showError(host, error);
                deleteButton.disabled = false;
            }
        });
        newPackageForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearError(host);
            createButton.disabled = true;
            try {
                const created = await createFontPackage({
                    name: newPackageName.value,
                    copyFromId: pkg.id
                });
                if (created)
                    selectedPackageId = created.id;
            }
            catch (error) {
                showError(host, error);
                createButton.disabled = false;
            }
        });
        saveRoleButton.addEventListener('click', async () => {
            clearError(host);
            saveRoleButton.disabled = true;
            const settings = readFormStyles();
            const selectedColor = colorSelect.selectedOptions[0]?.dataset.cssValue;
            if (selectedColor)
                settings.color = selectedColor;
            try {
                await updateFontPackageRole({
                    id: pkg.id,
                    role: selectedRole,
                    settings
                });
            }
            catch (error) {
                showError(host, error);
                saveRoleButton.disabled = false;
            }
        });
        resetRoleButton.addEventListener('click', async () => {
            clearError(host);
            resetRoleButton.disabled = true;
            try {
                await resetFontPackageRole(pkg.id, selectedRole);
            }
            catch (error) {
                showError(host, error);
                resetRoleButton.disabled = false;
            }
        });
    };
    const unsubscribePackages = subscribeFontPackages(render);
    const unsubscribeColors = subscribeColorLibrary(render);
    void loadFontCatalog().then(fonts => {
        fontCatalog = fonts;
        render();
    });
    render();
    return () => {
        unsubscribePackages();
        unsubscribeColors();
    };
}
export function initStyleLibrariesPanel(sidebar) {
    const colorHost = sidebar.querySelector('[data-color-scheme-host]');
    const fontHost = sidebar.querySelector('[data-font-packages-host]');
    const cleanups = [];
    if (colorHost)
        cleanups.push(mountColorSchemePanel(colorHost));
    if (fontHost)
        cleanups.push(mountFontPackagesPanel(fontHost));
    return () => cleanups.forEach(cleanup => cleanup());
}
