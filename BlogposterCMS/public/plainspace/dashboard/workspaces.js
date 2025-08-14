// Handles dynamic workspace and subpage navigation
export async function initWorkspaceNav() {
  const nav = document.getElementById('workspace-nav');
  const sidebarNav = document.getElementById('subpage-nav');
  if (!nav && !sidebarNav) return;

  const ADMIN_BASE = (window.ADMIN_BASE || '/admin/').replace(/\/+/g, '/');
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const relPath = window.location.pathname.replace(new RegExp('^' + esc(ADMIN_BASE)), '');
  const workspaceSlug = relPath.split('/')[0] || '';

  try {
    const res = await window.meltdownEmit('getPagesByLane', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'pagesManager',
      moduleType: 'core',
      lane: 'admin'
    });
    const pages = Array.isArray(res?.pages) ? res.pages : Array.isArray(res) ? res : [];

    const inferWorkspace = p => {
      if (typeof p.meta?.workspace === 'string') return p.meta.workspace;
      return String(p.slug || '').split('/')[0];
    };

    // Build top workspace navigation
    if (nav) {
      const createBtn = nav.querySelector('#workspace-create');
      nav.innerHTML = '';
      const top = pages.filter(
        p =>
          p.lane === 'admin' &&
          typeof p.meta?.workspace === 'string' &&
          p.meta.workspace === p.slug
      );
      top.forEach(p => {
        const a = document.createElement('a');
        const href = ADMIN_BASE + p.slug;
        a.href = href;
        a.textContent = p.title;
        const icon = document.createElement('img');
        icon.src =
          (typeof p.meta?.icon === 'string' && p.meta.icon) ||
          (typeof p.config?.icon === 'string' && p.config.icon) ||
          '/assets/icons/file-box.svg';
        icon.className = 'icon';
        a.prepend(icon);
        if (window.location.pathname.startsWith(href)) {
          a.classList.add('active');
        }
        nav.appendChild(a);
      });
      if (createBtn) {
        createBtn.addEventListener('click', () => {
          showWorkspacePanel();
        });
        nav.prepend(createBtn);
      }
    }

    // Build sidebar subpage navigation
    if (sidebarNav && workspaceSlug) {
      sidebarNav.innerHTML = '';
      const subpages = pages.filter(p =>
        p.slug.startsWith(workspaceSlug + '/') &&
        p.slug !== workspaceSlug
      );
      const seen = new Set();
      subpages.forEach(p => {
        const [, ...rest] = p.slug.split('/');
        const first = rest[0];
        if (!first || seen.has(first)) return;
        seen.add(first);
        const base = pages.find(pg => pg.slug === `${workspaceSlug}/${first}`);
        const title = base?.title || first;
        const a = document.createElement('a');
        const linkHref = `${ADMIN_BASE}${workspaceSlug}/${first}`;
        a.href = linkHref;
        a.className = 'sidebar-item';
        const icon = document.createElement('img');
        icon.src =
          (typeof base?.meta?.icon === 'string' && base.meta.icon) ||
          (typeof base?.config?.icon === 'string' && base.config.icon) ||
          '/assets/icons/file.svg';
        icon.className = 'icon';
        a.appendChild(icon);
        const span = document.createElement('span');
        span.className = 'label';
        span.textContent = title;
        a.appendChild(span);
        if (window.location.pathname.startsWith(linkHref)) {
          a.classList.add('active');
        }
        sidebarNav.appendChild(a);
      });
      const add = document.createElement('div');
      add.className = 'sidebar-item sidebar-add-subpage';
      const addIcon = document.createElement('img');
      addIcon.src = '/assets/icons/plus.svg';
      addIcon.className = 'icon';
      add.appendChild(addIcon);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = 'Add';
      add.appendChild(label);
      add.addEventListener('click', () => {
        showSubpagePanel(workspaceSlug);
      });
      sidebarNav.appendChild(add);
    }

  } catch (err) {
    console.error('[workspaceNav] failed', err);
  }
}

document.addEventListener('DOMContentLoaded', initWorkspaceNav);
document.addEventListener('main-header-loaded', initWorkspaceNav);
document.addEventListener('sidebar-loaded', initWorkspaceNav);

