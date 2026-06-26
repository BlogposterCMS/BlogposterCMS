import { bpDialog } from '../../shared/dialogs/bpDialog.js';
import {
  adminBaseHref,
  adminSlugFromPath,
  deleteAdminPage,
  errorMessage,
  fetchAdminPageBySlug,
  isProtectedAdminWorkspace,
  normalizeAdminBase
} from './contentHeaderActionsData.js';

function dispatchWidgetsToggle(open: boolean): void {
  document.dispatchEvent(new CustomEvent('ui:widgets:toggle', { detail: { open } }));
}

let detachBreadcrumbResize: (() => void) | null = null;

function clearBreadcrumbResize(): void {
  detachBreadcrumbResize?.();
  detachBreadcrumbResize = null;
}

function renderBreadcrumb(breadcrumbEl: HTMLElement): void {
  clearBreadcrumbResize();

  // Some admin widgets re-dispatch content-header-loaded without replacing the partial.
  breadcrumbEl.replaceChildren();

  const adminBase = normalizeAdminBase(window.ADMIN_BASE);
  const baseHref = adminBaseHref(adminBase);
  const path = adminSlugFromPath(window.location.pathname, adminBase);
  const segments = path.split('/').filter(Boolean);
  let currentPath = '';
  segments.forEach(seg => {
    currentPath += '/' + seg;
    const div = document.createElement('div');
    div.className = 'breadcrumb-segment';
    const link = document.createElement('a');
    link.href = `${baseHref}${currentPath}`;
    link.textContent = seg;
    div.appendChild(link);
    breadcrumbEl.appendChild(div);
  });
  const items = breadcrumbEl.querySelectorAll('.breadcrumb-segment');
  if (items.length) items[items.length - 1]?.classList.add('current');

  function adjustBreadcrumb(): void {
    let children = Array.from(breadcrumbEl.children);
    while (breadcrumbEl.scrollWidth > breadcrumbEl.clientWidth && children.length > 1) {
      const removed = children.shift();
      removed?.remove();
      const firstLink = children[0]?.querySelector('a');
      if (!firstLink) break;
      const segText = firstLink.textContent || '';
      firstLink.textContent = '...' + segText.slice(-4);
      children = Array.from(breadcrumbEl.children);
    }
  }
  adjustBreadcrumb();
  window.addEventListener('resize', adjustBreadcrumb);
  detachBreadcrumbResize = () => window.removeEventListener('resize', adjustBreadcrumb);
}

export function initContentHeader(): void {
  const breadcrumbEl = document.getElementById('content-breadcrumb');
  if (breadcrumbEl) renderBreadcrumb(breadcrumbEl);
  else clearBreadcrumbResize();

  const header = document.querySelector<HTMLElement>('.content-header');
  document.body.classList.toggle('has-content-footer', Boolean(header));
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
      dispatchWidgetsToggle(open);
    });
  }

  const deleteBtn = document.getElementById('admin-delete-page');
  if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteCurrentAdminPage);

  const editToggle = document.getElementById('edit-toggle');
  if (!editToggle) return;
  const editIcon = editToggle.querySelector<HTMLImageElement>('img');

  let editing = false;
  if (window.adminGrid && typeof window.adminGrid.on === 'function') {
    const grid = window.adminGrid;
    grid.pushOnOverlap = grid.staticGrid;
    grid.on('staticchange', (isStatic: boolean) => {
      editing = !isStatic;
      grid.pushOnOverlap = isStatic;
      document.body.classList.toggle('dashboard-edit-mode', editing);
      if (editIcon) editIcon.src = editing ? '/assets/icons/save.svg' : '/assets/icons/square-pen.svg';
      dispatchWidgetsToggle(false);
    });
  }
  editToggle.addEventListener('click', async () => {
    const grid = window.adminGrid;
    if (!grid || typeof grid.setStatic !== 'function') return;
    editing = !editing;
    grid.setStatic(!editing);
    document.body.classList.toggle('dashboard-edit-mode', editing);
    if (editIcon) editIcon.src = editing ? '/assets/icons/save.svg' : '/assets/icons/square-pen.svg';
    dispatchWidgetsToggle(false);
    if (!editing && typeof window.saveAdminLayout === 'function') {
      try {
        await window.saveAdminLayout();
      } catch (err) {
        console.error(err);
      }
    }
  });
}

async function handleDeleteCurrentAdminPage(): Promise<void> {
  try {
    const adminBase = normalizeAdminBase(window.ADMIN_BASE);
    const rel = adminSlugFromPath(window.location.pathname, adminBase);
    if (!rel) {
      await bpDialog.alert('No admin page selected.');
      return;
    }

    const page = await fetchAdminPageBySlug(window.meltdownEmit, window.ADMIN_TOKEN, rel);
    if (!page?.id) {
      await bpDialog.alert('Page not found.');
      return;
    }

    if (isProtectedAdminWorkspace(page)) {
      await bpDialog.alert('This workspace cannot be deleted.');
      return;
    }

    if (!(await bpDialog.confirm(`Delete admin page "${page.title}" (${page.slug})?`))) return;

    await deleteAdminPage(window.meltdownEmit, window.ADMIN_TOKEN, page.id);
    window.location.href = adminBaseHref(adminBase);
  } catch (err) {
    console.error('Delete failed', err);
    await bpDialog.alert('Failed to delete page: ' + errorMessage(err));
  }
}

export function highlightMainHeader(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>('.main-header .nav-icons a');
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
