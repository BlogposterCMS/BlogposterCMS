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
      const slug = String(p.slug || '');
      if (slug.includes('/')) return slug.split('/')[0];
      if (typeof p.parentSlug === 'string') return p.parentSlug.split('/')[0];
      return slug;
    };

    // Build top workspace navigation
    if (nav) {
      const createBtn = nav.querySelector('#workspace-create');
      nav.innerHTML = '';
      const top = pages.filter(
        p => p.lane === 'admin' && inferWorkspace(p) === p.slug
      );
      top.forEach(p => {
        const a = document.createElement('a');
        const href = ADMIN_BASE + p.slug;
        a.href = href;
        a.textContent = p.title;
        const icon = document.createElement('img');
        icon.src = typeof p.meta?.icon === 'string' ? p.meta.icon : '/assets/icons/file-box.svg';
        icon.className = 'icon';
        a.prepend(icon);
        if (window.location.pathname.startsWith(href)) {
          a.classList.add('active');
        }
        nav.appendChild(a);
      });
      if (createBtn) {
        createBtn.addEventListener('click', e => {
          e.preventDefault();
          document.dispatchEvent(
            new CustomEvent('ui:action:run', { detail: { actionId: 'createWorkspace' } })
          );
        });
        nav.appendChild(createBtn);
      }
    }

    // Build sidebar subpage navigation
    if (sidebarNav && workspaceSlug) {
      sidebarNav.innerHTML = '';
      const subpages = pages.filter(
        p => inferWorkspace(p) === workspaceSlug && inferWorkspace(p) !== p.slug
      );
      const seen = new Set();
      subpages.forEach(p => {
        const rest = p.slug.slice((workspaceSlug + '/').length);
        const first = rest.split('/')[0];
        if (!first || seen.has(first)) return;
        seen.add(first);
        const base = pages.find(pg => pg.slug === `${workspaceSlug}/${first}`);
        const title = base?.title || first;
        const a = document.createElement('a');
        const linkHref = `${ADMIN_BASE}${workspaceSlug}/${first}`;
        a.href = linkHref;
        a.className = 'sidebar-item';
        const icon = document.createElement('img');
        icon.src = typeof base?.meta?.icon === 'string' ? base.meta.icon : '/assets/icons/file.svg';
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
      add.addEventListener('click', e => {
        e.preventDefault();
        document.dispatchEvent(
          new CustomEvent('ui:action:run', {
            detail: { actionId: 'createSubpage', workspace: workspaceSlug }
          })
        );
      });
      sidebarNav.appendChild(add);
    }

  } catch (err) {
    console.error('[workspaceNav] failed', err);
  }
}

document.addEventListener('DOMContentLoaded', initWorkspaceNav);
document.addEventListener('main-header-loaded', initWorkspaceNav);
