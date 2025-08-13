// Handles dynamic workspace and subpage navigation
export async function initWorkspaceNav() {
  const nav = document.getElementById('workspace-nav');
  const sidebarNav = document.getElementById('subpage-nav');
  if (!nav && !sidebarNav) return;

  try {
    const res = await window.meltdownEmit('getPagesByLane', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'pagesManager',
      moduleType: 'core',
      lane: 'admin'
    });
    const pages = Array.isArray(res?.pages) ? res.pages : Array.isArray(res) ? res : [];

    const workspaceSlug = window.location.pathname.replace(/^\/admin\/?/, '').split('/')[0];

    // Build top workspace navigation
    if (nav) {
      const existingCreate = nav.querySelector('#workspace-create');
      if (existingCreate) nav.innerHTML = existingCreate.outerHTML; // keep create icon only

      pages.filter(p => p.lane === 'admin' && !p.parentSlug).forEach(p => {
        const a = document.createElement('a');
        a.href = `/admin/${p.slug}`;
        a.textContent = p.title;
        const icon = document.createElement('img');
        icon.src = typeof p.meta?.icon === 'string' ? p.meta.icon : '/assets/icons/file-box.svg';
        icon.className = 'icon';
        a.prepend(icon);
        nav.appendChild(a);
      });

      document.dispatchEvent(new CustomEvent('main-header-loaded'));
    }

    // Build sidebar subpage navigation
    if (sidebarNav && workspaceSlug) {
      sidebarNav.innerHTML = '';
      const slugPrefix = workspaceSlug + '/';
      const subpages = pages.filter(p => p.slug.startsWith(slugPrefix));
      const seen = new Set();
      subpages.forEach(p => {
        const rest = p.slug.slice(slugPrefix.length);
        const first = rest.split('/')[0];
        if (!first || seen.has(first)) return;
        seen.add(first);
        const base = pages.find(pg => pg.slug === `${workspaceSlug}/${first}`);
        const title = base?.title || first;
        const a = document.createElement('a');
        a.href = `/admin/${workspaceSlug}/${first}`;
        a.className = 'sidebar-item';
        const icon = document.createElement('img');
        icon.src = typeof base?.meta?.icon === 'string' ? base.meta.icon : '/assets/icons/file.svg';
        icon.className = 'icon';
        a.appendChild(icon);
        const span = document.createElement('span');
        span.className = 'label';
        span.textContent = title;
        a.appendChild(span);
        if (window.location.pathname.startsWith(a.href.replace(window.location.origin,''))) {
          a.classList.add('active');
        }
        sidebarNav.appendChild(a);
      });
      const add = document.createElement('a');
      add.href = '#';
      add.className = 'sidebar-item sidebar-add-subpage';
      const addIcon = document.createElement('img');
      addIcon.src = '/assets/icons/plus.svg';
      addIcon.className = 'icon';
      add.appendChild(addIcon);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = 'Add';
      add.appendChild(label);
      sidebarNav.appendChild(add);
    }
  } catch (err) {
    console.error('[workspaceNav] failed', err);
  }
}

document.addEventListener('DOMContentLoaded', initWorkspaceNav);
document.addEventListener('main-header-loaded', initWorkspaceNav);
