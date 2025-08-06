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

  const common = {
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
    title: page.title
  };

  let builderApps = null;
  async function getBuilderApps() {
    if (builderApps !== null) return builderApps;
    try {
      const res = await meltdownEmit('listBuilderApps', {
        jwt,
        moduleName: 'appLoader',
        moduleType: 'core'
      });
      builderApps = Array.isArray(res?.apps) ? res.apps : [];
    } catch (err) {
      console.warn('Failed to fetch builder apps', err);
      builderApps = [];
    }
    return builderApps;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'page-content-widget';

  const titleBar = document.createElement('div');
  titleBar.className = 'content-title-bar';
  const titleEl = document.createElement('div');
  titleEl.className = 'content-title';
  titleEl.textContent = 'Page Content';
  const addBtn = document.createElement('img');
  addBtn.src = '/assets/icons/plus.svg';
  addBtn.alt = 'Upload HTML';
  addBtn.title = 'Upload HTML';
  addBtn.className = 'icon add-content-btn';
  titleBar.appendChild(titleEl);
  titleBar.appendChild(addBtn);
  wrapper.appendChild(titleBar);

  const selectedHeader = document.createElement('div');
  selectedHeader.className = 'section-title';
  selectedHeader.textContent = 'Attached Content';
  wrapper.appendChild(selectedHeader);

  const selectedWrap = document.createElement('ul');
  selectedWrap.className = 'selected-content';
  wrapper.appendChild(selectedWrap);

  const galleryHeader = document.createElement('div');
  galleryHeader.className = 'section-title';
  galleryHeader.textContent = 'Available Designs';
  wrapper.appendChild(galleryHeader);

  const gallery = document.createElement('ul');
  gallery.className = 'design-gallery';
  wrapper.appendChild(gallery);

  function createDesignCard(t, isSelected = false) {
    const li = document.createElement('li');
    li.className = 'design-card' + (isSelected ? ' selected' : '');

    const img = document.createElement('img');
    img.className = 'design-preview';
    img.alt = `${t.name} preview`;
    img.src = t.previewPath || '/assets/icons/file.svg';

    const name = document.createElement('div');
    name.className = 'design-name';
    name.textContent = t.name;

    li.appendChild(img);
    li.appendChild(name);

    if (isSelected) {
      const remove = document.createElement('img');
      remove.src = '/assets/icons/trash.svg';
      remove.className = 'icon delete-content-btn';
      remove.alt = 'Remove';
      remove.title = 'Detach content';
      remove.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Remove attached design?')) return;
        const newMeta = { ...(page.meta || {}) };
        delete newMeta.layoutTemplate;
        delete newMeta.htmlFileName;
        try {
          await meltdownEmit('updatePage', {
            ...common,
            translations: [{
              language: page.language,
              title: page.title,
              html: page.html || '',
              css: page.css || ''
            }],
            meta: newMeta
          });
          if (window.pageDataLoader) {
            window.pageDataLoader.clear('getPageById', { moduleName: 'pagesManager', moduleType: 'core', pageId: page.id });
          }
          page.meta = newMeta;
          renderSelected();
          renderGallery();
        } catch (err) {
          alert('Failed to detach design: ' + err.message);
        }
      });
      li.appendChild(remove);
    } else {
      li.addEventListener('click', async () => {
        if (page.html || page.meta?.layoutTemplate) {
          const ok = confirm('Replace existing attached content?');
          if (!ok) return;
        }
        const newMeta = { ...(page.meta || {}), layoutTemplate: t.name };
        delete newMeta.htmlFileName;
        try {
          await meltdownEmit('updatePage', {
            ...common,
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
          renderSelected();
          renderGallery();
        } catch (err) {
          alert('Failed to attach design: ' + err.message);
        }
      });
    }

    return li;
  }

  function createHtmlCard(name, html, isSelected = false) {
    const li = document.createElement('li');
    li.className = 'design-card html-card' + (isSelected ? ' selected' : '');

    const preview = document.createElement('div');
    preview.className = 'html-preview';
    preview.innerHTML = sanitizeHtml(html);

    const title = document.createElement('div');
    title.className = 'design-name';
    title.textContent = name;

    li.appendChild(preview);
    li.appendChild(title);

    if (isSelected) {
      const remove = document.createElement('img');
      remove.src = '/assets/icons/trash.svg';
      remove.className = 'icon delete-content-btn';
      remove.alt = 'Remove';
      remove.title = 'Detach content';
      remove.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Remove uploaded HTML?')) return;
        try {
          await meltdownEmit('updatePage', {
            ...common,
            translations: [{
              language: page.language,
              title: page.title,
              html: '',
              css: page.css || ''
            }],
            meta: { ...(page.meta || {}) }
          });
          if (window.pageDataLoader) {
            window.pageDataLoader.clear('getPageById', { moduleName: 'pagesManager', moduleType: 'core', pageId: page.id });
          }
          page.html = '';
          delete page.meta.htmlFileName;
          renderSelected();
          renderGallery();
        } catch (err) {
          alert('Failed to detach HTML: ' + err.message);
        }
      });
      li.appendChild(remove);
    }

    return li;
  }

  async function renderSelected() {
    selectedWrap.innerHTML = '';
    const hasLayout = !!page.meta?.layoutTemplate;
    const hasHtml = !!page.html;

    if (hasLayout) {
      const card = createDesignCard({
        name: page.meta.layoutTemplate,
        previewPath: page.meta.layoutPreviewPath || ''
      }, true);
      selectedWrap.appendChild(card);
    } else if (hasHtml) {
      const card = createHtmlCard(page.meta?.htmlFileName || 'HTML Attachment', page.html, true);
      selectedWrap.appendChild(card);
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No content attached.';
      selectedWrap.appendChild(empty);
    }
  }

  async function loadDesigns() {
    try {
      const res = await meltdownEmit('getLayoutTemplateNames', {
        jwt,
        moduleName: 'plainspace',
        moduleType: 'core',
        lane: page.lane
      });
      return Array.isArray(res?.templates)
        ? res.templates.filter(t => !t.isGlobal)
        : [];
    } catch (err) {
      console.warn('Failed to fetch layouts', err);
      return [];
    }
  }

  async function renderGallery() {
    gallery.innerHTML = '';
    const templates = (await loadDesigns()).filter(
      t => t.name !== page.meta?.layoutTemplate
    );
    if (!templates.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No designs available.';
      gallery.appendChild(empty);
      return;
    }
    templates.forEach(t => gallery.appendChild(createDesignCard(t)));
  }

  async function handleFile(file) {
    const reader = new FileReader();
    reader.onload = async ev => {
      const html = sanitizeHtml(ev.target.result);
      if (page.html || page.meta?.layoutTemplate) {
        const ok = confirm('Replace existing attached content?');
        if (!ok) return;
      }
      const newMeta = { ...(page.meta || {}), htmlFileName: file.name };
      delete newMeta.layoutTemplate;
      try {
        await meltdownEmit('updatePage', {
          ...common,
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
        renderSelected();
        renderGallery();
      } catch (err) {
        alert('Failed to add content: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  addBtn.addEventListener('click', async e => {
    e.stopPropagation();
    const existing = titleBar.querySelector('.content-upload-menu');
    if (existing) existing.remove();

    const menu = document.createElement('ul');
    menu.className = 'content-upload-menu';

    const uploadLi = document.createElement('li');
    uploadLi.textContent = 'Upload HTML';
    uploadLi.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.html,.htm,text/html';
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (file) handleFile(file);
      });
      input.click();
    });
    menu.appendChild(uploadLi);

    const builders = await getBuilderApps();
    builders.forEach(app => {
      const li = document.createElement('li');
      li.textContent = app.title || app.name;
      li.addEventListener('click', () => {
        window.location.href = `/admin/app/${encodeURIComponent(app.name)}/${page.id}`;
      });
      menu.appendChild(li);
    });

    titleBar.appendChild(menu);

    const close = () => {
      menu.remove();
      document.removeEventListener('click', close);
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  });

  el.innerHTML = '';
  el.appendChild(wrapper);
  renderSelected();
  renderGallery();
}

