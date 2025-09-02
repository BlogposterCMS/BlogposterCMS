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
  getActiveLayer,
  ensureCodeMap,
  getCurrentLayoutForLayer,
  capturePreview,
  updateAllWidgetContents,
  getAdminUserId
}) {
  const publishPopup = document.getElementById('publishPanel');
  publishPopup.classList.add('hidden');
  let slugInput, suggestionsEl, warningEl, draftWrap, draftCb, infoEl, draftNote, confirmBtn, closeBtn;
  let selectedPage = null;
  let creatingPage = false;
  fetchPartial('publish-panel', 'builder')
    .then(html => {
      publishPopup.innerHTML = sanitizeHtml(html);
      setupElements();
    })
    .catch(err => {
      console.warn('[Designer] Failed to load publish panel:', err);
      publishPopup.innerHTML = `
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
    slugInput = publishPopup.querySelector('.publish-slug-input');
    suggestionsEl = publishPopup.querySelector('.publish-suggestions');
    warningEl = publishPopup.querySelector('.publish-warning');
    draftWrap = publishPopup.querySelector('.publish-draft');
    draftCb = publishPopup.querySelector('.publish-draft-checkbox');
    infoEl = publishPopup.querySelector('.publish-info');
    draftNote = publishPopup.querySelector('.publish-draft-note');
    confirmBtn = publishPopup.querySelector('.publish-confirm');
    closeBtn = publishPopup.querySelector('.publish-close');

    slugInput.addEventListener('input', onSlugInput);
    suggestionsEl.addEventListener('click', onSuggestionClick);
    draftCb.addEventListener('change', onDraftToggle);
    publishBtn.addEventListener('click', togglePopup);
    closeBtn.addEventListener('click', hidePublishPopup);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !publishPopup.classList.contains('hidden')) {
        hidePublishPopup();
      }
    });

    confirmBtn.addEventListener('click', async () => {
      await loadPageService();
      const slug = sanitizeSlug(slugInput.value.trim());
      if (!slug) { alert('Enter a subpath'); return; }
      try {
        const name = nameInput.value.trim();
        if (creatingPage) {
          const newPage = await pageService.create({
            title: name || slug,
            slug,
            status: draftCb.checked ? 'draft' : 'published'
          });
          if (newPage?.id) {
            await pageService.update(newPage, {
              meta: { ...(newPage.meta || {}), layoutTemplate: name }
            });
          }
        } else if (selectedPage) {
          const patch = { meta: { ...(selectedPage.meta || {}), layoutTemplate: name }, status: 'published' };
          await pageService.update(selectedPage, patch);
        }
        await runPublish(slug);
        hidePublishPopup();
      } catch (err) {
        console.error('[Designer] publish flow error', err);
        alert('Publish failed: ' + err.message);
      }
    });
  }

  function positionPublishPopup() {
    const rect = publishBtn.getBoundingClientRect();
    publishPopup.style.top = `${rect.bottom}px`;
    publishPopup.style.height = `calc(100% - ${rect.bottom}px)`;
  }

  function showPublishPopup() {
    positionPublishPopup();
    publishPopup.classList.remove('hidden');
    slugInput.focus();
  }

  function hidePublishPopup() {
    publishPopup.classList.add('hidden');
  }

  function togglePopup() {
    if (publishPopup.classList.contains('hidden')) {
      showPublishPopup();
    } else {
      hidePublishPopup();
    }
  }

  window.addEventListener('resize', () => {
    if (!publishPopup.classList.contains('hidden')) positionPublishPopup();
  });

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
        lane: 'all',
        limit: 10
      });
      const pages = Array.isArray(res) ? res : (res.pages || res.rows || []);
      return pages;
    } catch (err) {
      console.warn('searchPages failed', err);
      return [];
    }
  }

  async function onSlugInput() {
    const qRaw = slugInput.value.trim();
    const q = sanitizeSlug(qRaw);
    selectedPage = null;
    creatingPage = false;
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
    suggestionsEl.innerHTML = suggestions + (exists ? '' : '<div class="publish-add">+ Add page</div>');
    if (!exists) {
      creatingPage = true;
      infoEl.textContent = 'Page will be created and design attached.';
      infoEl.classList.remove('hidden');
      draftWrap.classList.remove('hidden');
    }
  }

  async function onSuggestionClick(e) {
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
      selectedPage = page || null;
      creatingPage = false;
      infoEl.classList.add('hidden');
      draftWrap.classList.add('hidden');
      draftNote.classList.add('hidden');
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
    const layout = getCurrentLayoutForLayer(gridEl, getActiveLayer(), ensureCodeMap());
    const previewPath = await capturePreview();
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
    await meltdownEmit('saveLayoutTemplate', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'plainspace',
      name,
      lane: 'public',
      viewport: 'desktop',
      layout,
      previewPath
    });
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

