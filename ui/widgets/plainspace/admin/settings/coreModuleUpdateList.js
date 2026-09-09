const labels = {
    not_checked: 'Not checked yet', checking: 'Checking module package…',
    current: 'Current', available: 'Update available', installing: 'Updating this module…',
    completed: 'Module updated', host_required: 'Requires a Blogposter host update', error: 'Module update failed'
};
export function createCoreModuleUpdateList(mount, install, titleText = 'CMS module updates') {
    const section = document.createElement('section');
    section.className = 'core-module-updates';
    const title = document.createElement('h4');
    title.textContent = titleText;
    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    const checked = document.createElement('p');
    checked.className = 'settings-hint';
    section.append(title, hint, checked);
    mount.append(section);
    const entries = new Map();
    return (rows, disabled, lastCheckedAt) => {
        const complete = rows.length > 0 && rows.every(row => ['current', 'completed', 'available'].includes(row.status));
        hint.textContent = rows.some(row => row.status === 'installing') ? 'Updating…'
            : rows.some(row => row.status === 'checking') ? 'Checking…'
                : rows.some(row => row.available) ? 'Updates available'
                    : rows.some(row => ['error', 'host_required'].includes(row.status)) ? 'Some updates could not be checked'
                        : complete ? 'Up to date' : 'Not checked yet';
        checked.textContent = complete && lastCheckedAt ? `Last checked: ${new Date(lastCheckedAt).toLocaleString()}` : 'Last checked: Not checked yet';
        // This is an update list, not an inventory. Keep in-flight changes visible
        // while polling temporarily clears availability, including a failed install.
        rows = rows.filter(row => row.available || row.status === 'installing' ||
            (row.status === 'error' && Boolean(row.latestVersion) && row.latestVersion !== row.currentVersion));
        section.hidden = false;
        const names = new Set(rows.map(row => row.moduleName));
        for (const [name, entry] of entries)
            if (!names.has(name)) {
                entry.container.remove();
                entries.delete(name);
            }
        for (const row of rows) {
            let entry = entries.get(row.moduleName);
            if (!entry) {
                const container = document.createElement('details');
                container.className = 'core-module-update-row';
                const summary = document.createElement('summary');
                const notes = document.createElement('pre');
                notes.className = 'module-release-notes';
                notes.textContent = row.releaseNotes || 'No module-specific release notes were provided.';
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
                container.append(summary, notes, button);
                section.append(container);
            }
            // Preserve DOM identity and focus while status polling refreshes rows.
            entry.row = row;
            entry.container.querySelector('pre').textContent = row.releaseNotes || 'No module-specific release notes were provided.';
            const name = document.createElement('span');
            name.textContent = row.label || row.moduleName;
            const versions = document.createElement('span');
            versions.className = 'update-versions';
            versions.textContent = `${row.currentVersion} → ${row.latestVersion || 'Pending'}`;
            entry.summary.replaceChildren(name, versions);
            // Release metadata may flag compatibility changes; version numbers alone
            // cannot establish whether a site's custom code is affected.
            if (row.breakingChange === true) {
                const badge = document.createElement('span');
                badge.className = 'module-access-badge module-access-badge--danger';
                badge.textContent = 'Breaking update';
                badge.tabIndex = 0;
                badge.title = 'This update includes breaking changes. Custom code using the affected interfaces may need changes.';
                badge.setAttribute('aria-label', badge.title);
                entry.summary.insertBefore(badge, versions);
            }
            entry.button.title = `${labels[row.status] || row.status}${row.errorCode ? ` (${row.errorCode})` : ''}`;
            entry.container.querySelector('pre').textContent = `${row.releaseNotes || 'No module-specific release notes were provided.'}${row.errorCode ? `\n${row.errorCode}` : ''}`;
            entry.button.textContent = `Update ${row.label || row.moduleName}`;
            entry.button.hidden = !row.available;
            entry.button.disabled = disabled || !row.available || !row.generationId;
        }
    };
}
