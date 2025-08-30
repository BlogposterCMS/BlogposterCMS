// Widget panel toggle handled via custom events

import { bpDialog } from '../../assets/js/bpDialog.js';

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

  const widgetsBtn = document.getElementById('widgets-toggle-inline');
  if (widgetsBtn) {
    widgetsBtn.addEventListener('click', () => {
      const open = !document.getElementById('widgets-panel')?.classList.contains('open');
      document.dispatchEvent(new CustomEvent('ui:widgets:toggle', { detail: { open } }));
    });
  }

  const deleteBtn = document.getElementById('admin-delete-page');
  if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteCurrentAdminPage);

  const editToggle = document.getElementById('edit-toggle');
  if (!editToggle) return;
  const editIcon = editToggle.querySelector('img');

  let editing = false;
  if (window.adminGrid && typeof window.adminGrid.on === 'function') {
    const grid = window.adminGrid;
    grid.pushOnOverlap = grid.staticGrid;
    grid.on('staticchange', isStatic => {
      editing = !isStatic;
      grid.pushOnOverlap = isStatic;
      document.body.classList.toggle('dashboard-edit-mode', editing);
      if (editIcon) editIcon.src = editing ? '/assets/icons/save.svg' : '/assets/icons/square-pen.svg';
      document.dispatchEvent(new CustomEvent('ui:widgets:toggle', { detail: { open: false } }));
    });
  }
  editToggle.addEventListener('click', async () => {
    const grid = window.adminGrid;
    if (!grid || typeof grid.setStatic !== 'function') return;
    editing = !editing;
    grid.setStatic(!editing);
    document.body.classList.toggle('dashboard-edit-mode', editing);
    if (editIcon) editIcon.src = editing ? '/assets/icons/save.svg' : '/assets/icons/square-pen.svg';
    document.dispatchEvent(new CustomEvent('ui:widgets:toggle', { detail: { open: false } }));
    if (!editing && typeof window.saveAdminLayout === 'function') {
      try {
        await window.saveAdminLayout();
      } catch (e) {
        console.error(e);
      }
    }
  });

  // No additional JS needed for initial state: CSS handles visibility
}

// Hilfsfunktion: aktuelle Admin-Seite bestimmen und löschen
async function handleDeleteCurrentAdminPage() {
  try {
    const ADMIN_BASE = (window.ADMIN_BASE || '/admin/').replace(/\/+/g, '/');
    let rel = window.location.pathname;
    if (rel.startsWith(ADMIN_BASE)) rel = rel.slice(ADMIN_BASE.length);
    rel = rel.replace(/^\/|\/$/g, '');
    if (!rel) {
      await bpDialog.alert('No admin page selected.');
      return;
    }

    const res = await window.meltdownEmit('getPageBySlug', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'pagesManager',
      moduleType: 'core',
      slug: rel,
      lane: 'admin'
    });

    const page = Array.isArray(res) ? res[0] : res;
    if (!page?.id) {
      await bpDialog.alert('Page not found.');
      return;
    }

    const baseSlug = String(page.slug || '').split('/')[0];
    if (['home', 'settings'].includes(baseSlug) && baseSlug === page.slug) {
      await bpDialog.alert('This workspace cannot be deleted.');
      return;
    }

    if (!(await bpDialog.confirm(`Delete admin page "${page.title}" (${page.slug})?`))) return;

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
    await bpDialog.alert('Failed to delete page: ' + (err?.message || err));
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
