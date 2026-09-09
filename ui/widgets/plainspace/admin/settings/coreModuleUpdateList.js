const labels = {
    not_checked: 'Not checked yet', checking: 'Checking module package…',
    current: 'Current', available: 'Update available', installing: 'Updating this module…',
    completed: 'Module updated', host_required: 'Requires a Blogposter host update', error: 'Module update failed'
};
export function createCoreModuleUpdateList(mount, install) {
    const section = document.createElement('section');
    const title = document.createElement('h4');
    title.textContent = 'CMS module updates';
    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = 'These updates briefly pause only the selected module. Blogposter keeps running.';
    section.append(title, hint);
    mount.append(section);
    const entries = new Map();
    return (rows, disabled) => {
        section.hidden = rows.length === 0;
        const names = new Set(rows.map(row => row.moduleName));
        for (const [name, entry] of entries)
            if (!names.has(name)) {
                entry.container.remove();
                entries.delete(name);
            }
        for (const row of rows) {
            let entry = entries.get(row.moduleName);
            if (!entry) {
                const container = document.createElement('div');
                const summary = document.createElement('p');
                summary.setAttribute('role', 'status');
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'button ghost sm';
                entry = { container, summary, button, row };
                entries.set(row.moduleName, entry);
                button.addEventListener('click', () => {
                    const current = entries.get(row.moduleName);
                    if (current && !current.button.disabled)
                        install(current.row);
                });
                container.append(summary, button);
                section.append(container);
            }
            // Preserve DOM identity and focus while status polling refreshes rows.
            entry.row = row;
            entry.summary.textContent = `${row.moduleName} · ${row.currentVersion}${row.latestVersion && row.latestVersion !== row.currentVersion ? ` → ${row.latestVersion}` : ''} · ${labels[row.status] || row.status}${row.errorCode ? ` (${row.errorCode})` : ''}`;
            entry.button.textContent = `Update ${row.moduleName}`;
            entry.button.hidden = !row.available;
            entry.button.disabled = disabled || !row.available || !row.generationId;
        }
    };
}
