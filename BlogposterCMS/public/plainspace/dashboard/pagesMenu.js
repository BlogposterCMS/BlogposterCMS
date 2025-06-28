export function initPagesMenu() {
  const menu = document.getElementById('pages-menu');
  const toggle = document.getElementById('pages-menu-toggle');
  const list = menu?.querySelector('.menu-list');
  const filterIcon = document.getElementById('pages-menu-filter');
  const dropdown = document.getElementById('pages-menu-filter-dropdown');
  if (!menu || !toggle || !list) return;
  let pagesData = [];

  async function loadPages() {
    try {
      const res = await window.meltdownEmit('getPagesByLane', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'pagesManager',
        moduleType: 'core',
        lane: 'admin'
      });
      pagesData = Array.isArray(res?.pages) ? res.pages : (Array.isArray(res) ? res : []);
      pagesData = pagesData.filter(p => p.slug && p.slug.startsWith('pages/'));
      applySort('alpha');
    } catch (err) {
      console.error('[pagesMenu] failed to load pages', err);
    }
  }

  function render(items) {
    list.innerHTML = items.map(p => `<li data-updated="${p.updated_at || ''}" data-hits="${p.hits || 0}"><a href="/admin/${p.slug}">${p.title}</a></li>`).join('');
  }

  function applySort(method) {
    const data = [...pagesData];
    switch (method) {
      case 'recent':
        data.sort((a,b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        break;
      case 'freq':
        data.sort((a,b) => (b.hits || 0) - (a.hits || 0));
        break;
      default:
        data.sort((a,b) => (a.title || '').localeCompare(b.title || ''));
    }
    render(data);
  }

  toggle.addEventListener('click', () => {
    menu.classList.toggle('open');
    toggle.classList.add('spin');
    setTimeout(() => toggle.classList.remove('spin'), 300);
  });

  if (filterIcon && dropdown) {
    filterIcon.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if (!dropdown.contains(e.target) && e.target !== filterIcon) {
        dropdown.classList.remove('open');
      }
    });
    dropdown.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        applySort(btn.dataset.sort);
        dropdown.classList.remove('open');
      });
    });
  }

  if (window.location.pathname === '/admin/home' && window.innerWidth >= 1024) {
    menu.classList.add('open');
  }

  loadPages();
}

document.addEventListener('DOMContentLoaded', initPagesMenu);
document.addEventListener('content-header-loaded', initPagesMenu);