function createSlidePanel(id, title) {
  let panel = document.getElementById(id);
  if (panel) {
    panel.classList.add('open');
    return panel;
  }
  panel = document.createElement('div');
  panel.id = id;
  panel.className = 'slide-panel';

  const header = document.createElement('div');
  header.className = 'slide-panel-header';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close-btn';
  close.textContent = '×';
  close.addEventListener('click', () => panel.classList.remove('open'));
  header.appendChild(h2);
  header.appendChild(close);
  panel.appendChild(header);
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('open'));
  return panel;
}

function buildIconList(container, onSelect) {
  const icons = window.featherIcons || {};
  Object.entries(icons).forEach(([name, path]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-option';
    const img = document.createElement('img');
    img.src = path;
    img.alt = name;
    img.className = 'icon';
    btn.appendChild(img);
    btn.addEventListener('click', () => onSelect(path));
    container.appendChild(btn);
  });
}

function showWorkspacePanel() {
  const panel = createSlidePanel('workspace-panel', 'Create Workspace');
  if (panel.querySelector('form')) return;
  const form = document.createElement('form');

  const iconPicker = document.createElement('div');
  iconPicker.className = 'icon-picker';
  const iconBtn = document.createElement('button');
  iconBtn.type = 'button';
  iconBtn.className = 'icon-picker-toggle';
  const iconImg = document.createElement('img');
  iconImg.src = '/assets/icons/file-box.svg';
  iconImg.alt = 'icon';
  iconImg.className = 'icon';
  iconBtn.appendChild(iconImg);
  iconPicker.appendChild(iconBtn);
  const iconList = document.createElement('div');
  iconList.className = 'icon-picker-list hidden';
  buildIconList(iconList, src => {
    iconImg.src = src;
    iconBtn.dataset.icon = src;
    iconList.classList.add('hidden');
  });
  iconPicker.appendChild(iconList);
  iconBtn.addEventListener('click', () => iconList.classList.toggle('hidden'));

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Workspace name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameLabel.appendChild(nameInput);

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.textContent = 'Create';
  createBtn.addEventListener('click', () => {
    const detail = {
      actionId: 'createWorkspace',
      name: nameInput.value.trim(),
      icon: iconBtn.dataset.icon || iconImg.src
    };
    document.dispatchEvent(new CustomEvent('ui:action:run', { detail }));
    panel.classList.remove('open');
  });

  form.appendChild(iconPicker);
  form.appendChild(nameLabel);
  form.appendChild(createBtn);
  panel.appendChild(form);
}

function showSubpagePanel(workspace) {
  const panel = createSlidePanel('subpage-panel', 'Create Subpage');
  if (panel.querySelector('form')) return;
  const form = document.createElement('form');

  const iconPicker = document.createElement('div');
  iconPicker.className = 'icon-picker';
  const iconBtn = document.createElement('button');
  iconBtn.type = 'button';
  iconBtn.className = 'icon-picker-toggle';
  const iconImg = document.createElement('img');
  iconImg.src = '/assets/icons/file.svg';
  iconImg.alt = 'icon';
  iconImg.className = 'icon';
  iconBtn.appendChild(iconImg);
  iconPicker.appendChild(iconBtn);
  const iconList = document.createElement('div');
  iconList.className = 'icon-picker-list hidden';
  buildIconList(iconList, src => {
    iconImg.src = src;
    iconBtn.dataset.icon = src;
    iconList.classList.add('hidden');
  });
  iconPicker.appendChild(iconList);
  iconBtn.addEventListener('click', () => iconList.classList.toggle('hidden'));

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Page name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameLabel.appendChild(nameInput);

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.textContent = 'Create';
  createBtn.addEventListener('click', () => {
    const detail = {
      actionId: 'createSubpage',
      workspace,
      name: nameInput.value.trim(),
      icon: iconBtn.dataset.icon || iconImg.src
    };
    document.dispatchEvent(new CustomEvent('ui:action:run', { detail }));
    panel.classList.remove('open');
  });

  form.appendChild(iconPicker);
  form.appendChild(nameLabel);
  form.appendChild(createBtn);
  panel.appendChild(form);
}
