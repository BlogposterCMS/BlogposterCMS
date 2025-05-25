// /assets/plainSpace/admin/pagePicker.js
;(async () => {
  // Use the global emitter function, not an import
  const meltdownEmit = window.meltdownEmit;
  const jwt         = window.ADMIN_TOKEN;         // injected by your Express route

  // GridStack target
  const grid = GridStack.init({
    cellHeight: 5,
    float:      false,
    disableResize: true
  }, '#pagePickerGrid');

  // 1) load & render all public pages
  async function loadPages() {
    const { pages = [] } = await meltdownEmit('getPagesByLane', {
      jwt,
      moduleName : 'pagesManager',
      moduleType : 'core',
      lane       : 'public'
    });

    grid.removeAll();  // clear existing items

    pages.forEach((p, idx) => {
      const item = document.createElement('div');
      item.classList.add('grid-stack-item');
      item.setAttribute('gs-x', 0);
      item.setAttribute('gs-y', idx);
      item.setAttribute('gs-w', 4);
      item.setAttribute('gs-h', 1);
      item.dataset.pageId = p.pageId;

      const content = document.createElement('div');
      content.classList.add('grid-stack-item-content');
      content.innerHTML = `
        <strong>${p.title}</strong>
        <span style="float:right">
          <a href="/${p.slug}" target="_blank">view</a> |
          <a href="/admin/${p.slug}">edit</a>
        </span>
      `;
      item.appendChild(content);

      grid.addWidget(item);
    });
  }

  // 2) persist new order on move
  grid.on('change', (_event, items) => {
    items
      .sort((a, b) => a.y - b.y)
      .forEach((i, idx) => {
        meltdownEmit('updatePage', {
          jwt,
          moduleName : 'pagesManager',
          moduleType : 'core',
          pageId     : Number(i.el.dataset.pageId),
          newOrder   : idx
        }).catch(err => console.error('order save failed', err));
      });
  });

  // 3) create & redirect
  async function createPage() {
    const title = prompt('New page title:');
    if (!title) return;
    const slug = prompt('Slug (optional):') || '';
    try {
      const { pageId } = await meltdownEmit('createPage', {
        jwt,
        moduleName : 'pagesManager',
        moduleType : 'core',
        title,
        slug,
        lane   : 'public',
        status : 'published'
      });
      await loadPages();
      // fetch the slug back to redirect
      const { data: page } = await meltdownEmit('getPageById', {
        jwt,
        moduleName : 'pagesManager',
        moduleType : 'core',
        pageId
      });
      location.href = `/admin/${page.slug}`;
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // 4) wire up new-page button & initial load
  document.getElementById('newPageBtn').addEventListener('click', createPage);
  await loadPages();
})();
