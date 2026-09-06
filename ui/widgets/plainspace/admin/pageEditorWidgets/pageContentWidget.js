import { bpDialog } from '../../../../shared/dialogs/bpDialog.js';
import { sanitizeHtml } from '../../../../shared/sanitize/sanitizer.js';
import { attachDesignMeta, attachHtmlMeta, clearPageContentCache, detachDesignMeta, detachHtmlMeta, errorMessage, fetchBuilderApps, fetchHtmlFile, fetchPublishedDesigns, listHtmlFiles, savePageContent, toPage, uploadHtmlFile } from './pageContentData.js';
export async function render(el, options = {}) {
    if (!el)
        return;
    const emit = window.meltdownEmit;
    const jwt = window.ADMIN_TOKEN;
    const candidate = options.page || toPage(await window.pageDataPromise);
    if (!jwt || candidate?.id == null || typeof emit !== 'function') {
        el.innerHTML = '<p role="alert">PAGE_CONTENT_CONTEXT_MISSING: Open a page from Page Management.</p>';
        return;
    }
    const page = candidate;
    const root = document.createElement('section');
    root.className = 'page-content-widget';
    root.setAttribute('aria-label', 'Page content');
    root.innerHTML = `
    <header class="content-title-bar"><div><h3>Content</h3><p>Attach a published design or an HTML file.</p></div></header>
    <div class="page-content-actions"><button type="button" class="button secondary sm" data-upload>Upload HTML</button></div>
    <input type="file" accept=".html,.htm,text/html" hidden>
    <p class="page-content-feedback" role="status" aria-live="polite"></p>
    <div class="selected-content" aria-label="Attached content"></div>
    <label class="page-content-search"><span class="bp-sr-only">Search available content</span><input type="search" placeholder="Search designs and HTML files…" aria-label="Search available content"></label>
    <div class="page-content-library-status" aria-live="polite"></div>
    <div class="design-gallery" aria-label="Available content"></div>`;
    el.replaceChildren(root);
    const selected = root.querySelector('.selected-content');
    const gallery = root.querySelector('.design-gallery');
    const feedback = root.querySelector('.page-content-feedback');
    const libraryStatus = root.querySelector('.page-content-library-status');
    const search = root.querySelector('input[type=search]');
    const fileInput = root.querySelector('input[type=file]');
    const actions = root.querySelector('.page-content-actions');
    let busy = false;
    let designs = [];
    let files = [];
    let libraryFailed = false;
    let loading = false;
    function message(text, code = '') {
        feedback.textContent = code ? `${code}: ${text}` : text;
        feedback.dataset.errorCode = code;
        feedback.setAttribute('role', code ? 'alert' : 'status');
    }
    async function run(action, propagate = false) {
        if (busy)
            return;
        busy = true;
        options.onBusy?.(true);
        root.inert = true;
        root.setAttribute('aria-busy', 'true');
        try {
            await action();
        }
        catch (error) {
            message(errorMessage(error), 'PAGE_CONTENT_ACTION_FAILED');
            if (propagate)
                throw error;
        }
        finally {
            busy = false;
            root.inert = false;
            root.setAttribute('aria-busy', 'false');
            options.onBusy?.(false);
        }
    }
    async function apply(values) {
        if (!options.onChange) {
            await savePageContent(emit, jwt, page, values);
            clearPageContentCache(window.pageDataLoader, page);
        }
        page.html = values.html;
        page.meta = values.meta;
        options.onChange?.();
        message(options.onChange ? 'Content changed. Save the page to apply it.' : 'Content saved.');
        renderSelected();
        renderGallery();
    }
    async function canReplace() {
        return !(page.html || page.meta?.designId) || bpDialog.confirm('Replace the attached content?', {
            title: 'Replace content', confirmLabel: 'Replace'
        });
    }
    async function attach(kind, id) {
        if (loading)
            throw new Error('PAGE_CONTENT_BUSY: Wait for the content library.');
        if (kind === 'design') {
            const design = designs.find(item => String(item.id) === id);
            if (!design)
                throw new Error('PAGE_CONTENT_DESIGN_NOT_FOUND: Choose an available published design.');
            await apply({ html: '', meta: attachDesignMeta(page, design) });
        }
        else {
            if (!files.includes(id))
                throw new Error('PAGE_CONTENT_FILE_NOT_FOUND: Choose an available HTML file.');
            const html = sanitizeHtml(await fetchHtmlFile(fetch, id));
            await apply({ html, meta: attachHtmlMeta(page, id) });
        }
    }
    function renderSelected() {
        selected.replaceChildren();
        const designerLink = actions.querySelector('[data-builder="designer"]');
        if (designerLink)
            designerLink.href = builderUrl('designer');
        const title = document.createElement('strong');
        const hasDesign = page.meta?.designId != null;
        title.textContent = hasDesign ? page.meta?.designTitle || 'Attached design'
            : page.html ? page.meta?.htmlFileName || 'Attached HTML' : 'No content attached';
        selected.append(title);
        if (!hasDesign && !page.html)
            return;
        const detach = document.createElement('button');
        detach.type = 'button';
        detach.className = 'button ghost sm';
        detach.textContent = 'Detach';
        detach.addEventListener('click', () => void run(async () => {
            if (!(await bpDialog.confirm('Detach the content from this page?', { confirmLabel: 'Detach' })))
                return;
            await apply({ html: '', meta: hasDesign ? detachDesignMeta(page) : detachHtmlMeta(page) });
        }));
        selected.append(detach);
    }
    function contentButton(title, kind, select, thumbnail) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'design-card';
        button.setAttribute('aria-label', `Attach ${title}`);
        if (thumbnail) {
            const image = document.createElement('img');
            image.className = 'design-preview';
            image.src = thumbnail;
            image.alt = '';
            image.loading = 'lazy';
            button.append(image);
        }
        const label = document.createElement('strong');
        label.className = 'design-name';
        label.textContent = title;
        const type = document.createElement('span');
        type.textContent = kind;
        button.append(label, type);
        button.addEventListener('click', () => void run(async () => {
            if (await canReplace())
                await select();
        }));
        gallery.append(button);
    }
    function renderGallery() {
        gallery.replaceChildren();
        const query = search.value.trim().toLowerCase();
        designs.filter(design => design.id != null && String(design.id) !== String(page.meta?.designId))
            .filter(design => (design.title || 'Untitled design').toLowerCase().includes(query))
            .forEach(design => contentButton(design.title || 'Untitled design', 'Published design', async () => {
            await attach('design', String(design.id));
        }, design.thumbnail));
        files.filter(name => name !== page.meta?.htmlFileName && name.toLowerCase().includes(query))
            .forEach(name => contentButton(name, 'HTML file', async () => {
            // Fetch file contents only when selected, not every HTML file on mount.
            await attach('html', name);
        }));
        if (!gallery.children.length && !loading && !libraryFailed) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = query ? 'No matching content.' : 'No other published designs or HTML files available.';
            gallery.append(empty);
        }
    }
    async function loadLibrary() {
        if (loading)
            return;
        loading = true;
        libraryStatus.textContent = 'Loading available content…';
        libraryStatus.setAttribute('role', 'status');
        const results = await Promise.allSettled([fetchPublishedDesigns(emit, jwt), listHtmlFiles(emit, jwt)]);
        designs = results[0].status === 'fulfilled' ? results[0].value : [];
        files = results[1].status === 'fulfilled' ? results[1].value : [];
        libraryFailed = results.some(result => result.status === 'rejected');
        loading = false;
        libraryStatus.replaceChildren();
        if (libraryFailed) {
            libraryStatus.setAttribute('role', 'alert');
            libraryStatus.textContent = 'PAGE_CONTENT_LIBRARY_FAILED: Some content could not be loaded. ';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'button secondary sm';
            retry.textContent = 'Retry';
            retry.addEventListener('click', () => void loadLibrary());
            libraryStatus.append(retry);
        }
        renderGallery();
    }
    actions.querySelector('button').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file)
            return;
        void run(async () => {
            if (!/\.html?$/i.test(file.name))
                throw new Error('PAGE_CONTENT_FILE_TYPE: Choose an HTML file.');
            if (!(await canReplace()))
                return;
            const html = sanitizeHtml(await file.text());
            const name = await uploadHtmlFile(emit, jwt, file.name, html);
            if (!files.includes(name))
                files.push(name);
            await apply({ html, meta: attachHtmlMeta(page, name) });
        });
    });
    search.addEventListener('input', renderGallery);
    el.addEventListener('page-content-saved', () => { if (root.isConnected)
        message(''); });
    renderSelected();
    void loadLibrary();
    options.onController?.({
        read: () => ({ loading, busy, libraryFailed, error: feedback.dataset.errorCode ? feedback.textContent : null,
            selected: { designId: page.meta?.designId || null, htmlFileName: page.meta?.htmlFileName || null },
            designs: designs.map(({ id, title }) => ({ id, title })), files }),
        // The caller supplies the common revision/draft/confirmation guard.
        attach: (kind, id) => attach(kind, id),
        detach: () => apply({ html: '', meta: page.meta?.designId ? detachDesignMeta(page) : detachHtmlMeta(page) })
    });
    // Preserve installed builder discovery and the canonical Design Studio route.
    function builderUrl(name) {
        const adminBase = `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}`;
        const designId = page.meta?.designId;
        return name === 'designer'
            ? `${adminBase}/studio/design${designId != null ? `/${encodeURIComponent(String(designId))}` : ''}`
            : `${adminBase}/app/${encodeURIComponent(name)}/${encodeURIComponent(String(page.id))}`;
    }
    try {
        const builders = await fetchBuilderApps(emit, jwt);
        for (const builder of builders) {
            const link = document.createElement('a');
            link.className = 'button ghost sm';
            link.dataset.builder = builder.name;
            link.href = builderUrl(builder.name);
            link.textContent = builder.name === 'designer' ? 'Open Design Studio' : `Open ${builder.title || builder.name}`;
            actions.append(link);
        }
    }
    catch (error) {
        console.warn('PAGE_CONTENT_BUILDERS_FAILED', error);
        const warning = document.createElement('p');
        warning.textContent = 'PAGE_CONTENT_BUILDERS_FAILED: Builder shortcuts are unavailable.';
        warning.setAttribute('role', 'status');
        actions.append(warning);
    }
}
