import { addDashboardWidget } from './widgetPanelAddWidget.js';
export function getAvailableWidgetDefinitions(input = window.availableWidgets) {
    return Array.isArray(input)
        ? input.filter((item) => (Boolean(item) &&
            typeof item === 'object' &&
            typeof item.id === 'string' &&
            item.metadata?.hiddenFromCatalog !== true))
        : [];
}
export function groupWidgetsByCategory(widgets) {
    const categories = {};
    widgets.forEach(def => {
        const cat = def.metadata?.category || 'Other';
        (categories[cat] ||= []).push(def);
    });
    return categories;
}
function createWidgetCard(def) {
    const label = def.metadata?.label || def.id;
    const card = document.createElement('div');
    card.className = 'widget-card';
    card.draggable = true;
    if (def.metadata?.icon) {
        const img = document.createElement('img');
        img.src = def.metadata.icon;
        img.className = 'icon';
        img.alt = '';
        card.appendChild(img);
    }
    const span = document.createElement('span');
    span.textContent = label;
    card.appendChild(span);
    card.addEventListener('click', () => {
        void addDashboardWidget(def);
    });
    card.addEventListener('dragstart', ev => {
        window.__dashboardDraggingWidgetId = def.id;
        ev.dataTransfer?.setData('text/plain', def.id);
        if (ev.dataTransfer)
            ev.dataTransfer.effectAllowed = 'copy';
    });
    card.addEventListener('dragend', () => {
        if (window.__dashboardDraggingWidgetId === def.id) {
            delete window.__dashboardDraggingWidgetId;
        }
    });
    return card;
}
function renderWidgetCategory(container, category, widgets, term) {
    const section = document.createElement('div');
    section.className = 'widgets-category';
    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = category;
    section.appendChild(title);
    const list = document.createElement('div');
    list.className = 'widgets-list';
    widgets.forEach(def => {
        const label = def.metadata?.label || def.id;
        if (term && !label.toLowerCase().includes(term))
            return;
        list.appendChild(createWidgetCard(def));
    });
    if (list.children.length) {
        section.appendChild(list);
        container.appendChild(section);
    }
}
function renderWidgetCategories(container, categories, term) {
    container.innerHTML = '';
    Object.keys(categories).sort().forEach(category => {
        renderWidgetCategory(container, category, categories[category] || [], term);
    });
}
export function bindWidgetPanelCatalog(panel) {
    const container = panel.querySelector('.widgets-categories');
    const searchInput = panel.querySelector('.widgets-search');
    if (!container || !searchInput)
        return;
    const categories = groupWidgetsByCategory(getAvailableWidgetDefinitions());
    const render = () => {
        renderWidgetCategories(container, categories, searchInput.value.toLowerCase());
    };
    searchInput.addEventListener('input', render);
    render();
}
