import { sanitizeSlug } from './pageList/pageService.js';
import {
  type DesignRecord,
  type PageRecord,
  createDraftDesign,
  decodeAdminId,
  fetchContentDesigns,
  fetchUploadedContentPages
} from './contentSummaryData.js';

export async function render(el: HTMLElement | null): Promise<void> {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN;
  if (!el) return;

  let templates: DesignRecord[] = [];
  try {
    if (typeof meltdownEmit !== 'function') throw new Error('meltdownEmit unavailable');
    templates = await fetchContentDesigns(meltdownEmit, jwt);
  } catch (err) {
    console.warn('[ContentSummaryWidget] failed to load designs', err);
  }

  let uploads: PageRecord[] = [];
  try {
    if (typeof meltdownEmit !== 'function') throw new Error('meltdownEmit unavailable');
    uploads = await fetchUploadedContentPages(meltdownEmit, jwt);
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

  addBtn.addEventListener('click', async () => {
    const ownerId = decodeAdminId(jwt);
    addBtn.classList.add('is-loading');
    addBtn.style.pointerEvents = 'none';

    try {
      if (typeof meltdownEmit !== 'function') throw new Error('meltdownEmit unavailable');
      const newId = await createDraftDesign(meltdownEmit, jwt, ownerId);
      if (newId) {
        window.location.href = `/admin/app/designer/${encodeURIComponent(String(newId))}`;
        return;
      }
    } catch (err) {
      console.warn('[ContentSummaryWidget] failed to create design', err);
      alert('Failed to create a new design. Opening the designer without a template.');
    } finally {
      addBtn.classList.remove('is-loading');
      addBtn.style.pointerEvents = '';
    }

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

  function createItem(template: DesignRecord): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'layout-gallery-item';
    item.addEventListener('click', () => {
      const designId = sanitizeSlug(template.id);
      if (!designId) return;
      window.open(`/admin/app/designer/${encodeURIComponent(designId)}`, '_blank');
    });

    const img = document.createElement('img');
    img.className = 'layout-gallery-preview';
    img.alt = `${template.title || 'Untitled'} preview`;
    img.src = template.thumbnail || '/assets/icons/file.svg';

    const span = document.createElement('span');
    span.className = 'layout-gallery-name';
    span.textContent = template.title || 'Untitled';

    item.appendChild(img);
    item.appendChild(span);
    return item;
  }

  if (templates.length) {
    templates.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    templates.forEach(template => designList.appendChild(createItem(template)));
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No designs found.';
    designList.appendChild(empty);
  }

  function renderUploads(): void {
    uploadList.innerHTML = '';
    if (uploads.length) {
      uploads.forEach(upload => {
        const item = document.createElement('div');
        item.className = 'layout-gallery-item';
        item.addEventListener('click', () => {
          window.open(`/admin/${upload.slug || ''}`, '_blank');
        });

        const span = document.createElement('span');
        span.className = 'layout-gallery-name';
        span.textContent = upload.title || upload.slug || 'Untitled';

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
