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
          showWorkspaceField();
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
        showSubpageField(workspaceSlug);
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

// Build inline sliding field with icon picker, text input and confirm button
function buildInlineField(id, placeholder, submitHandler, iconConfirm = false) {
  const container = document.createElement('div');
  container.id = id;
  container.className = 'inline-create-field';

  let selectedIcon = '/assets/icons/file-box.svg';

  const iconBtn = document.createElement('button');
  iconBtn.type = 'button';
  iconBtn.className = 'icon-button';
  const iconImg = document.createElement('img');
  iconImg.src = selectedIcon;
  iconImg.alt = 'Select icon';
  iconBtn.appendChild(iconImg);

  const iconList = document.createElement('div');
  iconList.className = 'icon-list';
  let iconsLoaded = false;

  iconBtn.addEventListener('click', async e => {
    e.stopPropagation();
    if (iconList.classList.contains('open')) {
      iconList.classList.remove('open');
      return;
    }
    iconList.classList.add('open');
    if (!iconsLoaded) {
      iconsLoaded = true;
      try {
        const res = await fetch('/assets/icon-list.json');
        if (!res.ok) throw new Error('Failed to load icons');
        const iconNames = await res.json();
        iconNames.forEach(name => {
          const btn = document.createElement('button');
          btn.type = 'button';
          const img = document.createElement('img');
          img.loading = 'lazy';
          img.src = `/assets/icons/${name}`;
          img.alt = name.replace('.svg', '');
          btn.appendChild(img);
          btn.addEventListener('click', e => {
            e.stopPropagation();
            selectedIcon = `/assets/icons/${name}`;
            iconImg.src = selectedIcon;
            iconList.classList.remove('open');
          });
          iconList.appendChild(btn);
        });
      } catch (err) {
        console.error('Failed to load icons', err);
      }
    }
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  if (iconConfirm) {
    createBtn.className = 'icon-button confirm-button';
    const confirmImg = document.createElement('img');
    confirmImg.src = '/assets/icons/corner-down-right.svg';
    confirmImg.alt = 'Create';
    createBtn.appendChild(confirmImg);
  } else {
    createBtn.textContent = 'Create';
  }
  createBtn.addEventListener('click', () => {
    submitHandler({ name: input.value.trim(), icon: selectedIcon });
    container.remove();
  });

  container.append(iconBtn, iconList, input, createBtn);
  return container;
}

// Show inline form beside add buttons without using a full slide panel
function showWorkspaceField() {
  const existing = document.getElementById('workspace-inline');
  if (existing) {
    existing.remove();
    return;
  }
  const btn = document.getElementById('workspace-create');
  if (!btn) return;
  const container = buildInlineField('workspace-inline', 'Workspace name', detail => {
    document.dispatchEvent(
      new CustomEvent('ui:action:run', {
        detail: { actionId: 'createWorkspace', name: detail.name, icon: detail.icon }
      })
    );
  }, false);
  btn.appendChild(container);
  requestAnimationFrame(() => container.classList.add('open'));
}

function showSubpageField(workspace) {
  const addBtn = document.querySelector('.sidebar-add-subpage');
  if (!addBtn) return;
  const icon = addBtn.querySelector('img.icon');
  const label = addBtn.querySelector('.label');
  const existing = document.getElementById('subpage-floating-field');
  if (existing) {
    existing.remove();
    if (icon) icon.src = '/assets/icons/plus.svg';
    if (label) label.style.display = '';
    return;
  }
  const container = buildInlineField(
    'subpage-floating-field',
    'Page name',
    async detail => {
      const makeSlug = str =>
        String(str)
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      const slugPart = makeSlug(detail.name);
      if (!slugPart) return;
      try {
        let parentId = null;
        try {
          const parentRes = await window.meltdownEmit('getPageBySlug', {
            jwt: window.ADMIN_TOKEN,
            moduleName: 'pagesManager',
            moduleType: 'core',
            slug: workspace,
            lane: 'admin'
          });
          const parent = parentRes?.data ?? parentRes ?? null;
          parentId = parent?.id || null;
        } catch (err) {
          console.error('Failed to fetch parent page', err);
        }
        await window.meltdownEmit('createPage', {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'pagesManager',
          moduleType: 'core',
          title: detail.name,
          slug: `${workspace}/${slugPart}`,
          lane: 'admin',
          status: 'published',
          parent_id: parentId,
          meta: { icon: detail.icon }
        });
        if (icon) icon.src = '/assets/icons/plus.svg';
        if (label) label.style.display = '';
        window.location.reload();
      } catch (err) {
        console.error('Failed to create subpage', err);
      }
    },
    true
  );
  document.body.appendChild(container);
  const rect = addBtn.getBoundingClientRect();
  container.style.left = `${rect.right + window.scrollX + 8}px`;
  container.style.top = `${rect.top + window.scrollY + rect.height / 2}px`;
  container.style.zIndex = '1000';
  if (icon) icon.src = '/assets/icons/minus.svg';
  if (label) label.style.display = 'none';
  requestAnimationFrame(() => container.classList.add('open'));
}
