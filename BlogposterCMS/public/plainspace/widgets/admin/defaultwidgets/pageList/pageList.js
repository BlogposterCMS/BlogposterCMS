import { getDesignerAppName } from '../../../../utils.js';
import { bpDialog } from '/assets/js/bpDialog.js';
import { pageService, sanitizeSlug } from './pageService.js';

const escapeHtml = str => {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  map['"'] = '&quot;';
  map["'"] = '&#39;';
  return String(str).replace(/[&<>"']/g, c => map[c]);
};

const debounce = (fn, delay = 400) => {
  let timer;
  const wrapper = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), delay);
  };
  wrapper.cancel = () => clearTimeout(timer);
  return wrapper;
};

export async function fetchPages() {
  return pageService.getAll();
}

export function filterPages(pages, filter) {
  switch (filter) {
    case 'Active':
      return pages.filter(p => p.status === 'published');
    case 'Drafts':
      return pages.filter(p => p.status === 'draft');
    case 'Deleted':
      return pages.filter(p => p.status === 'deleted');
    default:
      return pages;
  }
}

export function setupInlineEdit(li, page) {
  const titleEl = li.querySelector('.page-name');
  const saveTitle = async () => {
    const newTitle = titleEl.textContent.trim();
    if (newTitle && newTitle !== page.title) {
      try {
        await pageService.updateTitle(page, newTitle);
        page.title = newTitle;
      } catch (err) {
        await bpDialog.alert('Failed to update title: ' + err.message);
      }
    }
    titleEl.textContent = page.title;
  };
  const debouncedSaveTitle = debounce(saveTitle);
  titleEl.addEventListener('input', debouncedSaveTitle);
  titleEl.addEventListener('blur', () => {
    debouncedSaveTitle.cancel();
    saveTitle();
  });
  titleEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleEl.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      titleEl.textContent = page.title;
      titleEl.blur();
    }
  });

  const slugEl = li.querySelector('.page-slug');
  const saveSlug = async () => {
    const newSlug = sanitizeSlug(slugEl.textContent);
    if (newSlug !== page.slug) {
      try {
        await pageService.updateSlug(page, newSlug);
        page.slug = newSlug;
      } catch (err) {
        await bpDialog.alert('Failed to update slug: ' + err.message);
      }
    }
    slugEl.textContent = `/${page.slug}`;
  };
  const debouncedSaveSlug = debounce(saveSlug);
  slugEl.addEventListener('input', debouncedSaveSlug);
  slugEl.addEventListener('blur', () => {
    debouncedSaveSlug.cancel();
    saveSlug();
  });
  slugEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      slugEl.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      slugEl.textContent = `/${page.slug}`;
      slugEl.blur();
    }
  });
}

export async function render(el) {
  try {
    const pages = await fetchPages();
    renderPageList(el, pages);
  } catch (err) {
    el.innerHTML = `<div class="error">Error loading pages: ${escapeHtml(err.message)}</div>`;
  }
}

