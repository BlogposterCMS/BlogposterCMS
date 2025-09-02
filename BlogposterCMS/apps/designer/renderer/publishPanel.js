import { fetchPartial } from '../fetchPartial.js';
import { sanitizeHtml } from '../../../public/plainspace/sanitizer.js';
import { wrapCss } from '../utils.js';

let pageService;
let sanitizeSlug;
async function loadPageService() {
  if (pageService && sanitizeSlug) return;
  try {
    const mod = await import(
      /* webpackIgnore: true */ '/plainspace/widgets/admin/defaultwidgets/pageList/pageService.js'
    );
    pageService = mod.pageService;
    sanitizeSlug = mod.sanitizeSlug;
  } catch (err) {
    console.warn('[Designer] pageService not available', err);
    sanitizeSlug = str => String(str).toLowerCase().replace(/[^a-z0-9\/-]+/g, '-').replace(/^-+|-+$/g, '');
  }
}

export function initPublishPanel({
  publishBtn,
  nameInput,
  gridEl,
  updateAllWidgetContents,
  getAdminUserId,
  saveDesign
}) {
  const publishPanel = document.getElementById('publishPanel');
  publishPanel.classList.add('hidden');
  let slugInput, suggestionsEl, warningEl, draftWrap, draftCb, infoEl, draftNote, confirmBtn, closeBtn;
  let selectedPage = null;
  fetchPartial('publish-panel', 'builder')
    .then(html => {
      publishPanel.innerHTML = sanitizeHtml(html);
      setupElements();
    })
    .catch(err => {
      console.warn('[Designer] Failed to load publish panel:', err);
      publishPanel.innerHTML = `
  <button class="publish-close" type="button" aria-label="Close">&times;</button>
  <label class="publish-slug-label">Subpath
    <input type="text" class="publish-slug-input" />
  </label>
  <div class="publish-suggestions"></div>
  <div class="publish-warning hidden"></div>
  <label class="publish-draft hidden"><input type="checkbox" class="publish-draft-checkbox" /> Create and set page to draft</label>
  <div class="publish-info hidden"></div>
  <div class="publish-actions"><button class="publish-confirm">Publish</button></div>
  <div class="publish-draft-note hidden"></div>`;
      setupElements();
    });
  loadPageService();

  function setupElements() {
    slugInput = publishPanel.querySelector('.publish-slug-input');
    suggestionsEl = publishPanel.querySelector('.publish-suggestions');
    warningEl = publishPanel.querySelector('.publish-warning');
    draftWrap = publishPanel.querySelector('.publish-draft');
    draftCb = publishPanel.querySelector('.publish-draft-checkbox');
    infoEl = publishPanel.querySelector('.publish-info');
    draftNote = publishPanel.querySelector('.publish-draft-note');
    confirmBtn = publishPanel.querySelector('.publish-confirm');
    closeBtn = publishPanel.querySelector('.publish-close');

    slugInput.addEventListener('input', onSlugInput);
    suggestionsEl.addEventListener('click', onSuggestionsClick);
    draftCb.addEventListener('change', onDraftToggle);
    publishBtn.addEventListener('click', togglePanel);
    closeBtn.addEventListener('click', hidePublishPanel);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !publishPanel.classList.contains('hidden')) {
        hidePublishPanel();
      }
    });

    confirmBtn.addEventListener('click', async () => {
      await loadPageService();
      const slug = sanitizeSlug(slugInput.value.trim());
      if (!slug || !selectedPage) { alert('Select a page'); return; }
      try {
        await saveDesign();
        const name = nameInput.value.trim();
        const patch = {
          meta: { ...(selectedPage.meta || {}), layoutTemplate: name },
          status: draftCb.checked ? 'draft' : 'published'
        };
        await pageService.update(selectedPage, patch);
        await runPublish(slug);
        hidePublishPanel();
      } catch (err) {
        console.error('[Designer] publish flow error', err);
        alert('Publish failed: ' + err.message);
      }
    });
  }

  function showPublishPanel() {
    publishPanel.classList.remove('hidden');
    slugInput.focus();
  }

  function hidePublishPanel() {
    publishPanel.classList.add('hidden');
  }

  function togglePanel() {
    if (publishPanel.classList.contains('hidden')) {
      showPublishPanel();
    } else {
      hidePublishPanel();
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  async function lookupPages(q) {
    try {
      const res = await meltdownEmit('searchPages', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'pagesManager',
        moduleType: 'core',
        query: q,
        lane: 'public',
        limit: 10
      });
      const pagesRaw = Array.isArray(res) ? res : (res.pages || res.rows || []);
      return pagesRaw.filter(p => p.lane === 'public');
    } catch (err) {
      console.warn('searchPages failed', err);
      return [];
    }
  }

  async function onSlugInput() {
    const qRaw = slugInput.value.trim();
    const q = sanitizeSlug(qRaw);
    selectedPage = null;
    suggestionsEl.innerHTML = '';
    warningEl.classList.add('hidden');
    infoEl.classList.add('hidden');
    draftWrap.classList.add('hidden');
    draftNote.classList.add('hidden');
    if (!q) return;
    const pages = await lookupPages(q);
    const suggestions = pages.map(p =>
      `<div class="publish-suggestion" data-id="${p.id}" data-slug="${escapeHtml(p.slug)}">/${escapeHtml(p.slug)}</div>`
    ).join('');
    const exists = pages.some(p => p.slug === q);
    suggestionsEl.innerHTML = suggestions + (exists ? '' : '<div class="publish-add">+ Create page</div>');
    if (!exists) {
      infoEl.textContent = 'Click "Create page" to add a new page with this slug.';
      infoEl.classList.remove('hidden');
    }
  }

  async function onSuggestionsClick(e) {
    const addEl = e.target.closest('.publish-add');
    if (addEl) {
      await loadPageService();
      const slug = sanitizeSlug(slugInput.value.trim());
      if (!slug) return;
      try {
        const title = nameInput.value.trim() || slug;
        const newPage = await pageService.create({ title, slug, status: 'published' });
        selectedPage = newPage;
        slugInput.value = slug;
        suggestionsEl.innerHTML = '';
        infoEl.textContent = 'Page created. You can set it to draft before publishing.';
        infoEl.classList.remove('hidden');
        draftWrap.classList.remove('hidden');
        draftCb.checked = false;
      } catch (err) {
        console.error('create page failed', err);
        alert('Page creation failed: ' + err.message);
      }
      return;
    }
    const el = e.target.closest('.publish-suggestion');
    if (!el) return;
    slugInput.value = el.dataset.slug;
    suggestionsEl.innerHTML = '';
    try {
      const res = await meltdownEmit('getPageById', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'pagesManager',
        moduleType: 'core',
        pageId: Number(el.dataset.id)
      });
      const page = res?.data ?? res;
      if (!page || page.lane !== 'public') {
        return;
      }
      selectedPage = page;
      infoEl.classList.add('hidden');
      draftWrap.classList.remove('hidden');
      draftNote.classList.add('hidden');
      draftCb.checked = page.status !== 'published';
      if (page && page.status !== 'published') {
        warningEl.textContent = 'Selected page is a draft';
        warningEl.classList.remove('hidden');
      } else {
        warningEl.classList.add('hidden');
      }
    } catch (err) {
      console.warn('getPageById failed', err);
    }
  }

  function onDraftToggle() {
    if (draftCb.checked) {
      draftNote.textContent = 'Page will be created as draft and will not be publicly accessible.';
      draftNote.classList.remove('hidden');
    } else {
      draftNote.classList.add('hidden');
    }
  }

  async function runPublish(subSlug) {
    const name = nameInput.value.trim();
    if (!name) { alert('Enter a name'); return; }
    updateAllWidgetContents();
    const safeName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '_');
    const normalizedSubPath = subSlug
      ? (subSlug.startsWith('builder/') ? subSlug : `builder/${subSlug}`)
      : `builder/${safeName}`;

    const gridClone = gridEl ? gridEl.cloneNode(true) : null;
    const externalStyles = [];
    const externalScripts = [];
    let jsContent = '';
    let cssContent = '';
    let bodyHtml = '';
    if (gridClone) {
      gridClone.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
        if (l.href) externalStyles.push(l.href);
        l.remove();
      });
      gridClone.querySelectorAll('script').forEach(s => {
        if (s.src) {
          externalScripts.push(s.src);
        } else {
          jsContent += s.textContent + '\n';
        }
        s.remove();
      });
      gridClone.querySelectorAll('style').forEach(st => {
        cssContent += st.textContent + '\n';
        st.remove();
      });
      bodyHtml = gridClone.innerHTML;
    }

    const theme = window.ACTIVE_THEME || 'default';
    const headLinks = [
      `<link rel="canonical" href="/${subSlug || `p/${safeName}`}">`,
      `<link rel="stylesheet" href="/themes/${theme}/theme.css">`,
      ...externalStyles.map(href => `<link rel="stylesheet" href="${href}">`)
    ];
    const files = [
      { fileName: 'index.html', data: `<!DOCTYPE html><html><head>${headLinks.join('')}</head><body>${bodyHtml}</body></html>` },
      { fileName: 'style.css', data: wrapCss(cssContent) },
      { fileName: 'script.js', data: jsContent },
      ...externalScripts.map((src, i) => ({ fileName: `external_${i}.js`, data: `import '${src}';` }))
    ];
    let existingMeta = null;
    try {
      existingMeta = await meltdownEmit('getPublishedDesignMeta', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        moduleType: 'core',
        name
      });
    } catch (err) {
      console.warn('[Designer] getPublishedDesignMeta', err);
    }
    try {
      await meltdownEmit('deleteLocalItem', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'mediaManager',
        moduleType: 'core',
        currentPath: existingMeta?.path ? existingMeta.path.split('/').slice(0, -1).join('/') : 'builder',
        itemName: existingMeta?.path ? existingMeta.path.split('/').pop() : safeName
      });
    } catch (err) {
      console.warn('[Designer] deleteLocalItem', err);
    }
    for (const f of files) {
      await meltdownEmit('uploadFileToFolder', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'mediaManager',
        moduleType: 'core',
        subPath: normalizedSubPath,
        fileName: f.fileName,
        fileData: btoa(unescape(encodeURIComponent(f.data)))
      });
    }
    const currentUserId = getAdminUserId();
    await meltdownEmit('makeFilePublic', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'mediaManager',
      moduleType: 'core',
      filePath: normalizedSubPath,
      ...(currentUserId ? { userId: currentUserId } : {})
    });
    await meltdownEmit('savePublishedDesignMeta', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'plainspace',
      moduleType: 'core',
      name,
      path: normalizedSubPath,
      files: files.map(f => f.fileName)
    });
  }
}

