import { sanitizeSlug } from './pageList/pageService.js';

export async function render(el) {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN;

  let templates = [];
  try {
    const res = await meltdownEmit('designer.listDesigns', {
      jwt,
      moduleName: 'designer',
      moduleType: 'community'
    });
    templates = Array.isArray(res?.designs) ? res.designs : [];
  } catch (err) {
    console.warn('[ContentSummaryWidget] failed to load designs', err);
  }

  let uploads = [];
  try {
    const res = await meltdownEmit('getAllPages', {
      jwt,
      moduleName: 'pagesManager',
      moduleType: 'core'
    });
    const pages = Array.isArray(res) ? res : (res?.data ?? []);
    uploads = pages.filter(p => p.is_content && !p.meta?.layoutTemplate && p.lane === 'public');
  } catch (err) {
    console.warn('[ContentSummaryWidget] failed to load uploads', err);
  }

  el.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'layout-gallery-card';

  const titleBar = document.createElement('div');
  titleBar.className = 'layout-gallery-title-bar';

  const title = document.createElement('div');
  title.className = 'layout-gallery-title';
  title.textContent = 'Your Content';

  const tabs = document.createElement('div');
  tabs.className = 'widget-tabs';
  const tabDesigns = document.createElement('button');
  tabDesigns.className = 'widget-tab active';
  tabDesigns.textContent = 'Designs';
  const tabUploads = document.createElement('button');
  tabUploads.className = 'widget-tab';
  tabUploads.textContent = 'Uploaded';
  tabs.appendChild(tabDesigns);
  tabs.appendChild(tabUploads);

  const addBtn = document.createElement('img');
  addBtn.src = '/assets/icons/plus.svg';
  addBtn.alt = 'Add design';
  addBtn.title = 'Create new design';
  addBtn.className = 'icon add-layout-btn';
  addBtn.addEventListener('click', () => {
    window.location.href = '/admin/app/designer';
  });

  const rightWrap = document.createElement('div');
  rightWrap.className = 'layout-title-actions';
  rightWrap.appendChild(tabs);
  rightWrap.appendChild(addBtn);

  titleBar.appendChild(title);
  titleBar.appendChild(rightWrap);
  card.appendChild(titleBar);

  const designList = document.createElement('div');
  designList.className = 'layout-gallery';

  const uploadList = document.createElement('div');
  uploadList.className = 'layout-gallery uploaded-gallery';
  uploadList.style.display = 'none';

  function createItem(t) {
    const item = document.createElement('div');
    item.className = 'layout-gallery-item';
    item.addEventListener('click', () => {
      const designId = sanitizeSlug(t.id);
      if (!designId) return;
      window.open(`/admin/app/designer/${encodeURIComponent(designId)}`, '_blank');
    });

    const img = document.createElement('img');
    img.className = 'layout-gallery-preview';
    img.alt = `${t.title} preview`;
    img.src = t.thumbnail || '/assets/icons/file.svg';

    const span = document.createElement('span');
    span.className = 'layout-gallery-name';
    span.textContent = t.title;

    item.appendChild(img);
    item.appendChild(span);
    return item;
  }

  if (templates.length) {
    templates.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    templates.forEach(t => designList.appendChild(createItem(t)));
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No designs found.';
    designList.appendChild(empty);
  }

  function renderUploads() {
    uploadList.innerHTML = '';
    if (uploads.length) {
      uploads.forEach(u => {
        const item = document.createElement('div');
        item.className = 'layout-gallery-item';
        item.addEventListener('click', () => {
          window.open(`/admin/${u.slug}`, '_blank');
        });

        const span = document.createElement('span');
        span.className = 'layout-gallery-name';
        span.textContent = u.title || u.slug;

        item.appendChild(span);
        uploadList.appendChild(item);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No uploads found.';
      uploadList.appendChild(empty);
    }
  }

  renderUploads();

  card.appendChild(designList);
  card.appendChild(uploadList);
  el.appendChild(card);

  tabDesigns.addEventListener('click', () => {
    tabDesigns.classList.add('active');
    tabUploads.classList.remove('active');
    designList.style.display = '';
    uploadList.style.display = 'none';
  });

  tabUploads.addEventListener('click', () => {
    tabUploads.classList.add('active');
    tabDesigns.classList.remove('active');
    uploadList.style.display = '';
    designList.style.display = 'none';
  });
}