export function renderPageList(el, pages) {
  el.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'page-list-card';

  const titleBar = document.createElement('div');
  titleBar.className = 'page-title-bar';

  const title = document.createElement('div');
  title.className = 'page-title';
  title.textContent = 'Pages';

  const addBtn = document.createElement('img');
  addBtn.src = '/assets/icons/plus.svg';
  addBtn.alt = 'Add page';
  addBtn.title = 'Add new page';
  addBtn.className = 'icon add-page-btn';
  addBtn.addEventListener('click', async () => {
    const pageTitle = await bpDialog.prompt('New page title:');
    if (!pageTitle) return;
    const slugInput = await bpDialog.prompt('Slug (optional):');
    const slug = slugInput ? sanitizeSlug(slugInput) : '';
    try {
      await pageService.create({ title: pageTitle.trim(), slug });
      pages.splice(0, pages.length, ...(await fetchPages()));
      renderFilteredPages();
    } catch (err) {
      await bpDialog.alert('Error: ' + err.message);
    }
  });

  titleBar.appendChild(title);
  titleBar.appendChild(addBtn);
  card.appendChild(titleBar);

  const filters = ['All', 'Active', 'Drafts', 'Deleted'];
  let currentFilter = filters[0];

  const filterNav = document.createElement('nav');
  filterNav.className = 'page-filters';

  const list = document.createElement('ul');
  list.className = 'page-list';

  filters.forEach((filterName, idx) => {
    const filterEl = document.createElement('span');
    filterEl.className = 'filter';
    filterEl.textContent = filterName;
    if (idx === 0) filterEl.classList.add('active');
    filterEl.onclick = () => {
      filterNav.querySelectorAll('.filter').forEach(f => f.classList.remove('active'));
      filterEl.classList.add('active');
      currentFilter = filterName;
      renderFilteredPages();
    };
    filterNav.appendChild(filterEl);
  });

  card.appendChild(filterNav);
  card.appendChild(list);
  el.appendChild(card);

  function renderFilteredPages() {
    const filteredPages = filterPages(pages, currentFilter);
    list.innerHTML = '';
    if (!filteredPages.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No pages found.';
      list.appendChild(empty);
      return;
    }

    filteredPages.forEach(page => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="page-details">
          <div class="page-name-row">
            <span class="page-name" contenteditable="true">${escapeHtml(page.title)}</span>
            <span class="page-actions">
              ${page.is_start ? '<span class="home-indicator" title="Current home page">Home</span>' : window.featherIcon('setHome', 'set-home" title="Set as home')}
              ${window.featherIcon('edit', 'edit-page" title="Edit page')}
              ${window.featherIcon('pencil', 'edit-layout" title="Edit layout')}
              ${window.featherIcon(page.status === 'draft' ? 'draft' : 'published', 'toggle-draft" title="' + (page.status === 'draft' ? 'Mark as published' : 'Mark as draft') + '"')}
              ${window.featherIcon('external-link', 'view-page" title="Open page')}
              ${window.featherIcon('share', 'share-page" title="Share page link')}
              ${window.featherIcon('delete', 'delete-page" title="Delete page')}
            </span>
          </div>
          <div class="page-slug-row">
            <span class="page-slug" contenteditable="true">/${escapeHtml(page.slug)}</span>
            ${window.featherIcon('editSlug', 'edit-slug" title="Edit slug')}
          </div>
        </div>`;

      setupInlineEdit(li, page);

      const setHomeBtn = li.querySelector('.set-home');
      if (setHomeBtn) setHomeBtn.addEventListener('click', async () => {
        try {
          await pageService.setAsStart(page.id);
          pages.splice(0, pages.length, ...(await fetchPages()));
          renderFilteredPages();
        } catch (err) {
          await bpDialog.alert('Failed to set start page: ' + err.message);
        }
      });

      li.querySelector('.edit-page').addEventListener('click', () => editPage(page.id));
      li.querySelector('.edit-layout').addEventListener('click', () => editLayout(page));
      li.querySelector('.toggle-draft').addEventListener('click', async () => {
        const newStatus = page.status === 'draft' ? 'published' : 'draft';
        const prevStatus = page.status;
        page.status = newStatus;
        renderFilteredPages();
        try {
          await pageService.updateStatus(page, newStatus);
        } catch (err) {
          page.status = prevStatus;
          renderFilteredPages();
          await bpDialog.alert('Failed to update status: ' + err.message);
        }
      });
      li.querySelector('.view-page').addEventListener('click', () => viewPage(page));
      li.querySelector('.share-page').addEventListener('click', () => sharePage(page));
      li.querySelector('.delete-page').addEventListener('click', async () => {
        if (!(await bpDialog.confirm('Are you sure you want to delete this page?'))) return;
        try {
          await pageService.delete(page.id);
          const idx = pages.indexOf(page);
          if (idx > -1) pages.splice(idx, 1);
          renderFilteredPages();
        } catch (err) {
          await bpDialog.alert('Failed to delete page: ' + err.message);
        }
      });

      list.appendChild(li);
    });
  }

  renderFilteredPages();
}

async function editPage(id) {
  window.location.href = `/admin/pages/edit/${id}`;
}

async function editLayout(page) {
  const designer = await getDesignerAppName();
  if (designer) {
    const layout = page.meta?.layoutTemplate;
    const layoutParam = layout ? `&layout=${encodeURIComponent(layout)}` : '';
    window.location.href = `/admin/app/${encodeURIComponent(designer)}/${page.id}?layer=1${layoutParam}`;
  }
}

function viewPage(page) {
  window.open(`/${page.slug}`, '_blank');
}

async function sharePage(page) {
  const url = `${window.location.origin}/${page.slug}`;
  try {
    await navigator.clipboard.writeText(url);
    await bpDialog.alert('Page link copied to clipboard');
  } catch (err) {
    await bpDialog.alert(url);
  }
}
