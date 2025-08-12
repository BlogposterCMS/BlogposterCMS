import { showWidgetPopup, hideWidgetPopup } from './widgetPopup.js';

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
  if (header && !header.dataset.scrollBound) {
    header.dataset.scrollBound = 'true';
    const updateShadow = () => {
      if (window.scrollY > 0) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    updateShadow();
    window.addEventListener('scroll', updateShadow, { passive: true });
  }

  const editToggle = document.getElementById('edit-toggle');
  const actionBtn  = document.getElementById('dynamic-action-btn');
  const actionCfg  = window.CONTENT_ACTION;

  if (actionBtn) {
    if (actionCfg && actionCfg.icon) {
      actionBtn.src = actionCfg.icon;
      actionBtn.style.display = 'inline';
      const fn = typeof actionCfg.action === 'function'
        ? actionCfg.action
        : window[actionCfg.action];
      if (typeof fn === 'function') {
        actionBtn.onclick = fn;
      }
    } else {
      actionBtn.removeAttribute('src');
      actionBtn.style.display = 'none';
      actionBtn.onclick = null;
    }
  }

  if (!editToggle) return;

  let editing = false;
  if (window.adminGrid && typeof window.adminGrid.on === 'function') {
    const grid = window.adminGrid;
    grid.pushOnOverlap = grid.staticGrid;
    grid.on('staticchange', isStatic => {
      editing = !isStatic;
      grid.pushOnOverlap = isStatic;
      document.body.classList.toggle('dashboard-edit-mode', editing);
        editToggle.src = editing ? '/assets/icons/check.svg' : '/assets/icons/pencil-line.svg';
      if (editing) showWidgetPopup(); else hideWidgetPopup();
    });
  }
  editToggle.addEventListener('click', async () => {
    const grid = window.adminGrid;
    if (!grid || typeof grid.setStatic !== 'function') return;
    editing = !editing;
    grid.setStatic(!editing);
    document.body.classList.toggle('dashboard-edit-mode', editing);
      editToggle.src = editing ? '/assets/icons/check.svg' : '/assets/icons/pencil-line.svg';
    editToggle.classList.add('spin');
    setTimeout(() => editToggle.classList.remove('spin'), 300);
    if (editing) {
      showWidgetPopup();
    } else {
      hideWidgetPopup();
    }
    if (!editing && typeof window.saveAdminLayout === 'function') {
      try { await window.saveAdminLayout(); } catch(e) { console.error(e); }
    }
  });
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
