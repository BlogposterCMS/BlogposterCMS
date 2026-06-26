import { errorMessage, fetchLoginStrategies, setLoginStrategyEnabled } from './loginStrategiesData.js';
function icon(name) {
    return typeof window.featherIcon === 'function' ? window.featherIcon(name) : '';
}
export async function render(el) {
    const jwt = window.ADMIN_TOKEN;
    const meltdownEmit = window.meltdownEmit;
    if (!el)
        return;
    try {
        if (typeof meltdownEmit !== 'function')
            throw new Error('meltdownEmit unavailable');
        const strategies = await fetchLoginStrategies(meltdownEmit, jwt);
        const card = document.createElement('div');
        card.className = 'login-strategies-card page-list-card';
        const titleBar = document.createElement('div');
        titleBar.className = 'login-strategy-title-bar page-title-bar';
        const title = document.createElement('div');
        title.className = 'login-strategy-title page-title';
        title.textContent = 'Login Strategies';
        titleBar.appendChild(title);
        card.appendChild(titleBar);
        const list = document.createElement('ul');
        list.className = 'login-strategies-list';
        if (!strategies.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No strategies found.';
            list.appendChild(empty);
        }
        else {
            strategies.forEach(strategy => {
                const li = document.createElement('li');
                const nameRow = document.createElement('div');
                nameRow.className = 'login-strategy-name-row';
                const nameEl = document.createElement('span');
                nameEl.className = 'login-strategy-name';
                nameEl.textContent = strategy.name;
                const scopeEl = document.createElement('span');
                scopeEl.className = 'login-strategy-scope';
                scopeEl.textContent = `(${strategy.scope || 'admin'})`;
                const actions = document.createElement('span');
                actions.className = 'login-strategy-actions page-actions';
                const toggleIcon = document.createElement('span');
                toggleIcon.className = 'icon toggle-strategy';
                toggleIcon.innerHTML = icon(strategy.isEnabled ? 'toggle-right' : 'toggle-left');
                toggleIcon.title = strategy.isEnabled ? 'Disable' : 'Enable';
                toggleIcon.addEventListener('click', async () => {
                    try {
                        await setLoginStrategyEnabled(meltdownEmit, jwt, strategy.name, !strategy.isEnabled);
                        strategy.isEnabled = !strategy.isEnabled;
                        toggleIcon.innerHTML = icon(strategy.isEnabled ? 'toggle-right' : 'toggle-left');
                        toggleIcon.title = strategy.isEnabled ? 'Disable' : 'Enable';
                    }
                    catch (err) {
                        alert(`Error: ${errorMessage(err)}`);
                    }
                });
                const editIcon = document.createElement('span');
                editIcon.className = 'icon edit-strategy';
                editIcon.innerHTML = icon('edit');
                editIcon.title = 'Edit strategy';
                editIcon.addEventListener('click', () => {
                    window.location.href = `/admin/settings/login/edit?strategy=${encodeURIComponent(strategy.name)}`;
                });
                actions.appendChild(toggleIcon);
                actions.appendChild(editIcon);
                nameRow.appendChild(nameEl);
                nameRow.appendChild(scopeEl);
                nameRow.appendChild(actions);
                const desc = document.createElement('div');
                desc.className = 'login-strategy-desc';
                desc.textContent = strategy.description || '';
                li.appendChild(nameRow);
                li.appendChild(desc);
                list.appendChild(li);
            });
        }
        card.appendChild(list);
        el.innerHTML = '';
        el.appendChild(card);
    }
    catch (err) {
        el.innerHTML = `<div class="error">Failed to load strategies: ${errorMessage(err)}</div>`;
    }
}
