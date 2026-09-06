const PRIORITIES = {
    critical: { label: 'Error', icon: 'circle-x' },
    error: { label: 'Error', icon: 'circle-x' },
    warning: { label: 'Warning', icon: 'triangle-alert' },
    success: { label: 'Success', icon: 'circle-check' },
    info: { label: 'Info', icon: 'info' }
};
/** Presentation only: the recent-notifications facade remains the history owner. */
export function renderNotificationItems(list, items) {
    const fragment = document.createDocumentFragment();
    for (const item of items) {
        const priority = Object.hasOwn(PRIORITIES, item.priority || '') ? item.priority : 'info';
        const tone = PRIORITIES[priority];
        const row = document.createElement('li');
        row.className = `notification-hub__item priority-${priority}`;
        const symbol = document.createElement('span');
        symbol.className = 'notification-hub__symbol';
        const icon = document.createElement('img');
        icon.src = `/assets/icons/${tone.icon}.svg`;
        icon.alt = tone.label;
        symbol.appendChild(icon);
        const content = document.createElement('div');
        content.className = 'notification-hub__content';
        const meta = document.createElement('div');
        meta.className = 'notification-hub__meta';
        const source = document.createElement('strong');
        source.textContent = item.moduleName || 'Blogposter';
        meta.appendChild(source);
        const date = item.timestamp == null ? null : new Date(item.timestamp);
        if (date && Number.isFinite(date.getTime())) {
            const time = document.createElement('time');
            time.dateTime = date.toISOString();
            time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            time.title = date.toLocaleString();
            time.setAttribute('aria-label', time.title);
            meta.appendChild(time);
        }
        const message = document.createElement('p');
        message.className = 'notification-hub__message';
        message.textContent = item.message || 'System notification';
        content.append(meta, message);
        // Keep the existing destination allowlist; notification text cannot add links.
        if (item.actionPath === '/admin/settings/updates') {
            const action = document.createElement('a');
            action.className = 'notification-hub__link';
            action.href = item.actionPath;
            action.textContent = item.actionLabel || 'View update';
            content.appendChild(action);
        }
        row.append(symbol, content);
        fragment.appendChild(row);
    }
    list.replaceChildren(fragment);
}
