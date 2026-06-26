import {
  asString,
  clearPageEditorCache,
  errorMessage,
  fetchPageEditorTemplates,
  savePageEditorPage,
  toPage,
  type TemplateRecord
} from './pageEditorData.js';

interface PageEditorWindow extends Window {
  saveCurrentPage?: () => Promise<void>;
}

export async function render(el: HTMLElement | null): Promise<void> {
  const meltdownEmit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN;
  const page = toPage(await window.pageDataPromise);
  if (!el) return;
  if (!jwt || !page || typeof meltdownEmit !== 'function') {
    el.innerHTML = '<p>Missing credentials or page id.</p>';
    return;
  }

  const container = document.createElement('div');
  container.className = 'page-editor-widget';

  const titleField = document.createElement('div');
  titleField.className = 'field';
  const titleInput = document.createElement('input');
  titleInput.id = 'pe-title';
  titleInput.type = 'text';
  titleInput.placeholder = ' ';
  titleInput.value = page.trans_title || page.title || '';
  const titleLabel = document.createElement('label');
  titleLabel.setAttribute('for', 'pe-title');
  titleLabel.textContent = 'Title';
  titleField.appendChild(titleInput);
  titleField.appendChild(titleLabel);

  const descField = document.createElement('div');
  descField.className = 'field';
  const descInput = document.createElement('textarea');
  descInput.id = 'pe-desc';
  descInput.placeholder = ' ';
  descInput.value = page.meta_desc || '';
  const descLabel = document.createElement('label');
  descLabel.setAttribute('for', 'pe-desc');
  descLabel.textContent = 'SEO Description';
  descField.appendChild(descInput);
  descField.appendChild(descLabel);

  const slugField = document.createElement('div');
  slugField.className = 'field';
  const slugInput = document.createElement('input');
  slugInput.id = 'pe-slug';
  slugInput.type = 'text';
  slugInput.placeholder = ' ';
  slugInput.value = page.slug || '';
  const slugLabel = document.createElement('label');
  slugLabel.setAttribute('for', 'pe-slug');
  slugLabel.textContent = 'Slug';
  slugField.appendChild(slugInput);
  slugField.appendChild(slugLabel);

  const statusField = document.createElement('div');
  statusField.className = 'field';
  const statusSelect = document.createElement('select');
  statusSelect.id = 'pe-status';
  ['published', 'draft', 'deleted'].forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    if (page.status === opt) o.selected = true;
    statusSelect.appendChild(o);
  });
  const statusLabel = document.createElement('label');
  statusLabel.setAttribute('for', 'pe-status');
  statusLabel.textContent = 'Status';
  statusField.appendChild(statusSelect);
  statusField.appendChild(statusLabel);

  const publishField = document.createElement('div');
  publishField.className = 'field';
  const publishInput = document.createElement('input');
  publishInput.id = 'pe-publish-at';
  publishInput.type = 'datetime-local';
  publishInput.placeholder = ' ';
  publishInput.value = asString(page.meta?.publish_at);
  const publishLabel = document.createElement('label');
  publishLabel.setAttribute('for', 'pe-publish-at');
  publishLabel.textContent = 'Publish at';
  publishField.appendChild(publishInput);
  publishField.appendChild(publishLabel);

  const layoutField = document.createElement('div');
  layoutField.className = 'field';
  const layoutSelect = document.createElement('select');
  layoutSelect.id = 'pe-layout';
  let templates: TemplateRecord[] = [];
  try {
    templates = await fetchPageEditorTemplates(meltdownEmit, jwt, page.lane);
  } catch (err) {
    console.warn('Could not fetch layout templates', err);
  }
  if (!templates.length) templates = [{ name: 'default' }];
  templates.forEach(template => {
    const name = template.name || '';
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    if ((page.meta?.layoutTemplate || '') === name) o.selected = true;
    layoutSelect.appendChild(o);
  });
  const layoutLabel = document.createElement('label');
  layoutLabel.setAttribute('for', 'pe-layout');
  layoutLabel.textContent = 'Layout';
  layoutField.appendChild(layoutSelect);
  layoutField.appendChild(layoutLabel);

  const imageField = document.createElement('div');
  imageField.className = 'field';
  const imageInput = document.createElement('input');
  imageInput.id = 'pe-image';
  imageInput.type = 'text';
  imageInput.placeholder = ' ';
  imageInput.value = page.seo_image || '';
  const imageLabel = document.createElement('label');
  imageLabel.setAttribute('for', 'pe-image');
  imageLabel.textContent = 'SEO Image URL';
  imageField.appendChild(imageInput);
  imageField.appendChild(imageLabel);

  container.appendChild(titleField);
  container.appendChild(descField);
  container.appendChild(slugField);
  container.appendChild(statusField);
  container.appendChild(publishField);
  container.appendChild(layoutField);
  container.appendChild(imageField);

  el.innerHTML = '';
  el.appendChild(container);

  (window as PageEditorWindow).saveCurrentPage = async function saveCurrentPage(): Promise<void> {
    try {
      await savePageEditorPage(meltdownEmit, jwt, page, {
        title: titleInput.value,
        seoDesc: descInput.value,
        status: statusSelect.value,
        slug: slugInput.value,
        publishAt: publishInput.value,
        layoutName: layoutSelect.value,
        seoImage: imageInput.value
      });
      clearPageEditorCache(window.pageDataLoader, page);
      alert('Saved');
    } catch (err) {
      console.error('Save failed', err);
      alert(`Error: ${errorMessage(err)}`);
    }
  };

  document.dispatchEvent(new CustomEvent('content-header-loaded'));
}
