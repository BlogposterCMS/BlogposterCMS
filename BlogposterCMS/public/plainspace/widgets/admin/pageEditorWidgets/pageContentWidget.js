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
  addBtn.title = 'Attach content';
  addBtn.className = 'icon add-content-btn';

  const addMenu = document.createElement('div');
  addMenu.className = 'content-add-menu';
  addMenu.innerHTML = `
    <button class="menu-layout"><img src="/assets/icons/layout.svg" class="icon" alt="layout" /> Attach Design</button>
    <button class="menu-upload"><img src="/assets/icons/upload.svg" class="icon" alt="upload" /> Upload HTML</button>
  `;
  addMenu.style.display = 'none';
  document.body.appendChild(addMenu);

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
      const title = document.createElement('span');
      title.className = 'content-title';
      title.textContent = item.title || item.slug;
      title.addEventListener('click', () => {
        window.open(`/admin/${item.slug}`, '_blank');
      });

      const remove = document.createElement('img');
      remove.src = '/assets/icons/trash.svg';
      remove.className = 'icon delete-content-btn';
      remove.alt = 'Remove';
      remove.title = 'Detach content';
      remove.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Detach this content?')) return;
        try {
          await meltdownEmit('setAsDeleted', {
            jwt,
            moduleName: 'pagesManager',
            moduleType: 'core',
            pageId: item.id
          });
          renderList(await loadContent());
        } catch (err) {
          alert('Failed to detach content: ' + err.message);
        }
      });

      li.appendChild(title);
      li.appendChild(remove);
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

  async function attachDesign() {
    let templates = [];
    try {
      const res = await meltdownEmit('getLayoutTemplateNames', {
        jwt,
        moduleName: 'plainspace',
        moduleType: 'core',
        lane: page.lane
      });
      templates = Array.isArray(res?.templates) ? res.templates.map(t => t.name) : [];
    } catch (err) {
      console.warn('Failed to fetch layouts', err);
    }
    const name = prompt('Select or enter layout name:\n' + templates.join('\n'), templates[0] || '');
    if (!name) return;
    try {
      await meltdownEmit('createPage', {
        jwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        title: name,
        slug: name.replace(/\s+/g, '-').toLowerCase(),
        lane: page.lane,
        parent_id: page.id,
        is_content: true,
        language: page.language,
        meta: { layoutTemplate: name },
        translations: [{ language: page.language, title: name, html: '', css: '' }]
      });
      renderList(await loadContent());
    } catch (err) {
      alert('Failed to attach design: ' + err.message);
    }
  }

  function hideMenu() {
    addMenu.style.display = 'none';
    document.removeEventListener('click', outsideHandler);
  }

  function outsideHandler(e) {
    if (!addMenu.contains(e.target) && e.target !== addBtn) hideMenu();
  }

  addBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (addMenu.style.display === 'block') { hideMenu(); return; }
    addMenu.style.display = 'block';
    addMenu.style.visibility = 'hidden';
    const rect = addBtn.getBoundingClientRect();
    addMenu.style.top = `${rect.bottom + 4}px`;
    addMenu.style.left = `${rect.left}px`;
    addMenu.style.visibility = '';
    document.addEventListener('click', outsideHandler);
  });

  addMenu.querySelector('.menu-upload').addEventListener('click', () => {
    hideMenu();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,text/html';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (file) handleFile(file);
    });
    input.click();
  });

  addMenu.querySelector('.menu-layout').addEventListener('click', async () => {
    hideMenu();
    await attachDesign();
  });

  el.innerHTML = '';
  el.appendChild(wrapper);
  renderList(await loadContent());
}
