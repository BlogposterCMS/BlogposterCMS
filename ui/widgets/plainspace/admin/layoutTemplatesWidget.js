import { buildTemplateViews, createBlankLayoutTemplate, errorMessage, fetchLayoutTemplateNames, fetchPublicPages } from './layoutTemplatesData.js';
function icon(name, className) {
    return typeof window.featherIcon === 'function' ? window.featherIcon(name, className) : '';
}
export async function render(el) {
    const jwt = window.ADMIN_TOKEN;
    const meltdownEmit = window.meltdownEmit;
    if (!el)
        return;
    if (typeof meltdownEmit !== 'function') {
        el.textContent = 'Unable to load layouts without an admin session.';
        return;
    }
    let templateNames = [];
    let pages = [];
    try {
        templateNames = await fetchLayoutTemplateNames(meltdownEmit, jwt);
    }
    catch (err) {
        console.warn('[LayoutsWidget] failed to load template names', err);
    }
    try {
        pages = await fetchPublicPages(meltdownEmit, jwt);
    }
    catch (err) {
        console.warn('[LayoutsWidget] failed to load pages', err);
    }
    let templates = buildTemplateViews(templateNames, pages);
    let currentFilter = 'all';
    let currentSort = 'name';
    const card = document.createElement('div');
    card.className = 'layout-list-card';
    const titleBar = document.createElement('div');
    titleBar.className = 'layout-title-bar';
    const title = document.createElement('div');
    title.className = 'layout-title';
    title.textContent = 'Layouts';
    const addBtn = document.createElement('img');
    addBtn.src = '/assets/icons/plus.svg';
    addBtn.alt = 'Add layout';
    addBtn.title = 'Add new layout';
    addBtn.className = 'icon add-layout-btn';
    addBtn.addEventListener('click', async () => {
        const layoutName = prompt('New layout name:');
        if (!layoutName)
            return;
        const previewPath = prompt('Preview image path (optional):') || '';
        try {
            await createBlankLayoutTemplate(meltdownEmit, jwt, layoutName, previewPath);
            templateNames = await fetchLayoutTemplateNames(meltdownEmit, jwt);
            templates = buildTemplateViews(templateNames, pages);
            renderList();
        }
        catch (err) {
            alert(`Error: ${errorMessage(err)}`);
        }
    });
    titleBar.appendChild(title);
    titleBar.appendChild(addBtn);
    card.appendChild(titleBar);
    const tabsWrap = document.createElement('div');
    tabsWrap.className = 'layout-tabs-wrap';
    const filterNav = document.createElement('nav');
    filterNav.className = 'layout-filters';
    ['all', 'used', 'unused'].forEach((filter, idx) => {
        const span = document.createElement('span');
        span.textContent = filter === 'used' ? 'In use' : filter === 'unused' ? 'Unused' : 'All';
        span.className = 'filter' + (idx === 0 ? ' active' : '');
        span.onclick = () => {
            filterNav.querySelectorAll('.filter').forEach(item => item.classList.remove('active'));
            span.classList.add('active');
            currentFilter = filter;
            renderList();
        };
        filterNav.appendChild(span);
    });
    tabsWrap.appendChild(filterNav);
    const sortSelect = document.createElement('select');
    sortSelect.className = 'layout-sort';
    sortSelect.innerHTML = '<option value="name">A-Z</option><option value="date">Date</option>';
    sortSelect.onchange = () => {
        currentSort = sortSelect.value;
        renderList();
    };
    tabsWrap.appendChild(sortSelect);
    card.appendChild(tabsWrap);
    const list = document.createElement('ul');
    list.className = 'layout-list';
    card.appendChild(list);
    function renderList() {
        list.innerHTML = '';
        let arr = templates.slice();
        if (currentSort === 'name') {
            arr.sort((a, b) => a.name.localeCompare(b.name));
        }
        if (currentFilter === 'used') {
            arr = arr.filter(template => template.usedPages.length);
        }
        else if (currentFilter === 'unused') {
            arr = arr.filter(template => !template.usedPages.length);
        }
        if (!arr.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No layouts found.';
            list.appendChild(empty);
            return;
        }
        arr.forEach(template => {
            const li = document.createElement('li');
            const item = document.createElement('div');
            item.className = 'layout-item';
            const img = document.createElement('img');
            img.className = 'layout-preview';
            img.alt = template.name + ' preview';
            img.src = template.previewPath || '/assets/icons/file.svg';
            const details = document.createElement('div');
            details.className = 'layout-details';
            const row = document.createElement('div');
            row.className = 'layout-name-row';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'layout-name';
            nameSpan.textContent = template.name;
            const actionsSpan = document.createElement('span');
            actionsSpan.className = 'layout-actions';
            actionsSpan.innerHTML =
                icon('edit', 'edit-layout') +
                    icon('copy', 'duplicate-layout') +
                    icon('trash', 'delete-layout');
            row.appendChild(nameSpan);
            row.appendChild(actionsSpan);
            const usageDiv = document.createElement('div');
            usageDiv.className = 'layout-usage';
            const usage = template.usedPages.length === 1
                ? `Used by ${template.usedPages[0]}`
                : template.usedPages.length > 1
                    ? 'Multiple pages use it'
                    : 'Not used';
            usageDiv.textContent = usage;
            details.appendChild(row);
            details.appendChild(usageDiv);
            item.appendChild(img);
            item.appendChild(details);
            li.appendChild(item);
            list.appendChild(li);
        });
    }
    renderList();
    el.innerHTML = '';
    el.appendChild(card);
}
