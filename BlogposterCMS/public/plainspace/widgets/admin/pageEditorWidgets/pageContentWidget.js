export async function render(el) {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;
  const page = await window.pageDataPromise;
  if (!jwt || !page) {
    el.innerHTML = '<p>Missing credentials or page id.</p>';
    return;
  }

  const { sanitizeHtml } = await import('../../../builder/editor/editor.js');

  const wrapper = document.createElement('div');
  wrapper.className = 'page-content-widget';

  const titleBar = document.createElement('div');
  titleBar.className = 'content-title-bar';
  const titleEl = document.createElement('div');
  titleEl.className = 'content-title';
  titleEl.textContent = 'Page Content';
  const addBtn = document.createElement('img');
  addBtn.src = '/assets/icons/plus.svg';
  addBtn.alt = 'Add content';
  addBtn.title = 'Attach HTML content';
  addBtn.className = 'icon add-content-btn';

  titleBar.appendChild(titleEl);
  titleBar.appendChild(addBtn);
  wrapper.appendChild(titleBar);

  const listEl = document.createElement('ul');
  listEl.className = 'content-list';
  wrapper.appendChild(listEl);

  async function loadContent() {
    try {
      const res = await meltdownEmit('getChildPages', {
        jwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        parentId: page.id
      });
      const items = Array.isArray(res) ? res : (res?.data ?? []);
      return items.filter(i => i.is_content);
    } catch (err) {
      console.error('Load content failed', err);
      return [];
    }
  }

  function renderList(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No content attached.';
      listEl.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'content-item';
      li.textContent = item.title || item.slug;
      li.addEventListener('click', () => {
        window.open(`/admin/${item.slug}`, '_blank');
      });
      listEl.appendChild(li);
    });
  }

  async function handleFile(file) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const html = sanitizeHtml(ev.target.result);
      const base = file.name.replace(/\.[^.]+$/, '');
      try {
        await meltdownEmit('createPage', {
          jwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          title: base,
          slug: base,
          lane: page.lane,
          parent_id: page.id,
          is_content: true,
          language: page.language,
          translations: [{
            language: page.language,
            title: base,
            html,
            css: ''
          }]
        });
        renderList(await loadContent());
      } catch (err) {
        alert('Failed to add content: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  addBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,text/html';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (file) handleFile(file);
    });
    input.click();
  });

  el.innerHTML = '';
  el.appendChild(wrapper);
  renderList(await loadContent());
}
