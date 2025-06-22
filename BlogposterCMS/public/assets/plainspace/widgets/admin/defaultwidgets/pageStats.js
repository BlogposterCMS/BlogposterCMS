// public/assets/admin/defaulwidgets/pageStats.js
export async function render(el) {
  try {
    const jwt = window.ADMIN_TOKEN;

    const [publicRes, adminRes] = await Promise.all([
      meltdownEmit('getPagesByLane', {
        jwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        lane: 'public'
      }),
      meltdownEmit('getPagesByLane', {
        jwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        lane: 'admin'
      })
    ]);

    const toArr = r => (Array.isArray(r) ? r : r?.data ?? []);
    const publicPages = toArr(publicRes);
    const adminPages = toArr(adminRes);

    const total = publicPages.length + adminPages.length;
    const published = publicPages.filter(p => p.status === 'published').length;
    const draft = publicPages.filter(p => p.status === 'draft').length;
    const adminCount = adminPages.length;

    el.innerHTML = `
      <div class="page-stats-widget">
        <h3>Page Statistics</h3>
        <ul>
          <li>Total Pages: ${total}</li>
          <li>Public Published: ${published}</li>
          <li>Public Drafts: ${draft}</li>
          <li>Admin Pages: ${adminCount}</li>
        </ul>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="error">Error loading stats: ${err.message}</div>`;
  }
}
  