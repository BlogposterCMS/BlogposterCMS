import { fetchPartial } from '../fetchPartial.js';
import { sanitizeHtml } from '../../../public/plainspace/sanitizer.js';
import { wrapCss } from '../utils.js';
import { createLogger } from '../utils/logger';

const publishLogger = createLogger('builder:publish');

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
    publishLogger.warn('pageService not available', err);
    sanitizeSlug = str => String(str).toLowerCase().replace(/[^a-z0-9\/-]+/g, '-').replace(/^-+|-+$/g, '');
  }
}

export function initPublishPanel({
  publishBtn,
  nameInput,
  gridEl,
  layoutRoot,
  updateAllWidgetContents,
  getAdminUserId,
  getCurrentLayoutForLayer,
  getActiveLayer,
  ensureCodeMap,
  capturePreview,
  pageId,
  saveDesign
}) {
  const publishPanel = document.getElementById('publishPanel');
  if (!publishPanel) {
    publishLogger.warn('publish panel container not found');
    return;
  }
  publishPanel.classList.add('hidden');
  publishPanel.setAttribute('aria-hidden', 'true');
  let slugInput,
    suggestionsEl,
    warningEl,
    draftWrap,
    draftCb,
    infoEl,
    draftNote,
    confirmBtn,
    closeBtn,
    urlEl;
  let selectedPage = null;
  fetchPartial('publish-panel', 'builder')
    .then(html => {
      publishPanel.innerHTML = sanitizeHtml(html);
      setupElements();
    })
    .catch(err => {
      publishLogger.warn('Failed to load publish panel', err);
      publishPanel.innerHTML = `
  <button class="publish-close" type="button" aria-label="Close">&times;</button>
  <h2 class="publish-title">Publish this design</h2>
  <label class="publish-slug-label">Slug
    <div class="publish-slug-wrap">
      <span class="slug-prefix" aria-hidden="true">/</span>
      <input type="text" class="publish-slug-input" />
    </div>
  </label>
  <div class="publish-suggestions builder-options-menu"></div>
  <div class="publish-warning hidden"></div>
  <label class="publish-draft hidden"><input type="checkbox" class="publish-draft-checkbox" /> Set page to draft</label>
  <div class="publish-info hidden"></div>
  <div class="publish-actions">
    <button class="publish-settings" type="button">Settings</button>
    <button class="publish-confirm">Publish</button>
  </div>
  <div class="publish-draft-note hidden"></div>`;
      setupElements();
    });
  loadPageService();

  function hideSuggestions() {
    if (!suggestionsEl) return;
    suggestionsEl.classList.remove('show');
    document.removeEventListener('click', outsideSuggestionsHandler);
    suggestionsEl.style.top = '';
    suggestionsEl.style.left = '';
    suggestionsEl.style.minWidth = '';
    suggestionsEl.style.width = '';
  }

  function outsideSuggestionsHandler(e) {
    if (!suggestionsEl || !slugInput) return;
    if (!suggestionsEl.contains(e.target) && e.target !== slugInput) hideSuggestions();
  }

  function showSuggestions() {
    if (!suggestionsEl || !slugInput) return;
    const rect = slugInput.getBoundingClientRect();
    suggestionsEl.classList.add('show');
    suggestionsEl.style.visibility = 'hidden';
    suggestionsEl.style.top = `${rect.bottom + 4}px`;
    suggestionsEl.style.left = `${rect.left}px`;
    suggestionsEl.style.minWidth = `${rect.width}px`;
    suggestionsEl.style.width = `${rect.width}px`;
    suggestionsEl.style.visibility = '';
    document.addEventListener('click', outsideSuggestionsHandler);
  }

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
    urlEl = publishPanel.querySelector('.publish-url');

    if (warningEl) {
      warningEl.setAttribute('role', 'alert');
      warningEl.setAttribute('tabindex', '-1');
    }
    if (infoEl) {
      infoEl.setAttribute('role', 'status');
      infoEl.setAttribute('tabindex', '-1');
    }

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
      if (!slug) {
        showWarning('Select a slug.', { focusEl: slugInput });
        return;
      }
      try {
        if (!selectedPage) {
          const pages = await lookupPages(slug);
          const existing = pages.find(p => p.slug === slug);
          if (existing) {
            const full = await getPageById(existing.id);
            if (!full) {
              showWarning('Failed to load existing page data. Please try again.', {
                focusEl: slugInput
              });
              return;
            }
            selectedPage = full;
            draftCb.checked = selectedPage.status !== 'published';
          } else {
            const title = nameInput.value.trim() || slug;
            const status = draftCb.checked ? 'draft' : 'published';
            const { pageId } = await pageService.create({ title, slug, status });
            selectedPage = {
              id: pageId,
              slug,
              status,
              lane: 'public',
              language: 'en',
              title,
              meta: {}
            };
          }
        }

        const name = nameInput.value.trim();
        await saveDesign({
          name,
          gridEl,
          layoutRoot,
          getCurrentLayoutForLayer,
          getActiveLayer,
          ensureCodeMap,
          capturePreview,
          updateAllWidgetContents,
          ownerId: getAdminUserId(),
          pageId
        });
        const patch = {
          meta: { ...(selectedPage.meta || {}), layoutTemplate: name },
          status: draftCb.checked ? 'draft' : 'published'
        };
        await pageService.update(selectedPage, patch);
        await runPublish(slug);
        showSuccessMessage(slug);
      } catch (err) {
        if (err?.isValidationError) return;
        publishLogger.error('publish flow error', err);
        showWarning(`Publish failed: ${err?.message || err}`, { focusEl: confirmBtn });
      }
    });
  }

  function showPublishPanel() {
    publishPanel.classList.remove('hidden');
    publishPanel.setAttribute('aria-hidden', 'false');
    clearWarning();
    clearInfo();
    draftNote.classList.add('hidden');
    draftNote.textContent = '';
    slugInput.focus();
  }

  function hidePublishPanel() {
    publishPanel.classList.add('hidden');
    publishPanel.setAttribute('aria-hidden', 'true');
    hideSuggestions();
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
      publishLogger.warn('searchPages failed', err);
      return [];
    }
  }

  async function getPageById(id) {
    try {
      const res = await meltdownEmit('getPageById', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'pagesManager',
        moduleType: 'core',
        pageId: id
      });
      const page = res?.data ?? res;
      return page && page.lane === 'public' ? page : null;
    } catch (err) {
      publishLogger.warn('getPageById failed', err);
      return null;
    }
  }

  async function onSlugInput() {
    const qRaw = slugInput.value.trim();
    const q = sanitizeSlug(qRaw);
    selectedPage = null;
    suggestionsEl.innerHTML = '';
    clearWarning();
    clearInfo();
    draftWrap.classList.add('hidden');
    draftNote.classList.add('hidden');
    hideSuggestions();
    if (urlEl) {
      if (q) {
        urlEl.textContent = `${window.location.origin}/${q}`;
        urlEl.classList.remove('hidden');
      } else {
        urlEl.classList.add('hidden');
        urlEl.textContent = '';
      }
    }
    if (!q) return;
    const pages = await lookupPages(q);
    const suggestions = pages
      .map(p => `<div class="publish-suggestion" data-id="${p.id}" data-slug="${escapeHtml(p.slug)}">/${escapeHtml(p.slug)}</div>`)
      .join('');
    const exists = pages.some(p => p.slug === q);
    suggestionsEl.innerHTML = suggestions;
    if (suggestionsEl.innerHTML) {
      showSuggestions();
    }
    if (exists) {
      const page = pages.find(p => p.slug === q);
      const full = await getPageById(page.id);
      selectedPage = full || null;
      if (!selectedPage) {
        showWarning('Failed to load page data. Please try again.', { focusEl: slugInput });
        return;
      }
      draftWrap.classList.remove('hidden');
      const isDraft = selectedPage.status !== 'published';
      draftCb.checked = isDraft;
      if (isDraft) {
        showWarning('Selected page is a draft');
      } else {
        clearWarning();
      }
    } else {
      setInfo('Page will be created when published.');
    }
  }

  async function onSuggestionsClick(e) {
    const el = e.target.closest('.publish-suggestion');
    if (!el) return;
    slugInput.value = el.dataset.slug;
    suggestionsEl.innerHTML = '';
    hideSuggestions();
    const page = await getPageById(Number(el.dataset.id));
    if (!page) return;
    selectedPage = page;
    clearInfo();
    draftWrap.classList.remove('hidden');
    draftNote.classList.add('hidden');
    const isDraft = page.status !== 'published';
    draftCb.checked = isDraft;
    if (isDraft) {
      showWarning('Selected page is a draft');
    } else {
      clearWarning();
    }
  }

  function onDraftToggle() {
    if (draftCb.checked) {
      draftNote.textContent = 'Page will be unpublished and will not be publicly accessible.';
      draftNote.classList.remove('hidden');
    } else {
      draftNote.classList.add('hidden');
      draftNote.textContent = '';
    }
  }

  async function runPublish(subSlug) {
    const name = nameInput.value.trim();
    if (!name) {
      showWarning('Enter a name.', { focusEl: nameInput });
      const validationError = new Error('Missing design name');
      validationError.isValidationError = true;
      throw validationError;
    }
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
      publishLogger.warn('getPublishedDesignMeta failed', err);
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
      publishLogger.warn('deleteLocalItem failed', err);
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
  function showWarning(message, { focusEl } = {}) {
    if (!warningEl) return;
    if (message) {
      warningEl.textContent = message;
      warningEl.classList.remove('hidden');
      if (focusEl && typeof focusEl.focus === 'function') {
        focusEl.focus();
      }
    } else {
      warningEl.textContent = '';
      warningEl.classList.add('hidden');
    }
  }

  function clearWarning() {
    showWarning('');
  }

  function setInfo(message, options = {}) {
    if (!infoEl) return;
    const { link } = options;
    if (!message) {
      infoEl.textContent = '';
      infoEl.classList.add('hidden');
      infoEl.removeAttribute('data-variant');
      return;
    }
    infoEl.textContent = '';
    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    infoEl.appendChild(msgSpan);
    if (link) {
      const linkEl = document.createElement('a');
      linkEl.href = link.href;
      if (link.target) linkEl.target = link.target;
      if (link.rel) linkEl.rel = link.rel;
      linkEl.textContent = link.text;
      linkEl.classList.add('publish-info-link');
      infoEl.appendChild(document.createTextNode(' '));
      infoEl.appendChild(linkEl);
    }
    if (options.variant) {
      infoEl.dataset.variant = options.variant;
    } else {
      infoEl.removeAttribute('data-variant');
    }
    infoEl.classList.remove('hidden');
  }

  function clearInfo() {
    setInfo('');
  }

  function showSuccessMessage(slug) {
    clearWarning();
    setInfo('Design published successfully.', {
      link: {
        href: `/${slug}`,
        text: 'Open page in new tab',
        target: '_blank',
        rel: 'noopener noreferrer'
      },
      variant: 'success'
    });
    if (infoEl) {
      infoEl.focus?.();
    }
  }
}
