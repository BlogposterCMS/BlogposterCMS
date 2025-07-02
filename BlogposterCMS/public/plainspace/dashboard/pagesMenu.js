// pagesMenu.js  --------------------------------------------------------------
export function initPagesMenu() {
  const menu      = document.querySelector('#pages-menu.pages-menu');
  const toggle    = document.getElementById('pages-menu-toggle');   // burger icon
  const closeBtn  = document.getElementById('pages-menu-close');    // arrow-right
  const list      = menu?.querySelector('.menu-list');
  const emptyHint = document.getElementById('pages-menu-empty');

  const filterBtn = document.getElementById('pages-menu-filter');
  const dropdown  = document.getElementById('pages-menu-filter-dropdown');

  // Abort if vital parts are missing or already initialised
  if (!menu || !toggle || !list || menu.dataset.bound === 'true') return;
  menu.dataset.bound = 'true';

  /* ---------- data fetching ---------- */
  let pagesData = [];

  async function loadPages() {
    try {
      const res = await window.meltdownEmit('getPagesByLane', {
        jwt:        window.ADMIN_TOKEN,
        moduleName: 'pagesManager',
        moduleType: 'core',
        lane:       'admin'
      });

      pagesData = Array.isArray(res?.pages) ? res.pages
                : Array.isArray(res)        ? res
                : [];
      pagesData = pagesData.filter(p => p.slug?.startsWith('pages/'));

      sortAndRender('alpha');         // default sort
    } catch (err) {
      console.error('[pagesMenu] Cannot fetch pages:', err);
    }
  }

  /* ---------- rendering ---------- */
  function render(items) {
    list.innerHTML = items.map(p => `
        <li data-updated="${p.updated_at || ''}" data-hits="${p.hits || 0}">
          <a href="/admin/${p.slug}">${p.title}</a>
        </li>`
    ).join('');

    // Empty-state toggle
    const isEmpty = items.length === 0;
    menu.classList.toggle('empty', isEmpty);
    if (emptyHint) emptyHint.style.display = isEmpty ? 'block' : 'none';
  }

  /* ---------- sorting ---------- */
  function sortAndRender(method) {
    const data = [...pagesData];
    switch (method) {
      case 'recent':
        data.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        break;
      case 'freq':
        data.sort((a, b) => (b.hits || 0) - (a.hits || 0));
        break;
      default: // alphabetical
        data.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    render(data);
  }

  /* ---------- UI events ---------- */
  // burger toggles sidebar
  toggle.addEventListener('click', () => {
    menu.classList.toggle('open');
    toggle.classList.add('spin');
    setTimeout(() => toggle.classList.remove('spin'), 300);
  });

  // arrow-right closes sidebar (triggers the same handler)
  if (closeBtn) {
    closeBtn.addEventListener('click', () => toggle.click());
  }

  // filter dropdown
  if (filterBtn && dropdown) {
    filterBtn.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    document.addEventListener('click', e => {
      if (!dropdown.contains(e.target) && e.target !== filterBtn) {
        dropdown.classList.remove('open');
      }
    });

    dropdown.querySelectorAll('button').forEach(btn =>
      btn.addEventListener('click', () => {
        sortAndRender(btn.dataset.sort);
        dropdown.classList.remove('open');
      })
    );
  }

  // auto-open on /admin/home if viewport ≥ 1024 px
  if (window.location.pathname === '/admin/home' && window.innerWidth >= 1024) {
    menu.classList.add('open');
  }

  loadPages();
}

/* ---------- bootstrap ---------- */
document.addEventListener('pages-menu-loaded', initPagesMenu);
document.addEventListener('DOMContentLoaded',        initPagesMenu); // fallback
