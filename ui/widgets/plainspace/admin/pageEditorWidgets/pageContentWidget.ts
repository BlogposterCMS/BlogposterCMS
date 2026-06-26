import { sanitizeSlug } from '../defaultwidgets/pageList/pageService.js';
import { sanitizeHtml } from '../../../../shared/sanitize/sanitizer.js';
import {
  attachDesignMeta,
  attachHtmlMeta,
  clearPageContentCache,
  detachDesignMeta,
  detachHtmlMeta,
  errorMessage,
  fetchBuilderApps,
  fetchHtmlFile,
  fetchPublishedDesigns,
  listHtmlFiles,
  savePageContent,
  toPage,
  uploadHtmlFile,
  type BuilderApp,
  type DesignRecord
} from './pageContentData.js';

export async function render(el: HTMLElement | null): Promise<void> {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;
  const pageCandidate = toPage(await window.pageDataPromise);
  if (!el) return;
  if (!jwt || !pageCandidate || typeof meltdownEmit !== 'function') {
    el.innerHTML = '<p>Missing credentials or page id.</p>';
    return;
  }
  const page = pageCandidate;
  page.meta ??= {};

  let builderApps: BuilderApp[] | null = null;
  async function getBuilderApps(): Promise<BuilderApp[]> {
    if (builderApps !== null) return builderApps;
    try {
      builderApps = await fetchBuilderApps(meltdownEmit, jwt);
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

  function clearPageDataCache(): void {
    clearPageContentCache(window.pageDataLoader, page);
  }

  function createDesignCard(template: DesignRecord, isSelected = false): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'design-card' + (isSelected ? ' selected' : '');

    const img = document.createElement('img');
    img.className = 'design-preview';
    img.alt = `${template.title || 'Design'} preview`;
    img.src = template.thumbnail || '/assets/icons/file.svg';

    const name = document.createElement('div');
    name.className = 'design-name';
    name.textContent = template.title || 'Design';

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
        const newMeta = detachDesignMeta(page);
        try {
          await savePageContent(meltdownEmit, jwt, page, { html: page.html || '', meta: newMeta });
          clearPageDataCache();
          page.meta = newMeta;
          renderSelected();
          renderGallery();
        } catch (err) {
          alert(`Failed to detach design: ${errorMessage(err)}`);
        }
      });
      li.appendChild(remove);
    } else {
      li.addEventListener('click', async () => {
        if (page.html || page.meta?.designId) {
          const ok = confirm('Replace existing attached content?');
          if (!ok) return;
        }
        const newMeta = attachDesignMeta(page, template);
        try {
          await savePageContent(meltdownEmit, jwt, page, { html: '', meta: newMeta });
          clearPageDataCache();
          page.meta = newMeta;
          page.html = '';
          renderSelected();
          renderGallery();
        } catch (err) {
          alert(`Failed to attach design: ${errorMessage(err)}`);
        }
      });
    }

    return li;
  }

  function createHtmlCard(name: string, html: string, isSelected = false): HTMLLIElement {
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
        const newMeta = detachHtmlMeta(page);
        try {
          await savePageContent(meltdownEmit, jwt, page, { html: '', meta: newMeta });
          clearPageDataCache();
          page.html = '';
          page.meta = newMeta;
          renderSelected();
          renderGallery();
        } catch (err) {
          alert(`Failed to detach HTML: ${errorMessage(err)}`);
        }
      });
      li.appendChild(remove);
    } else {
      li.addEventListener('click', async () => {
        if (page.html || page.meta?.designId) {
          const ok = confirm('Replace existing attached content?');
          if (!ok) return;
        }
        try {
          const fileHtml = sanitizeHtml(await fetchHtmlFile(fetch, name));
          const newMeta = attachHtmlMeta(page, name);
          await savePageContent(meltdownEmit, jwt, page, { html: fileHtml, meta: newMeta });
          clearPageDataCache();
          page.html = fileHtml;
          page.meta = newMeta;
          renderSelected();
          renderGallery();
        } catch (err) {
          alert(`Failed to attach HTML: ${errorMessage(err)}`);
        }
      });
    }

    return li;
  }

  function renderSelected(): void {
    selectedWrap.innerHTML = '';
    const hasLayout = Boolean(page.meta?.designId);
    const hasHtml = Boolean(page.html);

    if (hasLayout) {
      const card = createDesignCard({
        id: page.meta?.designId,
        title: page.meta?.designTitle || 'Design',
        thumbnail: page.meta?.designThumbnail || ''
      }, true);
      selectedWrap.appendChild(card);
    } else if (hasHtml) {
      const card = createHtmlCard(page.meta?.htmlFileName || 'HTML Attachment', page.html || '', true);
      selectedWrap.appendChild(card);
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No content attached.';
      selectedWrap.appendChild(empty);
    }
  }

  async function loadDesigns(): Promise<DesignRecord[]> {
    try {
      return fetchPublishedDesigns(meltdownEmit, jwt);
    } catch (err) {
      console.warn('Failed to fetch designs', err);
      return [];
    }
  }

  async function loadHtmlFiles(): Promise<string[]> {
    try {
      return listHtmlFiles(meltdownEmit, jwt);
    } catch (err) {
      console.warn('Failed to list HTML files', err);
      return [];
    }
  }

  async function renderGallery(): Promise<void> {
    gallery.innerHTML = '';
    const templates = (await loadDesigns()).filter(
      template => template.id !== page.meta?.designId
    );
    const htmlFiles = (await loadHtmlFiles()).filter(
      file => file !== page.meta?.htmlFileName
    );
    if (!templates.length && !htmlFiles.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No designs available.';
      gallery.appendChild(empty);
      return;
    }
    templates.forEach(template => gallery.appendChild(createDesignCard(template)));
    for (const name of htmlFiles) {
      try {
        const html = await fetchHtmlFile(fetch, name);
        gallery.appendChild(createHtmlCard(name, html));
      } catch (err) {
        console.warn('Failed to load HTML file', name, err);
      }
    }
  }

  async function handleFile(file: File): Promise<void> {
    if (!/\.html?$/i.test(file.name)) {
      alert('Only HTML files are allowed.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async ev => {
      const html = sanitizeHtml(String(ev.target?.result || ''));
      if (page.html || page.meta?.designId) {
        const ok = confirm('Replace existing attached content?');
        if (!ok) return;
      }
      let savedName = file.name;
      try {
        savedName = await uploadHtmlFile(meltdownEmit, jwt, file.name, html);
      } catch (err) {
        alert(`Failed to save file: ${errorMessage(err)}`);
        return;
      }
      const newMeta = attachHtmlMeta(page, savedName);
      try {
        await savePageContent(meltdownEmit, jwt, page, { html, meta: newMeta });
        clearPageDataCache();
        page.html = html;
        page.meta = newMeta;
        renderSelected();
        renderGallery();
      } catch (err) {
        alert(`Failed to add content: ${errorMessage(err)}`);
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
        const file = input.files?.[0];
        if (file) void handleFile(file);
      });
      input.click();
    });
    menu.appendChild(uploadLi);

    const builders = await getBuilderApps();
    builders.forEach(app => {
      const li = document.createElement('li');
      li.textContent = app.title || app.name;
      li.addEventListener('click', () => {
        const base = `/admin/app/${encodeURIComponent(app.name)}`;
        let targetId: string | number | undefined = page.id;
        if (app.name === 'designer') {
          const did = sanitizeSlug(page.meta?.designId || '');
          targetId = did || '';
        }
        window.location.href = targetId ? `${base}/${encodeURIComponent(String(targetId))}` : base;
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
  void renderGallery();
}
