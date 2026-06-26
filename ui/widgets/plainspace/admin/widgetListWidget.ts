import {
  fetchGlobalWidgetIds,
  fetchWidgetRegistry,
  getWidgetTemplates,
  type WidgetDefinition,
  type WidgetMetadata,
  type WidgetTemplate
} from './widgetListData.js';

const ICON_MAP: Record<string, string> = {
  systemInfo: 'info',
  activityLog: 'list',
  pageEditor: 'file-text',
  mediaExplorer: 'folder',
  pageList: 'list',
  pageStats: 'bar-chart-2',
  pageEditorWidget: 'file-text',
  contentSummary: 'activity',
  textBox: 'type'
};

function getIcon(id: string, meta?: WidgetMetadata): string {
  const name = meta?.icon || ICON_MAP[id] || id;
  return typeof window.featherIcon === 'function'
    ? window.featherIcon(name)
    : `<img src="/assets/icons/${name}.svg" alt="${name}" />`;
}

export async function render(el: HTMLElement | null): Promise<void> {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN;
  if (!el) return;

  let widgets: WidgetDefinition[] = [];
  try {
    widgets = await fetchWidgetRegistry(meltdownEmit, jwt);
  } catch (err) {
    console.error('[widgetList] registry error', err);
  }

  let globalIds = new Set<string>();
  try {
    globalIds = await fetchGlobalWidgetIds(meltdownEmit, jwt);
  } catch (err) {
    console.error('[widgetList] global fetch error', err);
  }

  function buildList(list: HTMLElement, ids: string[]): void {
    if (!ids.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No widgets found.';
      list.appendChild(empty);
      return;
    }
    ids.forEach(id => {
      const def = widgets.find(widget => widget.id === id) || { id, metadata: { label: id } };
      const li = document.createElement('li');
      li.innerHTML = `${getIcon(def.id, def.metadata)}<span class="widget-name">${def.metadata?.label || def.id}</span>`;
      list.appendChild(li);
    });
  }

  function buildTemplateList(list: HTMLElement, templates: WidgetTemplate[]): void {
    if (!templates.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No templates found.';
      list.appendChild(empty);
      return;
    }
    templates.forEach(template => {
      const def = widgets.find(widget => widget.id === template.widgetId) || {
        id: template.widgetId,
        metadata: { label: template.label || template.widgetId }
      };
      const li = document.createElement('li');
      li.innerHTML = `${getIcon(def.id, def.metadata)}<span class="widget-name">${template.name || def.metadata?.label || template.widgetId}</span>`;
      list.appendChild(li);
    });
  }

  const card = document.createElement('div');
  card.className = 'widget-list-card page-list-card';

  const titleBar = document.createElement('div');
  titleBar.className = 'widget-title-bar page-title-bar';
  const title = document.createElement('div');
  title.className = 'widget-title page-title';
  title.textContent = 'Widgets';
  const tabs = document.createElement('div');
  tabs.className = 'widget-tabs';
  const allBtn = document.createElement('button');
  allBtn.className = 'widget-tab active';
  allBtn.textContent = 'All';
  const globalBtn = document.createElement('button');
  globalBtn.className = 'widget-tab';
  globalBtn.textContent = 'Global';
  const templatesBtn = document.createElement('button');
  templatesBtn.className = 'widget-tab';
  templatesBtn.textContent = 'Templates';
  tabs.appendChild(allBtn);
  tabs.appendChild(globalBtn);
  tabs.appendChild(templatesBtn);
  titleBar.appendChild(title);
  titleBar.appendChild(tabs);
  card.appendChild(titleBar);

  const allList = document.createElement('ul');
  allList.className = 'widget-list page-list';
  buildList(allList, widgets.map(widget => widget.id));
  const globalList = document.createElement('ul');
  globalList.className = 'widget-list page-list';
  globalList.style.display = 'none';
  const templatesList = document.createElement('ul');
  templatesList.className = 'widget-list page-list';
  templatesList.style.display = 'none';
  const globalArray = Array.from(globalIds);
  if (globalArray.length) {
    globalArray.forEach(id => {
      const def = widgets.find(widget => widget.id === id) || { id, metadata: { label: id } };
      const li = document.createElement('li');
      li.classList.add('global-widget');
      li.innerHTML = `${getIcon(def.id, def.metadata)}<span class="widget-name">${def.metadata?.label || def.id}</span>`;
      globalList.appendChild(li);
    });
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No global widgets.';
    globalList.appendChild(empty);
  }

  buildTemplateList(templatesList, getWidgetTemplates());

  window.addEventListener('widgetTemplatesUpdated', () => {
    templatesList.innerHTML = '';
    buildTemplateList(templatesList, getWidgetTemplates());
  });

  card.appendChild(allList);
  card.appendChild(globalList);
  card.appendChild(templatesList);

  allBtn.addEventListener('click', () => {
    allBtn.classList.add('active');
    globalBtn.classList.remove('active');
    templatesBtn.classList.remove('active');
    allList.style.display = '';
    globalList.style.display = 'none';
    templatesList.style.display = 'none';
  });
  globalBtn.addEventListener('click', () => {
    globalBtn.classList.add('active');
    allBtn.classList.remove('active');
    templatesBtn.classList.remove('active');
    allList.style.display = 'none';
    globalList.style.display = '';
    templatesList.style.display = 'none';
  });
  templatesBtn.addEventListener('click', () => {
    templatesBtn.classList.add('active');
    allBtn.classList.remove('active');
    globalBtn.classList.remove('active');
    allList.style.display = 'none';
    globalList.style.display = 'none';
    templatesList.style.display = '';
  });

  el.innerHTML = '';
  el.appendChild(card);
}
