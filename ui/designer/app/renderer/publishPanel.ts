// @ts-nocheck
import { fetchPartial } from '../fetchPartial.js';
import { sanitizeHtml } from '/ui/shared/sanitize/sanitizer.js';
import { wrapCss } from '../utils.js';
import { createLogger } from '../utils/logger';
import { emitAdminFacade } from '../runtime/runtimeFacade.js';
import { pageService, sanitizeSlug } from '/ui/widgets/plainspace/admin/defaultwidgets/pageList/pageService.js';

const publishLogger = createLogger('builder:publish');

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.pages)) return value.pages;
    if (Array.isArray(value.rows)) return value.rows;
  }
  return [];
}

function scalarString(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text && text !== 'null' && text !== 'undefined' ? text : '';
}

function pageMeta(page) {
  return page && typeof page.meta === 'object' && page.meta ? page.meta : {};
}

function pageDesignId(page) {
  const meta = pageMeta(page);
  return scalarString(meta.designId || meta.design_id || page?.designId || page?.design_id);
}

function pageLayoutTemplate(page) {
  const meta = pageMeta(page);
  return scalarString(meta.layoutTemplate || meta.layout_template || page?.layoutTemplate || page?.layout_template);
}

function sameRef(a, b) {
  return Boolean(a && b && scalarString(a).toLowerCase() === scalarString(b).toLowerCase());
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
  saveDesign,
  getDesignId = () => document.body.dataset.designId || null
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
    urlEl,
    usageStatusEl,
    usageListEl,
    usageRefreshBtn;
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
  <h2 class="publish-title">Publishing</h2>
  <p class="publish-subtitle">Publish this design and see where it is already used.</p>
  <section class="publish-usage" aria-label="Design usage">
    <div class="publish-section-heading">
      <h3>Used in</h3>
      <button class="publish-usage-refresh" type="button">Refresh</button>
    </div>
    <div class="publish-usage-status" role="status">Loading usage...</div>
    <div class="publish-usage-list"></div>
  </section>
  <h3 class="publish-section-title">Publish to page</h3>
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
    usageStatusEl = publishPanel.querySelector('.publish-usage-status');
    usageListEl = publishPanel.querySelector('.publish-usage-list');
    usageRefreshBtn = publishPanel.querySelector('.publish-usage-refresh');

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
    usageRefreshBtn?.addEventListener('click', () => {
      void refreshPublicationUsage();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !publishPanel.classList.contains('hidden')) {
        hidePublishPanel();
      }
    });

    confirmBtn.addEventListener('click', async () => {
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
        const saveResult = await saveDesign({
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
        const thumbnailUrl = typeof saveResult?.thumbnailUrl === 'string' && saveResult.thumbnailUrl
          ? saveResult.thumbnailUrl
          : selectedPage.meta?.designThumbnail;
        const meta = { ...(selectedPage.meta || {}), layoutTemplate: name };
        const savedDesignId = scalarString(saveResult?.id || saveResult?.designId || getDesignId?.());
        if (savedDesignId) {
          meta.designId = savedDesignId;
          meta.designTitle = name;
        }
        if (thumbnailUrl) meta.designThumbnail = thumbnailUrl;
        const patch = {
          meta,
          status: draftCb.checked ? 'draft' : 'published'
        };
        await pageService.update(selectedPage, patch);
        await runPublish(slug);
        showSuccessMessage(slug);
        void refreshPublicationUsage();
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
    void refreshPublicationUsage();
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
      const res = await emitAdminFacade(meltdownEmit, 'pages', 'search', {
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
      const res = await emitAdminFacade(meltdownEmit, 'pages', 'get', {
        pageId: id
      });
      const page = res?.data ?? res;
      return page && page.lane === 'public' ? page : null;
    } catch (err) {
      publishLogger.warn('getPageById failed', err);
      return null;
    }
  }

  function currentDesignName() {
    return scalarString(nameInput?.value || nameInput?.placeholder || '');
  }

  function currentDesignId() {
    return scalarString(getDesignId?.() || document.body.dataset.designId || '');
  }

  async function lookupPublishedMeta(name = currentDesignName()) {
    if (!name) return null;
    try {
      return await emitAdminFacade(meltdownEmit, 'plainSpace', 'publishedDesignMeta', {
        name
      });
    } catch (err) {
      publishLogger.warn('DESIGNER_PUBLICATION_META_LOAD_FAILED', err);
      return null;
    }
  }

  async function lookupPublicPages() {
    try {
      const res = await emitAdminFacade(meltdownEmit, 'pages', 'byLane', {
        lane: 'public'
      });
      return toArray(res).filter(page => (
        page &&
        typeof page === 'object' &&
        (!page.lane || page.lane === 'public')
      ));
    } catch (err) {
      publishLogger.warn('DESIGNER_PUBLICATION_USAGE_LOAD_FAILED', err);
      return [];
    }
  }

  function designUsagePages(pages, { designId = currentDesignId(), name = currentDesignName() } = {}) {
    return pages.filter(page => (
      sameRef(pageDesignId(page), designId) ||
      sameRef(pageLayoutTemplate(page), name)
    ));
  }

  function publicPageHref(page) {
    const slug = sanitizeSlug(page?.slug || '');
    return slug ? `/${slug}` : '';
  }

  function renderUsageItem({ title, meta, href, kind }) {
    const item = document.createElement(href ? 'a' : 'div');
    item.className = 'publish-usage-item';
    item.dataset.usageKind = kind || 'page';
    if (href) {
      item.href = href;
      item.target = '_blank';
      item.rel = 'noopener noreferrer';
    }
    item.innerHTML = `
      <span class="publish-usage-kind">${escapeHtml(kind || 'Page')}</span>
      <span class="publish-usage-copy">
        <strong>${escapeHtml(title || 'Untitled')}</strong>
        <small>${escapeHtml(meta || '')}</small>
      </span>
    `;
    return item;
  }

  function renderPublicationUsage(pages, publishedMeta = null) {
    if (!usageStatusEl || !usageListEl) return;
    const usedPages = designUsagePages(pages);
    const publishedPath = scalarString(publishedMeta?.path);
    usageListEl.innerHTML = '';
    usedPages.forEach(page => {
      const status = scalarString(page.status || 'draft');
      const slug = scalarString(page.slug);
      usageListEl.appendChild(renderUsageItem({
        title: page.title || slug || `Page ${page.id || ''}`,
        meta: `${status}${slug ? ` /${slug}` : ''}`,
        href: publicPageHref(page),
        kind: 'Page'
      }));
    });
    if (publishedPath) {
      const fileCount = Array.isArray(publishedMeta?.files) ? publishedMeta.files.length : 0;
      usageListEl.appendChild(renderUsageItem({
        title: 'Published bundle',
        meta: `${publishedPath}${fileCount ? ` · ${fileCount} files` : ''}`,
        href: `/media/${publishedPath.replace(/^\/+/, '')}/index.html`,
        kind: 'Bundle'
      }));
    }
    const parts = [];
    if (usedPages.length) parts.push(`${usedPages.length} page${usedPages.length === 1 ? '' : 's'}`);
    if (publishedPath) parts.push('published bundle');
    usageStatusEl.textContent = parts.length
      ? `Linked to ${parts.join(' and ')}.`
      : 'Not linked anywhere yet.';
    usageStatusEl.dataset.state = parts.length ? 'linked' : 'empty';
  }

  async function refreshPublicationUsage() {
    if (!usageStatusEl || !usageListEl) return;
    usageStatusEl.textContent = 'Loading usage...';
    usageStatusEl.dataset.state = 'loading';
    usageListEl.innerHTML = '';
    try {
      const [pages, publishedMeta] = await Promise.all([
        lookupPublicPages(),
        lookupPublishedMeta()
      ]);
      renderPublicationUsage(pages, publishedMeta);
    } catch (err) {
      publishLogger.warn('DESIGNER_PUBLICATION_USAGE_REFRESH_FAILED', err);
      usageStatusEl.textContent = 'Usage could not be loaded.';
      usageStatusEl.dataset.state = 'error';
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
    const filesToUpload = files.filter(file => file.data.trim().length > 0);
    const skippedFiles = files
      .filter(file => !filesToUpload.includes(file))
      .map(file => file.fileName);
    if (skippedFiles.length) {
      publishLogger.info('Skipping upload for empty bundles', skippedFiles);
    }
    let existingMeta = null;
    try {
      existingMeta = await emitAdminFacade(meltdownEmit, 'plainSpace', 'publishedDesignMeta', {
        name
      });
    } catch (err) {
      publishLogger.warn('getPublishedDesignMeta failed', err);
    }
    try {
      await emitAdminFacade(meltdownEmit, 'media', 'deleteLocalItem', {
        currentPath: existingMeta?.path ? existingMeta.path.split('/').slice(0, -1).join('/') : 'builder',
        itemName: existingMeta?.path ? existingMeta.path.split('/').pop() : safeName
      });
    } catch (err) {
      publishLogger.warn('deleteLocalItem failed', err);
    }
    for (const f of filesToUpload) {
      await emitAdminFacade(meltdownEmit, 'media', 'uploadToFolder', {
        subPath: normalizedSubPath,
        fileName: f.fileName,
        fileData: btoa(unescape(encodeURIComponent(f.data)))
      });
    }
    const currentUserId = getAdminUserId();
    await emitAdminFacade(meltdownEmit, 'media', 'makeFilePublic', {
      filePath: normalizedSubPath,
      ...(currentUserId ? { userId: currentUserId } : {})
    });
    await emitAdminFacade(meltdownEmit, 'plainSpace', 'savePublishedDesignMeta', {
      name,
      path: normalizedSubPath,
      files: filesToUpload.map(f => f.fileName)
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
