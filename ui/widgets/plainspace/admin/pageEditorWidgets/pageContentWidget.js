import { bpDialog } from '../../../../shared/dialogs/bpDialog.js';
import { sanitizeHtml } from '../../../../shared/sanitize/sanitizer.js';
import { mountPageLayoutControl } from './pageLayoutControl.js';
import { mountLinkFeedback, htmlSourceLinks } from '../../../../shared/links/linkFeedback.js';
import { attachHtmlMeta, clearPageContentCache, detachHtmlMeta, errorMessage, fetchBuilderApps, fetchHtmlFile, fetchPublishedDesigns, listHtmlFiles, savePageContent, toPage, uploadHtmlFile } from './pageContentData.js';
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
    <section id="page-design" class="page-layout-control" aria-label="Page layout"></section>
    <header class="content-title-bar"><div><h3>Page content</h3><p>Manage the content shown inside this layout.</p></div></header>
    <details class="page-content-source"><summary>Edit HTML source</summary><label class="page-content-body"><span>Page content (HTML)</span><textarea rows="10" aria-label="Page content HTML" placeholder="<h1>Getting started</h1><p>Your content…</p>"></textarea></label><p>Place attached child content here: <code>&lt;div data-dynamic-host="true"&gt;&lt;/div&gt;</code>. Insert this marker at the desired position in your HTML.</p></details>
    <div class="page-content-actions"><button id="page-html-upload" type="button" class="button secondary sm" data-upload>Import HTML</button></div>
    <input type="file" accept=".html,.htm,text/html" hidden>
    <p class="page-content-feedback" role="status" aria-live="polite"></p>
    <div class="selected-content" aria-label="Attached content"></div>
    <details class="page-content-library"><summary>Choose another HTML file</summary><label id="page-html" class="page-content-search"><span class="bp-sr-only">Search available content</span><input type="search" placeholder="Search HTML files…" aria-label="Search available content"></label>
    <div class="page-content-library-status" aria-live="polite"></div>
    <div class="design-gallery" aria-label="Available content"></div></details>`;
    el.replaceChildren(root);
    if (window.location.hash === '#page-html')
        root.querySelector('.page-content-library').open = true;
    // Page-list shortcuts enter the existing attachment workflow and save owner.
    const entry = window.location.hash.slice(1);
    function focusEntry() {
        if (!['page-design', 'page-html', 'page-html-upload'].includes(entry))
            return;
        requestAnimationFrame(() => {
            const target = root.querySelector(`#${entry}`) || actions.querySelector(`#${entry}`);
            target?.scrollIntoView?.({ block: 'center' });
            const control = target?.matches('button') ? target : target?.querySelector('select, input');
            control?.focus();
        });
    }
    const selected = root.querySelector('.selected-content');
    const gallery = root.querySelector('.design-gallery');
    const feedback = root.querySelector('.page-content-feedback');
    const libraryStatus = root.querySelector('.page-content-library-status');
    const search = root.querySelector('input[type=search]');
    const fileInput = root.querySelector('input[type=file]');
    const actions = root.querySelector('.page-content-actions');
    const htmlInput = root.querySelector('.page-content-body textarea');
    htmlInput.value = page.html || '';
    const linkFeedback = mountLinkFeedback(root, { collect: () => htmlSourceLinks(htmlInput) });
    const cssLabel = document.createElement('label');
    cssLabel.className = 'page-content-body';
    cssLabel.textContent = 'Page content CSS';
    const cssInput = document.createElement('textarea');
    cssInput.rows = 6;
    cssInput.setAttribute('aria-label', 'Page content CSS');
    cssInput.value = page.css || '';
    cssLabel.append(cssInput);
    root.querySelector('.page-content-source').append(cssLabel);
    cssInput.addEventListener('input', () => { page.css = cssInput.value; options.onChange?.(); });
    let busy = false;
    let designs = [];
    let files = [];
    let libraryFailed = false;
    let loading = false;
    const layout = mountPageLayoutControl(root.querySelector('.page-layout-control'), {
        page, designs: () => designs,
        changed: async () => {
            if (options.onChange)
                options.onChange();
            else
                await apply({ html: page.html || '', meta: page.meta || {} });
            renderSelected();
        }
    });
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
        htmlInput.value = page.html;
        linkFeedback.schedule();
        options.onChange?.();
        message(options.onChange ? 'Content changed. Save the page to apply it.' : 'Content saved.');
        renderSelected();
        renderGallery();
    }
    async function canReplace() {
        return !page.html || bpDialog.confirm('Replace the attached content?', {
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
            await layout.set('design', id);
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
        title.textContent = page.html ? page.meta?.htmlFileName || 'Page content' : 'No page content yet';
        selected.append(title);
        if (!page.html)
            return;
        const detach = document.createElement('button');
        detach.type = 'button';
        detach.className = 'button ghost sm';
        detach.textContent = 'Detach';
        detach.addEventListener('click', () => void run(async () => {
            if (!(await bpDialog.confirm('Detach the content from this page?', { confirmLabel: 'Detach' })))
                return;
            await apply({ html: '', meta: detachHtmlMeta(page) });
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
        files.filter(name => name !== page.meta?.htmlFileName && name.toLowerCase().includes(query))
            .forEach(name => contentButton(name, 'HTML file', async () => {
            // Fetch file contents only when selected, not every HTML file on mount.
            await attach('html', name);
        }));
        if (!gallery.children.length && !loading && !libraryFailed) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = query ? 'No matching HTML files.' : 'No HTML files available. Write content above or upload a file.';
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
        layout.refresh();
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
    htmlInput.addEventListener('input', () => {
        page.html = htmlInput.value;
        page.meta = detachHtmlMeta(page);
        options.onChange?.();
        renderSelected();
    });
    if (!options.onChange) {
        const saveBody = document.createElement('button');
        saveBody.type = 'button';
        saveBody.className = 'button primary sm';
        saveBody.textContent = 'Save content';
        saveBody.addEventListener('click', () => void run(() => apply({ html: sanitizeHtml(htmlInput.value), meta: page.meta || {} })));
        htmlInput.parentElement?.append(saveBody);
    }
    el.addEventListener('page-content-saved', () => { if (root.isConnected)
        message(''); });
    renderSelected();
    // Focus attachment shortcuts after controls leave their loading/inert state.
    void loadLibrary().then(focusEntry);
    options.onController?.({
        read: () => ({ loading, busy, libraryFailed, error: feedback.dataset.errorCode ? feedback.textContent : null,
            linkFeedback: linkFeedback.read(),
            selected: { designId: page.meta?.designId || null, htmlFileName: page.meta?.htmlFileName || null }, layout: layout.read(),
            designs: designs.map(({ id, title }) => ({ id, title })), files }),
        // The caller supplies the common revision/draft/confirmation guard.
        attach: (kind, id) => attach(kind, id),
        detach: () => apply({ html: '', meta: detachHtmlMeta(page) }),
        setLayout: layout.set,
        setHtml: html => apply({ html: sanitizeHtml(html), meta: detachHtmlMeta(page) }),
        setCss: async (css) => { page.css = css; cssInput.value = css; await apply({ html: page.html || '', meta: page.meta || {} }); }
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
            link.className = builder.name === 'designer' ? 'button primary sm' : 'button secondary sm';
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
