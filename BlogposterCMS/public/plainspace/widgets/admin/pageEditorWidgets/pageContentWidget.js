export async function render(el) {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;
  const page = await window.pageDataPromise;
  if (!jwt || !page) {
    el.innerHTML = '<p>Missing credentials or page id.</p>';
    return;
  }

  const { sanitizeHtml } = await import(
    /* webpackIgnore: true */ '/apps/plainspace/editor/core/sanitizer.js'
  );

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

  function renderList() {
    listEl.innerHTML = '';
    const hasLayout = !!page.meta?.layoutTemplate;
    const hasHtml = !!page.html;

    if (!hasLayout && !hasHtml) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No content attached.';
      listEl.appendChild(empty);
      return;
    }

    function addItem(label, removeHandler) {
      const li = document.createElement('li');
      li.className = 'content-item';
      const title = document.createElement('span');
      title.className = 'content-title';
      title.textContent = label;
      const remove = document.createElement('img');
      remove.src = '/assets/icons/trash.svg';
      remove.className = 'icon delete-content-btn';
      remove.alt = 'Remove';
      remove.title = 'Detach content';
      remove.addEventListener('click', removeHandler);
      li.appendChild(title);
      li.appendChild(remove);
      listEl.appendChild(li);
    }

    if (hasLayout) {
      addItem(`Design: ${page.meta.layoutTemplate}`, async e => {
        e.stopPropagation();
        if (!confirm('Remove attached design?')) return;
        const newMeta = { ...(page.meta || {}) };
        delete newMeta.layoutTemplate;
        try {
          await meltdownEmit('updatePage', {
            jwt,
            moduleName: 'pagesManager',
            moduleType: 'core',
            pageId: page.id,
            slug: page.slug,
            status: page.status,
            seo_image: page.seo_image || '',
            parent_id: page.parent_id,
            is_content: page.is_content,
            lane: page.lane,
            language: page.language,
            title: page.title,
            translations: [{
              language: page.language,
              title: page.title,
              html: page.html || '',
              css: page.css || ''
            }],
            meta: newMeta
          });
          page.meta = newMeta;
          if (window.pageDataLoader) {
            window.pageDataLoader.clear('getPageById', { moduleName: 'pagesManager', moduleType: 'core', pageId: page.id });
          }
          renderList();
        } catch (err) {
          alert('Failed to detach design: ' + err.message);
        }
      });
    }

    if (hasHtml) {
      addItem('HTML Attachment', async e => {
        e.stopPropagation();
        if (!confirm('Remove uploaded HTML?')) return;
        try {
          await meltdownEmit('updatePage', {
            jwt,
            moduleName: 'pagesManager',
            moduleType: 'core',
            pageId: page.id,
            slug: page.slug,
            status: page.status,
            seo_image: page.seo_image || '',
            parent_id: page.parent_id,
            is_content: page.is_content,
            lane: page.lane,
            language: page.language,
            title: page.title,
            translations: [{
              language: page.language,
              title: page.title,
              html: '',
              css: page.css || ''
            }],
            meta: { ...(page.meta || {}) }
          });
          page.html = '';
          if (window.pageDataLoader) {
            window.pageDataLoader.clear('getPageById', { moduleName: 'pagesManager', moduleType: 'core', pageId: page.id });
          }
          renderList();
        } catch (err) {
          alert('Failed to detach HTML: ' + err.message);
        }
      });
    }
  }

  async function handleFile(file) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const html = sanitizeHtml(ev.target.result);
      if (page.html || page.meta?.layoutTemplate) {
        const ok = confirm('Replace existing attached content?');
        if (!ok) return;
      }
      const newMeta = { ...(page.meta || {}) };
      delete newMeta.layoutTemplate;
      try {
        await meltdownEmit('updatePage', {
          jwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          pageId: page.id,
          slug: page.slug,
          status: page.status,
          seo_image: page.seo_image || '',
          parent_id: page.parent_id,
          is_content: page.is_content,
          lane: page.lane,
          language: page.language,
          title: page.title,
          translations: [{
            language: page.language,
            title: page.title,
            html,
            css: page.css || ''
          }],
          meta: newMeta
        });
        if (window.pageDataLoader) {
          window.pageDataLoader.clear('getPageById', { moduleName: 'pagesManager', moduleType: 'core', pageId: page.id });
        }
        page.html = html;
        page.meta = newMeta;
        renderList();
      } catch (err) {
        alert('Failed to add content: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  const layoutMenu = document.createElement('div');
  layoutMenu.className = 'layout-select-menu';
  layoutMenu.style.display = 'none';
  document.body.appendChild(layoutMenu);

  async function attachDesign() {
    let templates = [];
    try {
      const res = await meltdownEmit('getLayoutTemplateNames', {
        jwt,
        moduleName: 'plainspace',
        moduleType: 'core',
        lane: page.lane
      });
      templates = Array.isArray(res?.templates)
        ? res.templates.filter(t => !t.isGlobal).map(t => t.name)
        : [];
    } catch (err) {
      console.warn('Failed to fetch layouts', err);
    }
    if (!templates.length) {
      alert('No layouts available');
      return;
    }

    layoutMenu.innerHTML = '';
    const select = document.createElement('select');
    select.dataset.enhance = 'dropdown';
    templates.forEach(name => {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      select.appendChild(o);
    });
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'confirm-layout-btn';
    confirmBtn.textContent = 'Attach';
    layoutMenu.appendChild(select);
    layoutMenu.appendChild(confirmBtn);

    const { default: enhanceSelects } = await import('/assets/js/customSelect.js');
    enhanceSelects();

    function closeMenu() {
      layoutMenu.style.display = 'none';
      document.removeEventListener('click', outside);
    }
    function outside(e) {
      if (!layoutMenu.contains(e.target)) closeMenu();
    }

    layoutMenu.style.visibility = 'hidden';
    const rect = addBtn.getBoundingClientRect();
    layoutMenu.style.top = `${rect.bottom + 4}px`;
    layoutMenu.style.left = `${rect.left}px`;
    layoutMenu.style.display = 'block';
    layoutMenu.style.visibility = '';
    document.addEventListener('click', outside);

    confirmBtn.addEventListener('click', async () => {
      const name = select.value;
      closeMenu();
      if (!name) return;
      if (page.html || page.meta?.layoutTemplate) {
        const ok = confirm('Replace existing attached content?');
        if (!ok) return;
      }
      const newMeta = { ...(page.meta || {}), layoutTemplate: name };
      try {
        await meltdownEmit('updatePage', {
          jwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          pageId: page.id,
          slug: page.slug,
          status: page.status,
          seo_image: page.seo_image || '',
          parent_id: page.parent_id,
          is_content: page.is_content,
          lane: page.lane,
          language: page.language,
          title: page.title,
          translations: [{
            language: page.language,
            title: page.title,
            html: '',
            css: page.css || ''
          }],
          meta: newMeta
        });
        if (window.pageDataLoader) {
          window.pageDataLoader.clear('getPageById', { moduleName: 'pagesManager', moduleType: 'core', pageId: page.id });
        }
        page.meta = newMeta;
        page.html = '';
        renderList();
      } catch (err) {
        alert('Failed to attach design: ' + err.message);
      }
    }, { once: true });
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
  renderList();
}
