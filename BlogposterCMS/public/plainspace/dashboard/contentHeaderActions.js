// Widget panel toggle handled via custom events
import { openWidgetsPanel } from './widgetsPanel.js';

export function initContentHeader() {
  const breadcrumbEl = document.getElementById('content-breadcrumb');
  if (breadcrumbEl) {
    const path = window.location.pathname.replace(/^\/admin/, '');
    const segments = path.split('/').filter(Boolean);
    let currentPath = '';
    segments.forEach(seg => {
      currentPath += '/' + seg;
      const div = document.createElement('div');
      div.className = 'breadcrumb-segment';
      const link = document.createElement('a');
      link.href = '/admin' + currentPath;
      link.textContent = seg;
      div.appendChild(link);
      breadcrumbEl.appendChild(div);
    });
    const items = breadcrumbEl.querySelectorAll('.breadcrumb-segment');
    if (items.length) items[items.length - 1].classList.add('current');

    function adjustBreadcrumb() {
      let children = Array.from(breadcrumbEl.children);
      while (breadcrumbEl.scrollWidth > breadcrumbEl.clientWidth && children.length > 1) {
        const removed = children.shift();
        removed.remove();
        const firstLink = children[0].querySelector('a');
        const segText = firstLink.textContent;
        firstLink.textContent = '...' + segText.slice(-4);
        children = Array.from(breadcrumbEl.children);
      }
    }
    adjustBreadcrumb();
    window.addEventListener('resize', adjustBreadcrumb);
  }

  const header = document.querySelector('.content-header');
  if (!header) return;

  if (!header.dataset.scrollBound) {
    header.dataset.scrollBound = 'true';
    const updateShadow = () => {
      if (window.scrollY > 0) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    updateShadow();
    window.addEventListener('scroll', updateShadow, { passive: true });
  }

  // Actions-Container (rechts)
  let actions = header.querySelector('.editor-quick-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'editor-quick-actions';
    header.appendChild(actions);
  }

  // Nur im Edit-Mode sichtbar halten
  const setEditModeUI = editing => {
    actions.style.display = editing ? '' : 'none';
  };

  // Widgets-Button (ersetzt den alten Floater)
  let widgetsBtn = header.querySelector('#widgets-toggle-inline');
  if (!widgetsBtn) {
    widgetsBtn = document.createElement('button');
    widgetsBtn.id = 'widgets-toggle-inline';
    widgetsBtn.className = 'icon-btn';
    widgetsBtn.title = 'Widgets';
    widgetsBtn.innerHTML = '<img src="/assets/icons/layout-grid.svg" alt="Widgets">';
    widgetsBtn.addEventListener('click', () => {
      const open = !document.getElementById('widgets-panel')?.classList.contains('open');
      document.dispatchEvent(new CustomEvent('ui:widgets:toggle', { detail: { open } }));
      // alternativ direkt: openWidgetsPanel(true);
    });
    actions.appendChild(widgetsBtn);
  }

  // Delete-Button (Admin-Page löschen)
  let deleteBtn = header.querySelector('#admin-delete-page');
  if (!deleteBtn) {
    deleteBtn = document.createElement('button');
    deleteBtn.id = 'admin-delete-page';
    deleteBtn.className = 'icon-btn danger';
    deleteBtn.title = 'Delete this admin page';
    deleteBtn.innerHTML = '<img src="/assets/icons/x.svg" alt="Delete">';
    deleteBtn.addEventListener('click', handleDeleteCurrentAdminPage);
    actions.appendChild(deleteBtn);
  }

  const editToggle = document.getElementById('edit-toggle');
  if (!editToggle) return;

  let editing = false;
  if (window.adminGrid && typeof window.adminGrid.on === 'function') {
    const grid = window.adminGrid;
    grid.pushOnOverlap = grid.staticGrid;
    grid.on('staticchange', isStatic => {
      editing = !isStatic;
      grid.pushOnOverlap = isStatic;
      document.body.classList.toggle('dashboard-edit-mode', editing);
      editToggle.src = editing ? '/assets/icons/save.svg' : '/assets/icons/square-pen.svg';
      setEditModeUI(editing);
      document.dispatchEvent(new CustomEvent('ui:widgets:toggle', { detail: { open: false } }));
    });
  }
  editToggle.addEventListener('click', async () => {
    const grid = window.adminGrid;
    if (!grid || typeof grid.setStatic !== 'function') return;
    editing = !editing;
    grid.setStatic(!editing);
    document.body.classList.toggle('dashboard-edit-mode', editing);
    editToggle.src = editing ? '/assets/icons/save.svg' : '/assets/icons/square-pen.svg';
    editToggle.classList.add('spin');
    setTimeout(() => editToggle.classList.remove('spin'), 300);
    setEditModeUI(editing);
    document.dispatchEvent(new CustomEvent('ui:widgets:toggle', { detail: { open: false } }));
    if (!editing && typeof window.saveAdminLayout === 'function') {
      try {
        await window.saveAdminLayout();
      } catch (e) {
        console.error(e);
      }
    }
  });

  // Initialzustand
  setEditModeUI(document.body.classList.contains('dashboard-edit-mode'));
}

// Hilfsfunktion: aktuelle Admin-Seite bestimmen und löschen
async function handleDeleteCurrentAdminPage() {
  try {
    const ADMIN_BASE = window.ADMIN_BASE || '/admin/';
    const rel = window.location.pathname
      .replace(new RegExp('^' + ADMIN_BASE), '')
      .replace(/^\/|\/$/g, '');
    if (!rel) return alert('No admin page selected.');

    const res = await window.meltdownEmit('getPageBySlug', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'pagesManager',
      moduleType: 'core',
      slug: rel,
      lane: 'admin'
    });

    const page = Array.isArray(res) ? res[0] : res;
    if (!page?.id) return alert('Page not found.');

    if (!confirm(`Delete admin page "${page.title}" (${page.slug})?`)) return;

    await window.meltdownEmit('deletePage', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'pagesManager',
      moduleType: 'core',
      pageId: page.id
    });

    const ADMIN_BASE_CLEAN = ADMIN_BASE.endsWith('/') ? ADMIN_BASE.slice(0, -1) : ADMIN_BASE;
    window.location.href = ADMIN_BASE_CLEAN;
  } catch (err) {
    console.error('Delete failed', err);
    alert('Failed to delete page: ' + (err?.message || err));
  }
}

export function highlightMainHeader() {
  const links = document.querySelectorAll('.main-header .nav-icons a');
  const path = window.location.pathname;
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href && path.startsWith(href)) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initContentHeader();
  highlightMainHeader();
});
document.addEventListener('content-header-loaded', initContentHeader);
document.addEventListener('main-header-loaded', highlightMainHeader);
